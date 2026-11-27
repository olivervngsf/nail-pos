-- Bug (Nov 26, Oliver's live test): every desk save of a booking (calendar sync, drag, "here", seat) deleted the
-- booking's waiting reminders and made new ones with no phone / email, so a booking-page reminder that knew where
-- to go was replaced by one that got skipped ("no phone or email on this booking").
-- Now: waiting reminders are kept as they are and only move when the booking's time changes; a booking that is
-- no longer live (canceled, no-show, walked out, arrived…) skips its waiting reminders; a desk booking for a client
-- who said yes to texts gets text reminders to the client's phone (once per kind). No bare "confirm" rows any more:
-- nothing sends them for desk bookings.
create or replace function public.appt_save(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  aid uuid := (p->>'id')::uuid; sid uuid := (p->>'salonId')::uuid;
  a public.appointments; cid uuid; st text := coalesce(p->>'status', 'booked'); ok_texts boolean; cphone text;
  stime timestamptz := (p->>'start')::timestamptz; etime timestamptz := (p->>'end')::timestamptz;
  edit timestamptz := least(now(), coalesce((p->>'updatedAt')::timestamptz, now())); rid uuid; me uuid; n int;
  old_start timestamptz;
begin
  if aid is null or sid is null then raise exception 'booking id and salon required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  select * into a from public.appointments where id = aid for update;
  if a.id is not null and a.salon_id <> sid then raise exception 'not allowed'; end if;
  -- An older edit arriving late (offline device) never overwrites a newer one.
  if a.id is not null and a.updated_at > edit then
    return jsonb_build_object('id', a.id, 'stale', true);
  end if;
  old_start := a.start_at;
  me := public._me_in(sid);
  if coalesce(p->'client'->>'phone', '') <> '' then
    insert into public.clients (salon_id, phone, name) values (sid, p->'client'->>'phone', coalesce(p->'client'->>'name', ''))
    on conflict (salon_id, phone) do update set name = coalesce(nullif(public.clients.name, ''), excluded.name) -- never renames a client
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

  -- Reminders: keep the waiting ones (they know where to go); move them only when the time changed.
  if a.status in ('booked', 'confirmed') and a.start_at > now() then
    if old_start is distinct from a.start_at then
      update public.reminders set send_at = a.start_at  -- trigger _reminder_timing works out the real time
      where appointment_id = a.id and status = 'queued' and kind in ('day_before', 'two_hours');
    end if;
    select texts_ok, phone into ok_texts, cphone from public.clients where id = a.client_id;
    if coalesce(ok_texts, false) and coalesce(cphone, '') <> '' then
      insert into public.reminders (salon_id, appointment_id, kind, send_at, channel, to_addr)
      select sid, a.id, v.k, a.start_at, 'sms', cphone from (values ('day_before'), ('two_hours')) v(k)
      where not exists (select 1 from public.reminders r where r.appointment_id = a.id and r.kind = v.k);
    end if;
  else
    update public.reminders set status = 'skipped', error = 'booking ' || replace(a.status, '_', ' ')
    where appointment_id = a.id and status = 'queued' and kind in ('day_before', 'two_hours');
  end if;

  select count(*) into n from public.appointments o
  where o.salon_id = sid and o.id <> a.id and o.staff_id = a.staff_id and a.staff_id is not null
    and o.status not in ('canceled', 'no_show', 'walked_out') and a.status not in ('canceled', 'no_show', 'walked_out')
    and o.start_at < a.end_at and o.end_at > a.start_at;
  return jsonb_build_object('id', a.id, 'overlaps', n);
end $function$;

-- Bare confirm rows from old desk saves can never go out.
update public.reminders set status = 'skipped', error = 'no phone or email on this booking'
where status = 'queued' and kind = 'confirm' and coalesce(trim(to_addr), '') = '' and created_at < now() - interval '10 minutes';
