-- Scheduled booking reminders: 1 day before + 2 hours before (rows already queued by book_create, moved by book_move).
-- The hourly job (/api/cron/booking-reminders, GitHub Actions "Scheduled texts") claims the rows that are due, each
-- once, and sends them like the confirmation (email: Resend; text: sendText = salon's own number + recorded yes only).
-- Rules here: never for a canceled / no-show / walked-out booking or one starting within 15 min; a late day-before
-- reminder is dropped when the 2-hour one is due anyway; nothing between 9 PM and 8 AM salon time (it waits).
-- Results are recorded with the existing booking_notice_done (sent / skipped / failed).

-- What a message needs to say about the booking behind a link (same shape booking_notice_claim returns).
create function public._booking_notice(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare first public.appointments; s public.salons; tz text;
begin
  select * into first from public._manage_party(p_token) limit 1;
  if first.id is null then return null; end if;
  select * into s from public.salons where id = first.salon_id;
  tz := s.time_zone;
  return jsonb_build_object(
    'salon', jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'address', s.address, 'slug', s.slug,
      'cancelHours', coalesce((s.booking_settings->>'cancel_hours')::int, 2)),
    'name', split_part(first.client_name, ' ', 1),
    'day', to_char((first.start_at at time zone tz)::date, 'YYYY-MM-DD'),
    'start', (extract(hour from first.start_at at time zone tz) * 60 + extract(minute from first.start_at at time zone tz))::int,
    'guests', (select jsonb_agg(jsonb_build_object('name', split_part(a.client_name, ' ', 1),
        'staff', (select display_name from public.memberships where id = a.staff_id),
        'minutes', (extract(epoch from a.end_at - a.start_at) / 60)::int, 'services', a.services) order by a.start_at, a.created_at)
      from public._manage_party(p_token) a where a.status in ('booked', 'confirmed')));
end $$;

-- Hand out the reminders that are due (each once). p_now is only for tests.
create function public.booking_reminders_claim(p_limit int default 50, p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  -- Booking gone or about to start: never send.
  update public.reminders r set status = 'skipped', error = 'booking canceled, moved or starting now'
  from public.appointments a
  where a.id = r.appointment_id and r.status = 'queued' and r.kind in ('day_before', 'two_hours') and r.send_at <= p_now
    and (a.status not in ('booked', 'confirmed') or a.start_at <= p_now + interval '15 minutes');
  -- Day-before reminder that is late (job was down): the 2-hour one covers it.
  update public.reminders r set status = 'skipped', error = 'late: the 2-hour reminder covers it'
  from public.appointments a
  where a.id = r.appointment_id and r.status = 'queued' and r.kind = 'day_before' and a.start_at <= p_now + interval '3 hours';

  with c as (
    update public.reminders r set status = 'sending'
    where r.id in (
      select r2.id from public.reminders r2 join public.salons s on s.id = r2.salon_id
      where r2.status = 'queued' and r2.kind in ('day_before', 'two_hours') and r2.send_at <= p_now
        and extract(hour from p_now at time zone s.time_zone) between 8 and 20   -- 8:00 AM to 8:59 PM salon time
      order by r2.send_at limit greatest(1, least(p_limit, 200))
      for update of r2 skip locked)
    returning r.id, r.channel, r.to_addr, r.kind, r.appointment_id)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'channel', c.channel, 'to', c.to_addr, 'kind', c.kind,
      'token', a.manage_token, 'notice', public._booking_notice(a.manage_token)) order by c.id), '[]')
    into out
  from c join public.appointments a on a.id = c.appointment_id;
  return out;
end $$;

revoke execute on function public._booking_notice(text), public.booking_reminders_claim(int, timestamptz) from public, anon, authenticated;
grant execute on function public._booking_notice(text), public.booking_reminders_claim(int, timestamptz) to service_role;
