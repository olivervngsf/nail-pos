-- A desk save of a booking-page booking keeps its reminders (with phone + email), moves them only when the time
-- changes, and skips them once the client is here. A desk booking for a client who said yes to texts gets text
-- reminders to their phone. (Nov 26 bug: desk saves replaced them with blank ones that got skipped.) Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fe01', '14085550901', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000040a1', 'ownerName', 'Mai', 'salonName', 'Keep Rem Nails', 'state', 'CA', 'step', 9,
  'hours', (select jsonb_agg(jsonb_build_object('on', true, 'open', '09:00', 'close', '19:00')) from generate_series(1, 7)),
  'services', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000040c1', 'cat', 'Hands', 'name', 'Gel manicure', 'minutes', 45, 'priceCents', 4500, 'on', true)),
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000407a', 'name', 'Kim', 'phone', '+14085550902', 'role', 'tech'))));
select public.booking_settings_save('00000000-0000-0000-0000-0000000040a1', '{"slug": "keep-rem", "group_max": 6, "days_ahead": 30, "latest_before_close": 60, "cancel_hours": 2}');
reset role; set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
-- Lan books 11:00 in 3 days with phone (texts yes) + email
insert into t_out values ('b', public.book_create(jsonb_build_object('slug', 'keep-rem', 'day', (now() at time zone 'America/Los_Angeles')::date + 3, 'start', 660,
  'phone', '+14085550142', 'email', 'lan@example.com', 'name', 'Lan Tran', 'textsOk', true,
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000040c1'), 'staffId', '00000000-0000-0000-0000-00000000407a')))));
-- and one tomorrow 11:00 (the day-before time may already be past): both reminder kinds are still made, per channel
insert into t_out values ('near', public.book_create(jsonb_build_object('slug', 'keep-rem', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 660,
  'phone', '+14085550177', 'email', 'mia@example.com', 'name', 'Mia Le', 'textsOk', true,
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000040c1'), 'staffId', '00000000-0000-0000-0000-00000000407a')))));
reset role;
create function pg_temp.rem(aid uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('k', kind, 'ch', channel, 'to', to_addr, 'st', status, 'at', send_at) order by kind, channel), '[]')
  from public.reminders where appointment_id = aid and kind in ('day_before', 'two_hours') $$;
create function pg_temp.desk(aid uuid, mins int, new_status text) returns jsonb language sql as $$
  select public.appt_save(jsonb_build_object('id', aid, 'salonId', '00000000-0000-0000-0000-0000000040a1',
    'start', a.start_at + make_interval(mins => mins), 'end', a.end_at + make_interval(mins => mins), 'staffId', a.staff_id,
    'client', jsonb_build_object('phone', '+14085550142', 'name', 'Lan Tran'), 'services', a.services, 'status', new_status, 'source', a.source))
  from public.appointments a where a.id = aid $$;
grant execute on all functions in schema pg_temp to authenticated;
insert into t_out values ('before', pg_temp.rem((select (v->'ids'->>0)::uuid from t_out where k = 'b')));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}', true);
select pg_temp.desk((select (v->'ids'->>0)::uuid from t_out where k = 'b'), 0, 'booked');   -- same time (calendar sync)
reset role;
insert into t_out values ('same', pg_temp.rem((select (v->'ids'->>0)::uuid from t_out where k = 'b')));
set local role authenticated;
select pg_temp.desk((select (v->'ids'->>0)::uuid from t_out where k = 'b'), 60, 'booked');  -- moved 1h later
reset role;
insert into t_out values ('moved', pg_temp.rem((select (v->'ids'->>0)::uuid from t_out where k = 'b')));
set local role authenticated;
select pg_temp.desk((select (v->'ids'->>0)::uuid from t_out where k = 'b'), 0, 'arrived');  -- client is here
-- desk booking for the same client (said yes to texts) in 4 days
select public.appt_save(jsonb_build_object('id', '00000000-0000-0000-0000-0000000040d1', 'salonId', '00000000-0000-0000-0000-0000000040a1',
  'start', now() + interval '4 days', 'end', now() + interval '4 days 45 minutes', 'staffId', '00000000-0000-0000-0000-00000000407a',
  'client', jsonb_build_object('phone', '+14085550142', 'name', 'Lan Tran'), 'services', '[]', 'source', 'phone'));
select public.appt_save(jsonb_build_object('id', '00000000-0000-0000-0000-0000000040d1', 'salonId', '00000000-0000-0000-0000-0000000040a1',
  'start', now() + interval '4 days', 'end', now() + interval '4 days 45 minutes', 'staffId', '00000000-0000-0000-0000-00000000407a',
  'client', jsonb_build_object('phone', '+14085550142', 'name', 'Lan Tran'), 'services', '[]', 'source', 'phone'));
reset role;
insert into t_out values ('here', pg_temp.rem((select (v->'ids'->>0)::uuid from t_out where k = 'b')));
insert into t_out values ('desk', pg_temp.rem('00000000-0000-0000-0000-0000000040d1'));
insert into t_out values ('near_rem', pg_temp.rem((select (v->'ids'->>0)::uuid from t_out where k = 'near')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out); x jsonb;
begin
  if jsonb_array_length(o->'before') <> 4 then raise exception 'FAIL setup: %', o->'before'; end if;
  if o->'same' <> o->'before' then raise exception 'FAIL sync changed reminders: % vs %', o->'same', o->'before'; end if;
  for x in select * from jsonb_array_elements(o->'moved') loop
    if x->>'to' is null or x->>'st' <> 'queued' then raise exception 'FAIL moved lost address: %', o->'moved'; end if;
  end loop;
  if ((o->'moved'->0->>'at')::timestamptz - (o->'before'->0->>'at')::timestamptz) <> interval '1 hour' then raise exception 'FAIL not moved: %', o->'moved'; end if;
  for x in select * from jsonb_array_elements(o->'here') loop
    if x->>'st' <> 'skipped' then raise exception 'FAIL arrived still queued: %', o->'here'; end if;
  end loop;
  if jsonb_array_length(o->'desk') <> 2 or o->'desk'->0->>'to' <> '+14085550142' or o->'desk'->0->>'ch' <> 'sms' or o->'desk'->0->>'st' <> 'queued' then
    raise exception 'FAIL desk booking reminders: %', o->'desk'; end if;
  if (o->'near'->>'ok')::boolean is not true or jsonb_array_length(o->'near_rem') <> 4 then raise exception 'FAIL near booking reminders: % %', o->'near', o->'near_rem'; end if;
  raise notice 'PASS appt_save_reminders';
end $$;
select 'PASS' as result;
rollback;
