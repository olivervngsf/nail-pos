-- Session 8 (M9): walk-in waitlist + turn list. Booking board Cal waitlist + Up next (D1, D6), Main Screens Today waiting counts.
-- A walk-in is a booking (source kiosk / walk_in) that waits with no ticket. The desk seats it with a tech (it moves into that
-- column, arrived_at keeps when they came in) or marks it walked out. Turns = tickets per tech today (desk_staff), facts only:
-- the desk decides, with an optional reason when they skip the next turn. Saved through appt_save, so it works offline.
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('booked', 'confirmed', 'arrived', 'done', 'no_show', 'canceled', 'walked_out'));
alter table public.appointments add column arrived_at timestamptz,   -- walk-in: when they came in (start moves to when seated)
  add column seat_reason text;                                          -- optional: why not the next turn

-- Free-time search ignores walk-outs.
create or replace function public._free_starts(p_salon uuid, p_day date, p_staff uuid, p_minutes int, p_public boolean)
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
          and a.start_at < ((p_day + make_interval(mins => m + p_minutes))::timestamp at time zone tz)
          and a.end_at > ((p_day + make_interval(mins => m))::timestamp at time zone tz));
      if ids is not null then start_min := m; staff_ids := ids; return next; end if;
    end if;
    m := m + 15;
  end loop;
end $$;

create or replace function public.appt_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  aid uuid := (p->>'id')::uuid; sid uuid := (p->>'salonId')::uuid;
  a public.appointments; cid uuid; st text := coalesce(p->>'status', 'booked'); ok_texts boolean;
  stime timestamptz := (p->>'start')::timestamptz; etime timestamptz := (p->>'end')::timestamptz;
  edit timestamptz := least(now(), coalesce((p->>'updatedAt')::timestamptz, now())); rid uuid; me uuid; n int;
begin
  if aid is null or sid is null then raise exception 'booking id and salon required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  select * into a from public.appointments where id = aid for update;
  if a.id is not null and a.salon_id <> sid then raise exception 'not allowed'; end if;
  -- An older edit arriving late (offline device) never overwrites a newer one.
  if a.id is not null and a.updated_at > edit then
    return jsonb_build_object('id', a.id, 'stale', true);
  end if;
  me := public._me_in(sid);
  if coalesce(p->'client'->>'phone', '') <> '' then
    insert into public.clients (salon_id, phone, name) values (sid, p->'client'->>'phone', coalesce(p->'client'->>'name', ''))
    on conflict (salon_id, phone) do update set name = coalesce(nullif(excluded.name, ''), public.clients.name)
    returning id into cid;
  end if;
  if p->'repeat' is not null and jsonb_typeof(p->'repeat') = 'object' then
    rid := (p->'repeat'->>'id')::uuid;
    insert into public.repeat_rules (id, salon_id, every_weeks, times, created_by)
    values (rid, sid, (p->'repeat'->>'everyWeeks')::int, (p->'repeat'->>'times')::int, me) on conflict (id) do nothing;
  end if;
  insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, note, repeat_rule_id, ticket_id, created_by, updated_at, arrived_at, seat_reason)
  values (aid, sid, cid, coalesce(p->'client'->>'name', ''), public._salon_member(sid, nullif(p->>'staffId', '')::uuid), stime, etime,
          coalesce(p->'services', '[]'), st, coalesce(p->>'source', 'desk'), coalesce(p->>'note', ''), rid, nullif(p->>'ticketId', '')::uuid, me, edit,
          nullif(p->>'arrivedAt', '')::timestamptz, nullif(left(p->>'seatReason', 80), ''))
  on conflict (id) do update set client_id = excluded.client_id, client_name = excluded.client_name, staff_id = excluded.staff_id,
    start_at = excluded.start_at, end_at = excluded.end_at, services = excluded.services, status = excluded.status, source = excluded.source,
    note = excluded.note, repeat_rule_id = coalesce(excluded.repeat_rule_id, public.appointments.repeat_rule_id),
    ticket_id = coalesce(excluded.ticket_id, public.appointments.ticket_id), updated_at = excluded.updated_at,
    arrived_at = coalesce(excluded.arrived_at, public.appointments.arrived_at), seat_reason = coalesce(excluded.seat_reason, public.appointments.seat_reason)
  returning * into a;

  -- Reminder texts: redo the queued ones; only for clients who said yes to texts, only for future, live bookings.
  delete from public.reminders where appointment_id = a.id and status = 'queued';
  select texts_ok into ok_texts from public.clients where id = a.client_id;
  if coalesce(ok_texts, false) and a.status in ('booked', 'confirmed') and a.start_at > now() then
    insert into public.reminders (salon_id, appointment_id, kind, send_at)
    select sid, a.id, k, w from (values
      ('confirm', now()),
      ('day_before', a.start_at - interval '1 day'),
      ('two_hours', a.start_at - interval '2 hours')) v(k, w)
    where w >= now() - interval '1 minute' and (k <> 'confirm' or not exists (select 1 from public.reminders r where r.appointment_id = a.id and r.kind = 'confirm'));
  end if;

  select count(*) into n from public.appointments o
  where o.salon_id = sid and o.id <> a.id and o.staff_id = a.staff_id and a.staff_id is not null
    and o.status not in ('canceled', 'no_show', 'walked_out') and a.status not in ('canceled', 'no_show', 'walked_out')
    and o.start_at < a.end_at and o.end_at > a.start_at;
  return jsonb_build_object('id', a.id, 'overlaps', n);
end $$;

-- Bookings in a time range, with what the desk needs on the card (client name/phone, allergy flag, visits).
create or replace function public.appt_list(p_salon uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'start', a.start_at, 'end', a.end_at, 'staffId', a.staff_id, 'status', a.status, 'source', a.source, 'note', a.note,
    'services', a.services, 'ticketId', a.ticket_id, 'repeatRuleId', a.repeat_rule_id, 'updatedAt', a.updated_at,
    'arrivedAt', a.arrived_at, 'seatReason', a.seat_reason,
    'client', case when a.client_id is null then jsonb_build_object('name', a.client_name, 'phone', '')
              else jsonb_build_object('id', c.id, 'name', coalesce(nullif(c.name, ''), a.client_name), 'phone', c.phone, 'care', c.care <> '', 'textsOk', c.texts_ok) end,
    'ticketStatus', (select t.status from public.tickets t where t.id = a.ticket_id)
  ) order by a.start_at), '[]'::jsonb)
  from public.appointments a left join public.clients c on c.id = a.client_id
  where a.salon_id = p_salon and public.is_member(p_salon) and a.start_at < p_to and a.end_at > p_from;
$$;

-- Walk-ins today: waits + walk-outs (facts for Today and Owner numbers).
create function public.walkin_day(p_salon uuid, p_day date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with w as (
    select a.status, coalesce(a.arrived_at, a.start_at) as came,
      case when a.status = 'walked_out' then a.end_at when a.status in ('arrived', 'done') then a.start_at end as left_or_seated
    from public.appointments a join public.salons s on s.id = a.salon_id
    where a.salon_id = p_salon and a.source in ('kiosk', 'walk_in') and (coalesce(a.arrived_at, a.start_at) at time zone s.time_zone)::date = p_day)
  select case when public.is_member(p_salon) then jsonb_build_object(
    'walkIns', count(*),
    'waiting', count(*) filter (where status in ('booked', 'confirmed')),
    'seated', count(*) filter (where status in ('arrived', 'done')),
    'walkedOut', count(*) filter (where status = 'walked_out'),
    'avgWaitMin', coalesce(round(avg(extract(epoch from left_or_seated - came) / 60) filter (where status in ('arrived', 'done'))), 0),
    'longestWaitMin', coalesce(round(max(extract(epoch from left_or_seated - came) / 60)), 0)) end
  from w;
$$;
revoke execute on function public.walkin_day(uuid, date) from public, anon;
grant execute on function public.walkin_day(uuid, date) to authenticated;
