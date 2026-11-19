-- Device "I'm on" signal (migration 20261226000001_device_ping): someone inside the salon can ping its device and
-- last_seen moves; an outsider can't; an archived device can't. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000af01', '14085550921', 'authenticated', 'authenticated'),  -- platform admin
  ('00000000-0000-0000-0000-00000000af02', '14085550922', 'authenticated', 'authenticated'),  -- salon owner
  ('00000000-0000-0000-0000-00000000af03', '14085550923', 'authenticated', 'authenticated');  -- someone else
insert into public.platform_admins (auth_user_id, note) values ('00000000-0000-0000-0000-00000000af01', 'test admin');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000af01","role":"authenticated"}', true);
insert into t_out select 'made', public.admin_create_salon('Ping Nails', 'CA', 'Pia Owner', '+14085550922');

-- owner joins and sets up a salon device
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000af02","role":"authenticated","phone":"14085550922"}', true);
select public.claim_memberships();
insert into t_out select 'dev', to_jsonb(public.register_device(((select v from t_out where k = 'made')->>'salon_id')::uuid, 'Front desk iPad', 'front_desk'));

-- the device has been off for two days
reset role;
update public.devices set last_seen = now() - interval '2 days' where id = (select v #>> '{}' from t_out where k = 'dev')::uuid;
set local role authenticated;

-- someone else: refused, nothing moves
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000af03","role":"authenticated","phone":"14085550923"}', true);
do $$ declare did uuid := (select v #>> '{}' from t_out where k = 'dev')::uuid; begin
  if public.device_ping(did) then raise exception 'FAIL: outsider pinged a device'; end if;
  if public.device_ping(gen_random_uuid()) then raise exception 'FAIL: ping of a device that does not exist'; end if;
end $$;
reset role;
do $$ begin
  if (select last_seen from public.devices where id = (select v #>> '{}' from t_out where k = 'dev')::uuid) > now() - interval '1 day' then raise exception 'FAIL: outsider moved last_seen'; end if;
end $$;
set local role authenticated;

-- inside the salon: the ping lands and the admin sees the device as on
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000af02","role":"authenticated","phone":"14085550922"}', true);
do $$ declare did uuid := (select v #>> '{}' from t_out where k = 'dev')::uuid; begin
  if not public.device_ping(did) then raise exception 'FAIL: member ping refused'; end if;
  if not public.device_ping(did) then raise exception 'FAIL: second ping refused'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000af01","role":"authenticated"}', true);
do $$ declare sid uuid := ((select v from t_out where k = 'made')->>'salon_id')::uuid; begin
  if not exists (select 1 from jsonb_array_elements(public.admin_health()->'salons') x where (x->>'salon_id')::uuid = sid and (x->>'devices_online')::int = 1)
    then raise exception 'FAIL: device not on after ping'; end if;
end $$;

-- signed out by the owner: no more pings
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000af02","role":"authenticated","phone":"14085550922"}', true);
do $$ declare did uuid := (select v #>> '{}' from t_out where k = 'dev')::uuid; begin
  perform public.device_archive(did);
  if public.device_ping(did) then raise exception 'FAIL: archived device pinged'; end if;
end $$;

select 'PASS: device ping' as result;
rollback;
