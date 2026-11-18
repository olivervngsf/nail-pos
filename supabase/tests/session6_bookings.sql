-- Session 6 (M7) bookings in SQL: book, same id twice = one row, an older offline edit can't overwrite a newer one,
-- overlaps counted (never moved), reminders only for clients who said yes to texts, repeat rule, tech can't book,
-- another salon sees nothing. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ff01', '14085550601', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ff02', '14085550602', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ff03', '14085550603', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
create function pg_temp.bk(id text, startin text, mins int, staff text, phone text, extra jsonb default '{}') returns jsonb language sql as $$
  select public.appt_save(jsonb_build_object('id', ('00000000-0000-0000-0000-0000000010' || id)::uuid, 'salonId', '00000000-0000-0000-0000-0000000010a1',
    'start', now() + startin::interval, 'end', now() + startin::interval + make_interval(mins => mins), 'staffId', staff,
    'client', jsonb_build_object('phone', phone, 'name', 'Lan Tran'),
    'services', jsonb_build_array(jsonb_build_object('name', 'Gel manicure', 'minutes', mins, 'cents', 4500)), 'source', 'phone') || extra) $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ff01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000010a1', 'ownerName', 'Mai', 'salonName', 'Book Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000107f', 'name', 'Kim', 'phone', '+14085550602', 'role', 'tech'))));
-- Lan said yes to texts; Jen did not
select public.client_save(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000010a1', 'name', 'Lan Tran', 'phone', '+14085550142', 'textsOk', true));

insert into t_out values ('b1', pg_temp.bk('b1', '2 days', 45, '00000000-0000-0000-0000-00000000107f', '+14085550142'));
insert into t_out values ('b1_again', pg_temp.bk('b1', '2 days', 45, '00000000-0000-0000-0000-00000000107f', '+14085550142'));
-- Jen at an overlapping time with Kim → booked, overlap counted
insert into t_out values ('b2', pg_temp.bk('b2', '2 days 30 minutes', 30, '00000000-0000-0000-0000-00000000107f', '+14085550131'));
-- newer edit moves b1 one hour later; then an older offline edit arrives → ignored
insert into t_out values ('move', pg_temp.bk('b1', '2 days 1 hour', 45, '00000000-0000-0000-0000-00000000107f', '+14085550142', jsonb_build_object('updatedAt', now())));
insert into t_out values ('stale', pg_temp.bk('b1', '2 days 3 hours', 45, '00000000-0000-0000-0000-00000000107f', '+14085550142', jsonb_build_object('updatedAt', now() - interval '1 hour')));
-- repeat every 4 weeks × 3 (first one carries the rule)
insert into t_out values ('rep', pg_temp.bk('b3', '7 days', 45, '00000000-0000-0000-0000-00000000107f', '+14085550142',
  jsonb_build_object('repeat', jsonb_build_object('id', '00000000-0000-0000-0000-0000000010e1', 'everyWeeks', 4, 'times', 3))));
-- cancel b2 → its queued reminders go (it had none anyway: no texts consent)
insert into t_out values ('cancel', pg_temp.bk('b2', '2 days 30 minutes', 30, '00000000-0000-0000-0000-00000000107f', '+14085550131', jsonb_build_object('status', 'canceled')));
insert into t_out values ('list', public.appt_list('00000000-0000-0000-0000-0000000010a1', now(), now() + interval '30 days'));

-- tech: reads, can't book
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ff02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('tech_list', to_jsonb(jsonb_array_length(public.appt_list('00000000-0000-0000-0000-0000000010a1', now(), now() + interval '30 days'))));
do $$ begin perform pg_temp.bk('b9', '1 day', 30, null, '+14085550199');
  raise exception 'FAIL: tech booked'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
-- stranger: nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ff03","role":"authenticated"}', true);
insert into t_out values ('stranger', jsonb_build_object('list', public.appt_list('00000000-0000-0000-0000-0000000010a1', now(), now() + interval '30 days'),
  'rows', (select count(*) from public.appointments) + (select count(*) from public.reminders)));
reset role;
insert into t_out values ('reminders', (select jsonb_object_agg(a.client_name || ':' || r.kind, r.status) from public.reminders r join public.appointments a on a.id = r.appointment_id));
insert into t_out values ('rows', (select to_jsonb(count(*)) from public.appointments where salon_id = '00000000-0000-0000-0000-0000000010a1'));
insert into t_out values ('b1_row', (select to_jsonb(a) from public.appointments a where id = '00000000-0000-0000-0000-0000000010b1'));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if (o->'b2'->>'overlaps')::int <> 1 then raise exception 'FAIL overlap: %', o->'b2'; end if;
  if (o->'stale'->>'stale')::boolean is not true then raise exception 'FAIL stale edit: %', o->'stale'; end if;
  if (o->>'rows')::int <> 3 then raise exception 'FAIL rows: %', o->'rows'; end if;
  if abs(extract(epoch from (o->'b1_row'->>'start_at')::timestamptz - (now() + interval '2 days 1 hour'))) > 5 then raise exception 'FAIL newest edit kept: %', o->'b1_row'; end if;
  if o->'b1_row'->>'source' <> 'phone' then raise exception 'FAIL source'; end if;
  if jsonb_array_length(o->'list') <> 3 or (o->'list'->1->'client'->>'textsOk')::boolean is not true or o->'list'->0->>'status' <> 'canceled' then raise exception 'FAIL list: %', o->'list'; end if;
  if (o->>'tech_list')::int <> 3 then raise exception 'FAIL tech reads'; end if;
  if jsonb_array_length(o->'stranger'->'list') <> 0 or (o->'stranger'->>'rows')::int <> 0 then raise exception 'FAIL wall: %', o->'stranger'; end if;
  if o->'reminders'->>'Lan Tran:day_before' is null or o->'reminders'->>'Lan Tran:two_hours' is null or o->'reminders' ? 'Lan Tran:x'
     or exists (select 1 from jsonb_object_keys(o->'reminders') k where k like 'Jen%' or k like ':%') then raise exception 'FAIL reminders: %', o->'reminders'; end if;
  raise notice 'PASS session6_bookings';
end $$;
rollback;
