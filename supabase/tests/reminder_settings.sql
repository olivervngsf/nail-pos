-- Booking reminders follow the owner's choice (Settings → Booking reminders): default 24h + 2h, off = skipped,
-- a time already passed = skipped (never sent late), test mode = 2nd reminder 3 minutes after booking; owner/manager
-- only. Uses an existing future booking on the test project. Rolls back.
begin;
do $$
declare a public.appointments; r public.reminders; mins int;
begin
  -- borrow any booking and move it 10h ahead (rolled back at the end)
  update public.appointments set start_at = date_trunc('minute', now()) + interval '10 hours', end_at = date_trunc('minute', now()) + interval '11 hours', status = 'booked'
  where id = (select id from public.appointments where client_name is not null order by created_at desc limit 1) returning * into a;
  if a.id is null then raise notice 'SKIP reminder_settings: no booking to borrow'; return; end if;
  update public.salons set booking_settings = booking_settings - 'reminders' where id = a.salon_id;
  -- default: 2h before; the 24h one is already past for a booking under 20h away = skipped
  insert into public.reminders (salon_id, appointment_id, kind, send_at, channel, to_addr)
    values (a.salon_id, a.id, 'two_hours', now(), 'email', 't@x.co') returning * into r;
  if r.send_at <> a.start_at - interval '2 hours' or r.status <> 'queued' then raise exception 'FAIL default 2h: % %', r.send_at, r.status; end if;
  insert into public.reminders (salon_id, appointment_id, kind, send_at, channel, to_addr)
    values (a.salon_id, a.id, 'day_before', now(), 'email', 't@x.co') returning * into r;
  if r.status <> 'skipped' or r.error <> 'booked after this reminder time' then raise exception 'FAIL past 24h: % %', r.status, r.error; end if;
  -- owner turns the 2nd off, then test mode on
  update public.salons set booking_settings = booking_settings || '{"reminders":{"first":24,"second":0}}' where id = a.salon_id;
  insert into public.reminders (salon_id, appointment_id, kind, send_at, channel, to_addr)
    values (a.salon_id, a.id, 'two_hours', now(), 'email', 't@x.co') returning * into r;
  if r.status <> 'skipped' or r.error <> 'turned off by the salon' then raise exception 'FAIL off: % %', r.status, r.error; end if;
  update public.salons set booking_settings = booking_settings || jsonb_build_object('reminders', jsonb_build_object('first', 24, 'second', 1, 'testUntil', now() + interval '1 hour')) where id = a.salon_id;
  insert into public.reminders (salon_id, appointment_id, kind, send_at, channel, to_addr)
    values (a.salon_id, a.id, 'two_hours', now(), 'email', 't@x.co') returning * into r;
  mins := round(extract(epoch from r.send_at - now()) / 60);
  if r.status <> 'queued' or mins <> 3 then raise exception 'FAIL test mode: % % min', r.status, mins; end if;
  -- a move recomputes from the new start (1h before), never the test time
  update public.reminders set send_at = now() where id = r.id returning * into r;
  if r.send_at <> a.start_at - interval '1 hour' then raise exception 'FAIL move: %', r.send_at; end if;
  -- strangers can't read or change the settings
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
  set local role authenticated;
  begin perform public.reminder_settings_get(a.salon_id); raise exception 'FAIL stranger read'; exception when insufficient_privilege then null; end;
  begin perform public.reminder_settings_save(a.salon_id, '{"first":24}'); raise exception 'FAIL stranger save'; exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'PASS reminder_settings';
end $$;
select 'PASS' as result;
rollback;
