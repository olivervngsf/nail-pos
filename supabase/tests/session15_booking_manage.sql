-- C6 client change / cancel link: book from the page → token → see it, move it (own booking doesn't block, desk bookings do),
-- reminders follow, group moves + cancels together, too late = call the salon, bad token = nothing. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fd01', '14085550801', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000030a1', 'ownerName', 'Mai', 'salonName', 'Manage Test Nails', 'state', 'CA', 'step', 9,
  'hours', (select jsonb_agg(jsonb_build_object('on', true, 'open', '09:00', 'close', '19:00')) from generate_series(1, 7)),
  'services', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000030c1', 'cat', 'Hands', 'name', 'Gel manicure', 'minutes', 45, 'priceCents', 4500, 'on', true)),
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000307a', 'name', 'Kim', 'phone', '+14085550802', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000307b', 'name', 'Tuyet', 'phone', '+14085550803', 'role', 'tech'))));
select public.booking_settings_save('00000000-0000-0000-0000-0000000030a1', '{"slug": "manage-test", "group_max": 6, "days_ahead": 30, "latest_before_close": 60, "cancel_hours": 2}');
-- desk booking: Kim 10:00–11:00 tomorrow
select public.appt_save(jsonb_build_object('id', '00000000-0000-0000-0000-0000000030d1', 'salonId', '00000000-0000-0000-0000-0000000030a1',
  'start', ((now() at time zone 'America/Los_Angeles')::date + 1 + time '10:00') at time zone 'America/Los_Angeles',
  'end', ((now() at time zone 'America/Los_Angeles')::date + 1 + time '11:00') at time zone 'America/Los_Angeles',
  'staffId', '00000000-0000-0000-0000-00000000307a', 'services', '[]', 'source', 'phone'));

reset role; set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
-- Lan books Kim 11:00 tomorrow (texts yes); Sara books a group of 2 at 14:00
insert into t_out values ('b1', public.book_create(jsonb_build_object('slug', 'manage-test', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 660,
  'phone', '+14085550142', 'name', 'Lan Tran', 'textsOk', true,
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000030c1'), 'staffId', '00000000-0000-0000-0000-00000000307a')))));
insert into t_out values ('g', public.book_create(jsonb_build_object('slug', 'manage-test', 'day', (now() at time zone 'America/Los_Angeles')::date + 1, 'start', 840,
  'phone', '+14085550155', 'name', 'Sara Lopez',
  'guests', jsonb_build_array(jsonb_build_object('serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000030c1')), jsonb_build_object('name', 'Ana', 'serviceIds', jsonb_build_array('00000000-0000-0000-0000-0000000030c1'))))));
insert into t_out values ('view', public.book_manage((select v->>'token' from t_out where k = 'b1')));
insert into t_out values ('bad', to_jsonb(public.book_manage('nope') is null and public.book_manage('') is null));
insert into t_out values ('slots', public.book_move_slots((select v->>'token' from t_out where k = 'b1'), (now() at time zone 'America/Los_Angeles')::date + 1));
-- into the desk booking → taken; 11:15 (overlaps only her own) → ok
insert into t_out values ('m_taken', public.book_move((select v->>'token' from t_out where k = 'b1'), (now() at time zone 'America/Los_Angeles')::date + 1, 600));
insert into t_out values ('m_ok', public.book_move((select v->>'token' from t_out where k = 'b1'), (now() at time zone 'America/Los_Angeles')::date + 1, 675));
-- group: move both to 16:00, then cancel both
insert into t_out values ('g_move', public.book_move((select v->>'token' from t_out where k = 'g'), (now() at time zone 'America/Los_Angeles')::date + 1, 960));
insert into t_out values ('g_cancel', public.book_cancel((select v->>'token' from t_out where k = 'g')));
insert into t_out values ('g_again', public.book_cancel((select v->>'token' from t_out where k = 'g')));
insert into t_out values ('g_view', public.book_manage((select v->>'token' from t_out where k = 'g')));
do $$ begin perform public._manage_party('x'); raise exception 'FAIL: anon helper'; exception when insufficient_privilege then null; end $$;

-- owner: changes need 48 h now → Lan is too late
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.booking_settings_save('00000000-0000-0000-0000-0000000030a1', '{"cancel_hours": 48, "group_max": 6, "days_ahead": 30, "latest_before_close": 60}');
reset role; set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into t_out values ('late_view', public.book_manage((select v->>'token' from t_out where k = 'b1')));
insert into t_out values ('late_cancel', public.book_cancel((select v->>'token' from t_out where k = 'b1')));
reset role;
insert into t_out values ('lan', (select jsonb_build_object('min', extract(hour from start_at at time zone 'America/Los_Angeles') * 60 + extract(minute from start_at at time zone 'America/Los_Angeles'), 'status', status,
  'rem', (select jsonb_agg(extract(hour from send_at at time zone 'America/Los_Angeles') * 60 + extract(minute from send_at at time zone 'America/Los_Angeles') order by send_at) from public.reminders where appointment_id = a.id and kind = 'two_hours'))
  from public.appointments a where id = (select (v->'ids'->>0)::uuid from t_out where k = 'b1')));
insert into t_out values ('grp', (select jsonb_agg(jsonb_build_object('status', status, 'min', extract(hour from start_at at time zone 'America/Los_Angeles') * 60 + extract(minute from start_at at time zone 'America/Los_Angeles')))
  from public.appointments where party_id is not null and salon_id = '00000000-0000-0000-0000-0000000030a1'));
insert into t_out values ('audit', to_jsonb((select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000030a1' and action in ('booking.client_move', 'booking.client_cancel'))));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if length(o->'b1'->>'token') < 24 or o->'b1'->>'token' = o->'g'->>'token' then raise exception 'FAIL token: % %', o->'b1', o->'g'; end if;
  if o->'view'->>'status' <> 'live' or (o->'view'->>'canChange')::boolean is not true or o->'view'->>'name' <> 'Lan' or (o->'view'->>'start')::int <> 660
     or o->'view'->'guests'->0->>'staff' <> 'Kim' or (o->'view'->'guests'->0->>'minutes')::int <> 45 or (o->'view') ? 'phone' then raise exception 'FAIL view: %', o->'view'; end if;
  if (o->>'bad')::boolean is not true then raise exception 'FAIL bad token'; end if;
  if not (o->'slots') @> '[660, 675]' or (o->'slots') @> '[600]' then raise exception 'FAIL move slots: %', o->'slots'; end if;
  if o->'m_taken'->>'reason' <> 'taken' or (o->'m_ok'->>'ok')::boolean is not true then raise exception 'FAIL move: % %', o->'m_taken', o->'m_ok'; end if;
  if (o->'lan'->>'min')::int <> 675 or o->'lan'->>'status' <> 'booked' or o->'lan'->'rem' <> '[555]'::jsonb then raise exception 'FAIL moved row / reminder: %', o->'lan'; end if;
  if (o->'g_move'->>'ok')::boolean is not true or (o->'g_cancel'->>'ok')::boolean is not true or o->'g_again'->>'reason' <> 'gone' then raise exception 'FAIL group: % % %', o->'g_move', o->'g_cancel', o->'g_again'; end if;
  if o->'grp' <> '[{"min": 960, "status": "canceled"}, {"min": 960, "status": "canceled"}]'::jsonb then raise exception 'FAIL group rows: %', o->'grp'; end if;
  if o->'g_view'->>'status' <> 'canceled' or (o->'g_view'->>'canChange')::boolean then raise exception 'FAIL canceled view: %', o->'g_view'; end if;
  if (o->'late_view'->>'canChange')::boolean or o->'late_cancel'->>'reason' <> 'too_late' then raise exception 'FAIL too late: % %', o->'late_view', o->'late_cancel'; end if;
  if (o->>'audit')::int <> 3 then raise exception 'FAIL audit: %', o->'audit'; end if;
end $$;
select 'PASS' as result;
rollback;
