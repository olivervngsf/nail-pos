-- Breaks / blocked time on a tech's column (Nov 18, calendar board "Break · blocked time").
-- A break is an appointment row with status 'blocked' and no client. Everything that finds free time already
-- treats any status other than canceled / no_show / walked_out as busy, so the booking page, tech booking,
-- moves and the desk's overlap warning all respect breaks. Reminders only go to booked/confirmed, so none for breaks.
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('booked', 'confirmed', 'arrived', 'done', 'no_show', 'canceled', 'walked_out', 'blocked'));
