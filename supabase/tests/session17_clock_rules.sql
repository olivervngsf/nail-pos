-- Clock-in rules: phones can't clock in by default; QR works only with the current code; Wi-Fi only from a saved
-- salon address; refused tries are logged; the old open clock_self is closed to the app. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000c101', '14085557001', 'authenticated', 'authenticated'),   -- owner
  ('00000000-0000-0000-0000-00000000c102', '14085557002', 'authenticated', 'authenticated');   -- tech
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'no_self_serve_salon') then alter table public.salons disable trigger no_self_serve_salon; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c101","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000090a1', 'ownerName', 'Mai', 'salonName', 'Clock Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000907b', 'name', 'Kim', 'phone', '+14085557002', 'role', 'tech'))));
insert into t_out values ('qr', public.clock_qr('00000000-0000-0000-0000-0000000090a1'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c102","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin perform public.clock_self('00000000-0000-0000-0000-0000000090a1', 'in'); raise exception 'FAIL: clock_self still open';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.clock_rules_save('00000000-0000-0000-0000-0000000090a1', 'qr'); raise exception 'FAIL: tech changed rules';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end $$;
reset role;

set local role service_role;
-- default rule = off: refused even with a good code
insert into t_out values ('off', public._clock_phone('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-0000000090a1', 'in', '203.0.113.9', (select v->>'code' from t_out where k = 'qr')));
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c101","role":"authenticated"}', true);
select public.clock_rules_save('00000000-0000-0000-0000-0000000090a1', 'qr_or_wifi');
reset role;

set local role service_role;
insert into t_out values ('wifi_add', public._clock_wifi_add('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000090a1', '203.0.113.9', 'Front Wi-Fi'));
insert into t_out values ('tech_wifi_add', public._clock_wifi_add('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-0000000090a1', '198.51.100.1', 'Home'));
insert into t_out values ('bad_code', public._clock_phone('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-0000000090a1', 'in', '198.51.100.1', 'WRONG12345'));
insert into t_out values ('home', public._clock_phone('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-0000000090a1', 'in', '198.51.100.1', ''));
insert into t_out values ('by_qr', public._clock_phone('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-0000000090a1', 'in', '198.51.100.1', (select v->>'code' from t_out where k = 'qr')));
insert into t_out values ('by_wifi', public._clock_phone('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-0000000090a1', 'out', '203.0.113.9, 10.0.0.1', ''));
reset role;

do $$ declare o jsonb := (select jsonb_object_agg(k, v) from t_out); begin
  if length(o->'qr'->>'code') <> 10 then raise exception 'FAIL qr code: %', o->'qr'; end if;
  if (o->'off'->>'ok')::boolean or o->'off'->>'reason' <> 'phones_off' then raise exception 'FAIL off: %', o->'off'; end if;
  if jsonb_array_length(o->'wifi_add'->'wifi') <> 1 then raise exception 'FAIL wifi add: %', o->'wifi_add'; end if;
  if o->'tech_wifi_add'->>'error' is null then raise exception 'FAIL tech saved wifi: %', o->'tech_wifi_add'; end if;
  if (o->'bad_code'->>'ok')::boolean or o->'bad_code'->>'reason' <> 'qr_old' then raise exception 'FAIL bad code: %', o->'bad_code'; end if;
  if (o->'home'->>'ok')::boolean then raise exception 'FAIL home allowed: %', o->'home'; end if;
  if not (o->'by_qr'->>'ok')::boolean or o->'by_qr'->>'via' <> 'qr' then raise exception 'FAIL qr: %', o->'by_qr'; end if;
  if not (o->'by_wifi'->>'ok')::boolean or o->'by_wifi'->>'via' <> 'wifi' then raise exception 'FAIL wifi: %', o->'by_wifi'; end if;
  if (select count(*) from public.clock_events where salon_id = '00000000-0000-0000-0000-0000000090a1') <> 2 then raise exception 'FAIL events'; end if;
  if (select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000090a1' and action = 'clock.refused') <> 3 then raise exception 'FAIL refused log'; end if;
  if exists (select 1 from public.clock_events where salon_id = '00000000-0000-0000-0000-0000000090a1' and via is null) then raise exception 'FAIL via missing'; end if;
end $$;
select 'PASS: clock-in rules' as result;
rollback;
