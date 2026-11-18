-- QR device set-up: owner makes a code → server claims it for a new device login → the device sees only its salon,
-- by job (front desk = desk rights, time clock = member only), PINs work on it, codes are one-use, a tech or a device
-- can't make codes, and the owner signing the device out cuts it off. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000dc01', '14085553001', 'authenticated', 'authenticated'),   -- owner
  ('00000000-0000-0000-0000-00000000dc02', '14085553002', 'authenticated', 'authenticated');   -- tech
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000dd01', 'device-1@devices.polishosapp.com', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000dd02', 'device-2@devices.polishosapp.com', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'no_self_serve_salon') then alter table public.salons disable trigger no_self_serve_salon; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000070a1', 'ownerName', 'Mai', 'salonName', 'QR Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000707b', 'name', 'Kim', 'phone', '+14085553002', 'role', 'tech'))));
insert into t_out values ('desk_code', public.device_code_make('00000000-0000-0000-0000-0000000070a1', 'front_desk', 'Front iPad'));
insert into t_out values ('clock_code', public.device_code_make('00000000-0000-0000-0000-0000000070a1', 'clock', 'Back tablet'));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dc02","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin perform public.device_code_make('00000000-0000-0000-0000-0000000070a1', 'clock', 'x'); raise exception 'FAIL: tech made a code';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end $$;
reset role;

set local role service_role;
insert into t_out values ('desk', public._device_claim((select v->>'code' from t_out where k = 'desk_code'), '00000000-0000-0000-0000-00000000dd01'));
insert into t_out values ('clock', public._device_claim((select v->>'code' from t_out where k = 'clock_code'), '00000000-0000-0000-0000-00000000dd02'));
do $$ begin perform public._device_claim((select v->>'code' from t_out where k = 'desk_code'), '00000000-0000-0000-0000-00000000dd02'); raise exception 'FAIL: code used twice';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd01","role":"authenticated"}', true);
do $$ declare s uuid := '00000000-0000-0000-0000-0000000070a1'; begin
  if not (public.is_member(s) and public.is_admin(s) and public._is_desk(s)) then raise exception 'FAIL: front desk rights'; end if;
  if (select count(*) from public.my_memberships()) <> 1 or (select membership_id from public.my_memberships()) is not null then raise exception 'FAIL: device membership row'; end if;
  perform public.device_code_make(s, 'clock', 'x'); raise exception 'FAIL: device made a code';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd02","role":"authenticated"}', true);
do $$ declare s uuid := '00000000-0000-0000-0000-0000000070a1'; begin
  if not public.is_member(s) or public.is_admin(s) or public._is_desk(s) then raise exception 'FAIL: time clock rights'; end if;
  if (public.my_device()->>'kind') <> 'clock' then raise exception 'FAIL: my_device'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dc01","role":"authenticated"}', true);
do $$ begin
  if not (public.device_code_check((select v->>'code' from t_out where k = 'desk_code'))->>'used')::boolean then raise exception 'FAIL: check used'; end if;
end $$;
select public.device_archive((select (v->>'id')::uuid from t_out where k = 'clock'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd02","role":"authenticated"}', true);
do $$ begin if public.is_member('00000000-0000-0000-0000-0000000070a1') then raise exception 'FAIL: signed-out device still in'; end if; end $$;
reset role;
select 'session13_device_qr ok' as result;
rollback;
