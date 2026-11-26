-- A reminder with no phone / email to send to (old desk bookings, demo data) can never go out: mark it skipped
-- with a plain reason instead of leaving it "Scheduled" forever in Settings → Texting → Messages.
create or replace function public._reminder_timing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare st timestamptz; bs jsonb; p jsonb; h int;
begin
  if new.kind not in ('day_before', 'two_hours') or new.status <> 'queued' then return new; end if;
  if coalesce(trim(new.to_addr), '') = '' then
    new.status := 'skipped'; new.error := 'no phone or email on this booking'; return new;
  end if;
  select a.start_at, s.booking_settings into st, bs
  from public.appointments a join public.salons s on s.id = a.salon_id where a.id = new.appointment_id;
  if st is null then return new; end if;
  p := public._reminder_prefs(bs);
  h := case new.kind when 'day_before' then (p->>'first')::int else (p->>'second')::int end;
  if h = 0 then new.status := 'skipped'; new.error := 'turned off by the salon'; return new; end if;
  new.send_at := st - make_interval(hours => h);
  if tg_op = 'INSERT' and new.kind = 'two_hours' and p->>'testUntil' is not null then
    new.send_at := now() + interval '3 minutes';
  elsif new.send_at < now() - interval '1 minute' then
    new.status := 'skipped'; new.error := 'booked after this reminder time';
  end if;
  return new;
end $$;
revoke execute on function public._reminder_timing() from public, anon, authenticated;

-- Ones already waiting with nowhere to go.
update public.reminders set status = 'skipped', error = 'no phone or email on this booking'
where status = 'queued' and kind in ('day_before', 'two_hours') and coalesce(trim(to_addr), '') = '';
