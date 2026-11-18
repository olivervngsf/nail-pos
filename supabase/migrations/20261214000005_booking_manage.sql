-- Booking page C6: client change / cancel link (polishosapp.com/b/<token>). No sign-in: the long random token in the link
-- is the key. A group booked together is changed or canceled together. Allowed until booking_settings.cancel_hours before
-- the visit; after that the page says to call the salon. Moves keep each guest's nail tech and are re-checked under the
-- same per-salon lock as new bookings (never double-books). Every change is in audit_log and shows on the desk calendar.

alter table public.appointments add column manage_token text unique default replace(gen_random_uuid()::text, '-', '');

-- Free start times that can ignore some bookings (the ones being moved). _free_starts keeps working as before.
create function public._free_starts_skip(p_salon uuid, p_day date, p_staff uuid, p_minutes int, p_public boolean, p_skip uuid[])
returns table (start_min int, staff_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
declare s public.salons; h public.salon_hours; tz text; open_m int; close_m int; now_local timestamp; last_m int; m int; ids uuid[];
begin
  select * into s from public.salons where id = p_salon;
  tz := s.time_zone;
  now_local := now() at time zone tz;
  select * into h from public.salon_hours where salon_id = p_salon and weekday = extract(isodow from p_day)::int - 1;
  if h.salon_id is null or not h.is_open or p_minutes is null or p_minutes < 5 then return; end if;
  if p_public and (p_day < now_local::date or p_day > now_local::date + coalesce((s.booking_settings->>'days_ahead')::int, 30)) then return; end if;
  open_m := extract(hour from h.opens) * 60 + extract(minute from h.opens);
  close_m := extract(hour from h.closes) * 60 + extract(minute from h.closes);
  last_m := close_m - p_minutes;
  if p_public and p_day = now_local::date then
    last_m := least(last_m, close_m - coalesce((s.booking_settings->>'latest_before_close')::int, 60));
  end if;
  m := open_m;
  while m <= last_m loop
    if p_day > now_local::date or m >= extract(hour from now_local) * 60 + extract(minute from now_local) + (case when p_public then coalesce((s.booking_settings->>'min_notice')::int, 30) else 0 end) then
      select array_agg(mm.id order by mm.display_name) into ids from public.memberships mm
      where mm.salon_id = p_salon and mm.archived_at is null and mm.role = 'tech' and (p_staff is null or mm.id = p_staff)
        and not exists (select 1 from public.appointments a where a.staff_id = mm.id and a.status not in ('canceled', 'no_show', 'walked_out')
          and not (a.id = any (coalesce(p_skip, '{}')))
          and a.start_at < ((p_day + make_interval(mins => m + p_minutes))::timestamp at time zone tz)
          and a.end_at > ((p_day + make_interval(mins => m))::timestamp at time zone tz));
      if ids is not null then start_min := m; staff_ids := ids; return next; end if;
    end if;
    m := m + 15;
  end loop;
end $$;

create or replace function public._free_starts(p_salon uuid, p_day date, p_staff uuid, p_minutes int, p_public boolean)
returns table (start_min int, staff_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select * from public._free_starts_skip(p_salon, p_day, p_staff, p_minutes, p_public, '{}');
$$;

-- The bookings a link opens: the one with the token + the rest of its group.
create function public._manage_party(p_token text) returns setof public.appointments
language sql stable security definer set search_path = '' as $$
  with me as (select * from public.appointments where manage_token = p_token and length(coalesce(p_token, '')) >= 24)
  select a.* from public.appointments a, me
  where a.id = me.id or (me.party_id is not null and a.party_id = me.party_id)
  order by a.start_at, a.created_at;
$$;

-- book_create now also returns the link token (of the first guest's booking).
alter function public.book_create(jsonb) rename to _book_create_v1;
revoke execute on function public._book_create_v1(jsonb) from public, anon, authenticated;
create function public.book_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := public._book_create_v1(p);
begin
  if coalesce((r->>'ok')::boolean, false) then
    r := r || jsonb_build_object('token', (select manage_token from public.appointments where id = (r->'ids'->>0)::uuid));
  end if;
  return r;
end $$;

-- What the link shows. Nothing private beyond what the client typed: first names, services, tech, time.
create function public.book_manage(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare first public.appointments; s public.salons; tz text; live boolean; can boolean;
begin
  select * into first from public._manage_party(p_token) limit 1;
  if first.id is null then return null; end if;
  select * into s from public.salons where id = first.salon_id;
  tz := s.time_zone;
  live := exists (select 1 from public._manage_party(p_token) a where a.status in ('booked', 'confirmed'));
  can := live and first.start_at - make_interval(hours => coalesce((s.booking_settings->>'cancel_hours')::int, 2)) > now();
  return jsonb_build_object(
    'salon', jsonb_build_object('name', s.name, 'phone', s.phone, 'address', s.address, 'slug', s.slug, 'timeZone', tz, 'settings', s.booking_settings),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'open', is_open, 'opens', to_char(opens, 'HH24:MI'), 'closes', to_char(closes, 'HH24:MI')) order by weekday)
      from public.salon_hours where salon_id = s.id), '[]'),
    'status', case when live then 'live' when first.status = 'canceled' then 'canceled' else 'done' end,
    'canChange', can,
    'day', to_char((first.start_at at time zone tz)::date, 'YYYY-MM-DD'),
    'start', (extract(hour from first.start_at at time zone tz) * 60 + extract(minute from first.start_at at time zone tz))::int,
    'name', split_part(first.client_name, ' ', 1),
    'guests', (select jsonb_agg(jsonb_build_object('name', split_part(a.client_name, ' ', 1),
        'staff', (select display_name from public.memberships where id = a.staff_id),
        'minutes', (extract(epoch from a.end_at - a.start_at) / 60)::int, 'services', a.services) order by a.start_at, a.created_at)
      from public._manage_party(p_token) a where a.status <> 'canceled' or not live));
end $$;

-- Free times to move to: every guest keeps their tech, all start together. Their own bookings don't count as busy.
create function public.book_move_slots(p_token text, p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.appointments; skip uuid[]; out int[]; part int[];
begin
  select array_agg(id) into skip from public._manage_party(p_token) where status in ('booked', 'confirmed');
  if skip is null then return '[]'; end if;
  for a in select * from public._manage_party(p_token) where status in ('booked', 'confirmed') loop
    select coalesce(array_agg(f.start_min), '{}') into part
      from public._free_starts_skip(a.salon_id, p_day, a.staff_id, (extract(epoch from a.end_at - a.start_at) / 60)::int, true, skip) f;
    out := case when out is null then part else (select coalesce(array_agg(x), '{}') from unnest(out) x where x = any (part)) end;
  end loop;
  return coalesce((select jsonb_agg(x order by x) from unnest(out) x), '[]');
end $$;

-- Move: { ok } or { ok: false, reason: too_late | taken | gone }.
create function public.book_move(p_token text, p_day date, p_start int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare first public.appointments; a public.appointments; s public.salons; skip uuid[]; mins int; old timestamptz;
begin
  select * into first from public._manage_party(p_token) where status in ('booked', 'confirmed') limit 1;
  if first.id is null then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  select * into s from public.salons where id = first.salon_id;
  perform pg_advisory_xact_lock(hashtext('book:' || s.id::text));
  if first.start_at - make_interval(hours => coalesce((s.booking_settings->>'cancel_hours')::int, 2)) <= now() then
    return jsonb_build_object('ok', false, 'reason', 'too_late');
  end if;
  select array_agg(id) into skip from public._manage_party(p_token) where status in ('booked', 'confirmed');
  for a in select * from public._manage_party(p_token) where status in ('booked', 'confirmed') loop
    mins := (extract(epoch from a.end_at - a.start_at) / 60)::int;
    if not exists (select 1 from public._free_starts_skip(s.id, p_day, a.staff_id, mins, true, skip) f where f.start_min = p_start) then
      return jsonb_build_object('ok', false, 'reason', 'taken');
    end if;
  end loop;
  old := first.start_at;
  update public.appointments set start_at = (p_day + make_interval(mins => p_start))::timestamp at time zone s.time_zone,
    end_at = (p_day + make_interval(mins => p_start + (extract(epoch from end_at - start_at) / 60)::int))::timestamp at time zone s.time_zone,
    status = 'booked', updated_at = now()
  where id = any (skip);
  -- Reminders follow the new time (still only for clients who said yes to texts).
  delete from public.reminders where appointment_id = any (skip) and status = 'queued' and kind in ('day_before', 'two_hours');
  if coalesce((select texts_ok from public.clients where id = first.client_id), false) then
    insert into public.reminders (salon_id, appointment_id, kind, send_at)
    select s.id, first.id, k, w from public.appointments x, lateral (values ('day_before', x.start_at - interval '1 day'), ('two_hours', x.start_at - interval '2 hours')) v(k, w)
    where x.id = first.id and w >= now() - interval '1 minute';
  end if;
  insert into public.audit_log (salon_id, action, detail) values (s.id, 'booking.client_move', jsonb_build_object('ids', skip, 'from', old, 'day', p_day, 'start', p_start));
  return jsonb_build_object('ok', true);
end $$;

-- Cancel: { ok } or { ok: false, reason: too_late | gone }.
create function public.book_cancel(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare first public.appointments; s public.salons; ids uuid[];
begin
  select * into first from public._manage_party(p_token) where status in ('booked', 'confirmed') limit 1;
  if first.id is null then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  select * into s from public.salons where id = first.salon_id;
  if first.start_at - make_interval(hours => coalesce((s.booking_settings->>'cancel_hours')::int, 2)) <= now() then
    return jsonb_build_object('ok', false, 'reason', 'too_late');
  end if;
  select array_agg(id) into ids from public._manage_party(p_token) where status in ('booked', 'confirmed');
  update public.appointments set status = 'canceled', updated_at = now() where id = any (ids);
  delete from public.reminders where appointment_id = any (ids) and status = 'queued';
  insert into public.audit_log (salon_id, action, detail) values (s.id, 'booking.client_cancel', jsonb_build_object('ids', ids));
  return jsonb_build_object('ok', true);
end $$;

-- /b/<token> is a top-level route.
create or replace function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $$
  select array['book', 'kiosk', 'setup', 'login', 'today', 'checkout', 'clients', 'calendar', 'settings', 'pay', 'join', 'api', 'admin', 'gift-cards', 'kit', 'paid',
    't', 'r', 'c', 'b', 'me', 'close-day', 'salon', 'demo', 'numbers', 'loyalty', 'payouts', 'help', 'invite', 'earnings', 'desk', 'clock', 'go', 'auth'];
$$;

revoke execute on function public._free_starts_skip(uuid, date, uuid, int, boolean, uuid[]), public._free_starts(uuid, date, uuid, int, boolean),
  public._manage_party(text) from public, anon, authenticated;
revoke execute on function public.book_create(jsonb), public.book_manage(text), public.book_move_slots(text, date), public.book_move(text, date, int),
  public.book_cancel(text) from public;
grant execute on function public.book_create(jsonb), public.book_manage(text), public.book_move_slots(text, date), public.book_move(text, date, int),
  public.book_cancel(text) to anon, authenticated;
