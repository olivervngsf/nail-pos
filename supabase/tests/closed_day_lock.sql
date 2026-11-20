-- Closed days stay closed: a cash payment saved offline yesterday (yesterday's time) but synced after yesterday was closed
-- lands on today; yesterday's numbers don't move; the move is logged. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values ('00000000-0000-0000-0000-00000000fb01', '14085550701', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
create function pg_temp.id(x text) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-00000000b' || x)::uuid $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', pg_temp.id('a01'), 'ownerName', 'Mai', 'salonName', 'Lock Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', pg_temp.id('f01'), 'name', 'Kim', 'phone', '+14085550702', 'role', 'tech', 'payType', 'commission', 'commissionPct', 60))));
reset role;
update public.salons set time_zone = 'UTC' where id = pg_temp.id('a01');
insert into public.day_closes (salon_id, day, start_cents, cash_expected_cents, cash_counted_cents, summary)
  values (pg_temp.id('a01'), current_date - 1, 0, 0, 0, '{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
insert into t_out values ('before', public.day_summary(pg_temp.id('a01'), current_date - 1));
-- Offline ticket paid in cash yesterday at noon, synced now.
select public.save_ticket(jsonb_build_object('id', pg_temp.id('b01'), 'salonId', pg_temp.id('a01'),
  'lines', jsonb_build_array(jsonb_build_object('id', pg_temp.id('c01'), 'kind', 'service', 'staffId', pg_temp.id('f01'), 'name', 'Gel', 'minutes', 45, 'cents', 4000)),
  'payment', jsonb_build_object('id', pg_temp.id('d01'), 'method', 'cash', 'givenCents', 4000, 'at', ((current_date - 1)::timestamp + interval '12 hours')::timestamptz)));
insert into t_out values ('after', public.day_summary(pg_temp.id('a01'), current_date - 1));
insert into t_out values ('today', public.day_summary(pg_temp.id('a01'), current_date));
reset role;
insert into t_out values ('days', (select jsonb_build_object('paid', (paid_at at time zone 'UTC')::date = current_date,
  'pay', (select (at at time zone 'UTC')::date = current_date from public.payments where id = pg_temp.id('d01'))) from public.tickets where id = pg_temp.id('b01')));
insert into t_out values ('log', to_jsonb((select count(*) from public.audit_log where salon_id = pg_temp.id('a01') and action = 'money.after_close')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'after'->'paid' <> o->'before'->'paid' or o->'after'->'sales' <> o->'before'->'sales' then raise exception 'FAIL closed day moved: % → %', o->'before'->'paid', o->'after'->'paid'; end if;
  if o->'today'->'paid'->>'cash_cents' <> '4000' or (o->'today'->>'unmatched_cents')::int <> 0 then raise exception 'FAIL today: %', o->'today'->'paid'; end if;
  if not (o->'days'->>'paid')::boolean or not (o->'days'->>'pay')::boolean then raise exception 'FAIL times: %', o->'days'; end if;
  if (o->>'log')::int < 2 then raise exception 'FAIL log: %', o->'log'; end if;
  raise notice 'PASS closed_day_lock';
end $$;
rollback;
