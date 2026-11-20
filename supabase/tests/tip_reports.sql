-- Monthly cash-tip report: tech sees own month by PIN on the salon device and signs it; owner sees who signed;
-- a new tip after signing shows as changed; wrong PIN / other salon's tech / tech's own login can't read the report. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fc01', '14085550801', 'authenticated', 'authenticated'),  -- owner
  ('00000000-0000-0000-0000-00000000fc02', '14085550802', 'authenticated', 'authenticated');  -- tech Kim
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
create function pg_temp.id(x text) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-00000000c' || x)::uuid $$;
create function pg_temp.tk(tid text, svc int, tip int) returns jsonb language sql as $$
  select public.save_ticket(jsonb_build_object('id', pg_temp.id(tid), 'salonId', pg_temp.id('a01'),
    'lines', jsonb_build_array(
      jsonb_build_object('id', pg_temp.id('c' || right(tid, 2)), 'kind', 'service', 'staffId', pg_temp.id('f01'), 'name', 'Gel', 'minutes', 45, 'cents', svc),
      jsonb_build_object('id', pg_temp.id('e' || right(tid, 2)), 'kind', 'tip', 'staffId', pg_temp.id('f01'), 'name', 'Cash tip', 'cents', tip)),
    'payment', jsonb_build_object('id', pg_temp.id('d' || right(tid, 2)), 'method', 'cash', 'givenCents', svc + tip))) $$;
create function pg_temp.dev() returns uuid language sql as $$ select (v #>> '{}')::uuid from t_out where k = 'device' $$;
create function pg_temp.mon() returns date language sql as $$ select date_trunc('month', now() at time zone 'UTC')::date $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000fc01') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', pg_temp.id('a01'), 'ownerName', 'Mai', 'salonName', 'Tip Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', pg_temp.id('f01'), 'name', 'Kim', 'phone', '+14085550802', 'role', 'tech', 'payType', 'commission', 'commissionPct', 60))));
insert into t_out values ('device', to_jsonb(public.register_device(pg_temp.id('a01'), 'Front desk')));
reset role;
update public.salons set time_zone = 'UTC' where id = pg_temp.id('a01');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc02","role":"authenticated"}', true);
select public.claim_memberships();
select public.set_my_pin(pg_temp.id('a01'), '369024');
-- tech's own login can't read everyone's report
do $$ begin perform public.tip_report(pg_temp.id('a01'), pg_temp.mon()); raise exception 'FAIL: tech read report';
  exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select pg_temp.tk('b01', 4000, 800);
select pg_temp.tk('b02', 5000, 1200);
insert into t_out values ('view', public.pin_tip_report(pg_temp.dev(), pg_temp.id('f01'), '369024', pg_temp.mon()));
insert into t_out values ('bad', public.pin_tip_report(pg_temp.dev(), pg_temp.id('f01'), '000000', pg_temp.mon(), true));
insert into t_out values ('sign', public.pin_tip_report(pg_temp.dev(), pg_temp.id('f01'), '369024', pg_temp.mon(), true));
insert into t_out values ('owner1', public.tip_report(pg_temp.id('a01'), pg_temp.mon()));
select pg_temp.tk('b03', 3000, 500);
insert into t_out values ('owner2', public.tip_report(pg_temp.id('a01'), pg_temp.mon()));
do $$ begin perform public.pin_tip_report(pg_temp.dev(), pg_temp.id('f01'), '369024', (pg_temp.mon() + interval '1 month')::date, true); raise exception 'FAIL: signed future month';
  exception when others then if sqlerrm not like '%not started%' then raise; end if; end $$;
reset role;
insert into t_out values ('log', to_jsonb((select count(*) from public.audit_log where salon_id = pg_temp.id('a01') and action = 'tips.signed')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out); k1 jsonb := o->'owner1'->0; k2 jsonb := o->'owner2'->0;
begin
  if o->'view'->'report'->>'cash_cents' <> '2000' or o->'view'->'report'->>'signed_at' is not null then raise exception 'FAIL view: %', o->'view'; end if;
  if (o->'bad'->>'ok')::boolean then raise exception 'FAIL wrong pin signed'; end if;
  if o->'sign'->'report'->>'signed_cash_cents' <> '2000' then raise exception 'FAIL sign: %', o->'sign'; end if;
  if k1->>'name' <> 'Kim' or k1->>'signed_cash_cents' <> '2000' or k1->>'cash_cents' <> '2000' then raise exception 'FAIL owner1: %', o->'owner1'; end if;
  if k2->>'cash_cents' <> '2500' or k2->>'signed_cash_cents' <> '2000' then raise exception 'FAIL changed: %', o->'owner2'; end if;
  if (o->>'log')::int <> 1 then raise exception 'FAIL log: %', o->'log'; end if;
  raise notice 'PASS: tip reports';
end $$;
rollback;
