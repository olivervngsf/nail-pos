-- Session 1 flows in SQL: owner saves setup with a tech invite; tech signs in and is linked; PIN rules;
-- salon device; 5 wrong PINs lock; clock in by PIN and by phone; invite readable by code. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000aa01', '14085550101', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000aa02', '14085550102', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
-- owner
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object(
  'salonId', '00000000-0000-0000-0000-0000000005a1', 'ownerName', 'Mai', 'salonName', 'Test Nails', 'state', 'CA', 'step', 3,
  'hours', jsonb_build_array(jsonb_build_object('on', true, 'open', '09:00', 'close', '19:00')),
  'services', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000005e1', 'cat', 'Gel', 'name', 'Gel mani', 'minutes', 45, 'priceCents', 4500, 'on', true)),
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000057f', 'name', 'Linh', 'phone', '+14085550102', 'role', 'tech', 'payType', 'commission', 'commissionPct', 60, 'inviteCode', 'ABCDE'))));
-- saving twice is safe
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000005a1', 'salonName', 'Test Nails 2', 'step', 4,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000057f', 'name', 'Linh Tran', 'phone', '+14085550102', 'role', 'tech', 'inviteCode', 'ABCDE'))));
insert into t_out values ('owner_ms', (select to_jsonb(array_agg(role)) from public.my_memberships()));
insert into t_out values ('device', to_jsonb(public.register_device('00000000-0000-0000-0000-0000000005a1', 'Front desk iPad')));

-- invite readable by anyone with the code
reset role; set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into t_out values ('invite', (select to_jsonb(i) from public.get_invite('abcde') i));

-- tech signs in: linked by phone, sets PIN
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa02","role":"authenticated"}', true);
insert into t_out values ('claimed', to_jsonb(public.claim_memberships()));
insert into t_out values ('tech_ms', (select to_jsonb(m) from public.my_memberships() m));
do $$ begin perform public.set_my_pin('00000000-0000-0000-0000-0000000005a1', '123456'); raise exception 'FAIL: weak pin accepted';
exception when others then if sqlerrm not like '%weak pin%' then raise; end if; end $$;
select public.set_my_pin('00000000-0000-0000-0000-0000000005a1', '258013');
insert into t_out values ('self_clock', to_jsonb(public.clock_self('00000000-0000-0000-0000-0000000005a1', 'in')));

-- back on the salon device (owner session): wrong PIN 5 times locks
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}', true);
insert into t_out select 'ok_pin', public.pin_clock((select (v#>>'{}')::uuid from t_out where k = 'device'), '00000000-0000-0000-0000-00000000057f', '258013', 'out');
insert into t_out select 'wrong' || g, public.pin_unlock((select (v#>>'{}')::uuid from t_out where k = 'device'), '00000000-0000-0000-0000-00000000057f', '999999') from generate_series(1, 5) g;
insert into t_out select 'after_lock', public.pin_unlock((select (v#>>'{}')::uuid from t_out where k = 'device'), '00000000-0000-0000-0000-00000000057f', '258013');
insert into t_out values ('staff', (select jsonb_agg(to_jsonb(s)) from public.today_staff('00000000-0000-0000-0000-0000000005a1') s));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'owner_ms' <> '["owner"]' then raise exception 'FAIL owner memberships: %', o->'owner_ms'; end if;
  if o->'invite'->>'salon_name' <> 'Test Nails 2' or o->'invite'->>'display_name' <> 'Linh Tran' or o->'invite'->>'status' <> 'open' or o->'invite'->>'phone_last4' <> '0102'
    then raise exception 'FAIL invite: %', o->'invite'; end if;
  if (o->>'claimed')::int <> 1 or o->'tech_ms'->>'role' <> 'tech' then raise exception 'FAIL claim: % %', o->'claimed', o->'tech_ms'; end if;
  if (o->'ok_pin'->>'ok')::boolean is not true then raise exception 'FAIL good pin: %', o->'ok_pin'; end if;
  if o->'wrong1'->>'reason' <> 'wrong' or (o->'wrong1'->>'tries_left')::int <> 4 then raise exception 'FAIL wrong1: %', o->'wrong1'; end if;
  if o->'wrong5'->>'reason' <> 'locked' then raise exception 'FAIL 5th wrong should lock: %', o->'wrong5'; end if;
  if o->'after_lock'->>'reason' <> 'locked' then raise exception 'FAIL right pin while locked: %', o->'after_lock'; end if;
  if (select count(*) from public.clock_events where membership_id = '00000000-0000-0000-0000-00000000057f') <> 2 then raise exception 'FAIL clock events'; end if;
  if (select count(*) from public.services where salon_id = '00000000-0000-0000-0000-0000000005a1' and archived_at is null) <> 1 then raise exception 'FAIL services kept'; end if;
  if (select used_at is null from public.invites where code = 'ABCDE') then raise exception 'FAIL invite not marked used'; end if;
  if (select pin_hash from public.memberships where id = '00000000-0000-0000-0000-00000000057f') like '%2580%' then raise exception 'FAIL pin stored readable'; end if;
end $$;
select 'PASS: session 1 accounts' as result;
rollback;
