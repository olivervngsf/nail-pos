-- Scheduled reminders: due rows are handed out once (day before, then 2 hours before), only by the server; a canceled
-- booking is skipped; nothing goes out at night (it waits). Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fd01', '14085550911', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
create temp view t_day as select (now() at time zone 'America/Los_Angeles')::date + 3 as d;
grant select on t_day to anon, authenticated, service_role;
create function pg_temp.bk(p_start int, p_extra jsonb) returns jsonb language sql as $$
  select public.book_create(jsonb_build_object('slug', 'remind-test', 'day', (select d from t_day), 'start', p_start,
    'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000041c1')))) || p_extra) $$;
-- a moment on the booking day (or the day before), salon time
create function pg_temp.at(p_days int, p_hhmi text) returns timestamptz language sql as $$
  select ((select d from t_day) + p_days + p_hhmi::time)::timestamp at time zone 'America/Los_Angeles' $$;
insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000041a1', 'ownerName', 'Mai', 'salonName', 'Remind Test Nails', 'state', 'CA', 'step', 9,
  'hours', (select jsonb_agg(jsonb_build_object('on', true, 'open', '07:00', 'close', '19:00')) from generate_series(1, 7)),
  'services', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000041c1', 'cat', 'Hands', 'name', 'Gel manicure', 'minutes', 45, 'priceCents', 4500, 'on', true)),
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000417a', 'name', 'Kim', 'phone', '+14085550912', 'role', 'tech'))));
select public.booking_settings_save('00000000-0000-0000-0000-0000000041a1', '{"slug": "remind-test"}');

reset role; set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into t_out values ('noon', pg_temp.bk(720, '{"name": "Lan Noon", "email": "lan@example.com"}'));
insert into t_out values ('early', pg_temp.bk(480, '{"name": "Early Bird", "email": "early@example.com"}'));
insert into t_out values ('gone', pg_temp.bk(900, '{"name": "Gone Girl", "email": "gone@example.com"}'));
do $$ begin perform public.booking_reminders_claim(); raise exception 'FAIL: anon claimed'; exception when insufficient_privilege then null; end $$;

reset role;
update public.appointments set status = 'canceled' where id = (select (v->'ids'->>0)::uuid from t_out where k = 'gone');
set local role service_role;
-- day before, 12:05: noon booking's day-before reminder (+ early bird's 8 AM one, due since 8 AM); canceled one skipped
insert into t_out values ('c1', public.booking_reminders_claim(50, pg_temp.at(-1, '12:05')));
insert into t_out values ('c1b', public.booking_reminders_claim(50, pg_temp.at(-1, '12:06')));
-- booking day 6:05 AM: early bird's 2-hour reminder is due but it's night: waits
insert into t_out values ('night', public.booking_reminders_claim(50, pg_temp.at(0, '06:05')));
-- booking day 10:05: noon booking's 2-hour reminder; early bird already started: skipped
insert into t_out values ('c2', public.booking_reminders_claim(50, pg_temp.at(0, '10:05')));
select public.booking_notice_done((x->>'id')::bigint, 'sent', null) from jsonb_array_elements((select v from t_out where k = 'c2')) x;
reset role;
insert into t_out values ('rows', (select jsonb_agg(jsonb_build_object('n', a.client_name, 'k', r.kind, 'st', r.status) order by a.client_name, r.kind)
  from public.reminders r join public.appointments a on a.id = r.appointment_id
  where a.salon_id = '00000000-0000-0000-0000-0000000041a1' and r.kind <> 'confirm'));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if (select jsonb_agg(x->>'kind' || ':' || (x->'notice'->>'name') order by x->'notice'->>'name') from jsonb_array_elements(o->'c1') x)
     <> '["day_before:Early", "day_before:Lan"]'::jsonb then raise exception 'FAIL day before: %', o->'c1'; end if;
  if o->'c1'->0->>'token' is null or o->'c1'->0->'notice'->'guests'->0->>'staff' <> 'Kim' or o->'c1'->0->>'to' is null then raise exception 'FAIL notice: %', o->'c1'->0; end if;
  if jsonb_array_length(o->'c1b') <> 0 then raise exception 'FAIL handed out twice: %', o->'c1b'; end if;
  if jsonb_array_length(o->'night') <> 0 then raise exception 'FAIL sent at night: %', o->'night'; end if;
  if jsonb_array_length(o->'c2') <> 1 or o->'c2'->0->>'kind' <> 'two_hours' or o->'c2'->0->'notice'->>'name' <> 'Lan' then raise exception 'FAIL 2 hours: %', o->'c2'; end if;
  if o->'rows' <> '[{"k":"day_before","n":"Early Bird","st":"sending"},{"k":"two_hours","n":"Early Bird","st":"skipped"},{"k":"day_before","n":"Gone Girl","st":"skipped"},{"k":"two_hours","n":"Gone Girl","st":"queued"},{"k":"day_before","n":"Lan Noon","st":"sending"},{"k":"two_hours","n":"Lan Noon","st":"sent"}]'::jsonb
    then raise exception 'FAIL rows: %', o->'rows'; end if;
  raise notice 'PASS booking_reminders';
end $$;
select 'PASS' as result;
rollback;
