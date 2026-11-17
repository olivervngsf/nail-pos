-- Session 6 (M7): booking calendar (desk). Booking board D1–D13, W1–W2, M1–M2.
-- One row per booking, made on the device (offline OK) and saved whole each time (same id = same row; newest edit wins).
-- Overlaps are allowed and shown (never auto-moved). Reminder texts are queued only for clients who said yes to texts;
-- sending starts once the salon's text number is set up (session "texting").

create table public.repeat_rules (
  id uuid primary key,
  salon_id uuid not null references public.salons(id),
  every_weeks int not null check (every_weeks between 1 and 12),
  times int not null check (times between 2 and 26),
  created_by uuid references public.memberships(id),
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key,                                     -- made on the device
  salon_id uuid not null references public.salons(id),
  client_id uuid references public.clients(id),
  client_name text not null default '',
  staff_id uuid references public.memberships(id),         -- null = anyone
  start_at timestamptz not null,
  end_at timestamptz not null,
  services jsonb not null default '[]',                    -- [{serviceId, name, minutes, cents}]
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'arrived', 'done', 'no_show', 'canceled')),
  source text not null default 'desk' check (source in ('desk', 'phone', 'walk_in', 'web', 'google', 'text', 'staff')),
  note text not null default '',
  repeat_rule_id uuid references public.repeat_rules(id),
  ticket_id uuid,                                          -- set at check-in (the ticket may sync after)
  created_by uuid references public.memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index on public.appointments (salon_id, start_at);
create index on public.appointments (client_id);

create table public.reminders (
  id bigserial primary key,
  salon_id uuid not null references public.salons(id),
  appointment_id uuid not null references public.appointments(id),
  kind text not null check (kind in ('confirm', 'day_before', 'two_hours')),
  send_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped')),
  created_at timestamptz not null default now()
);
create index on public.reminders (status, send_at);

do $$ declare t text; begin
  foreach t in array array['repeat_rules', 'appointments', 'reminders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member(salon_id))', t);
  end loop;
end $$;

-- ---------- save a booking (whole row) ----------
-- p: { id, salonId, start, end, staffId?, client?: {phone, name}, services: [...], status?, source?, note?, ticketId?,
--      repeat?: {id, everyWeeks, times}, updatedAt (device time of this edit) }
-- Returns { id, overlaps } (other live bookings for the same staff at the same time).
create function public.appt_save(p jsonb) returns jsonb
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
  insert into public.appointments (id, salon_id, client_id, client_name, staff_id, start_at, end_at, services, status, source, note, repeat_rule_id, ticket_id, created_by, updated_at)
  values (aid, sid, cid, coalesce(p->'client'->>'name', ''), public._salon_member(sid, nullif(p->>'staffId', '')::uuid), stime, etime,
          coalesce(p->'services', '[]'), st, coalesce(p->>'source', 'desk'), coalesce(p->>'note', ''), rid, nullif(p->>'ticketId', '')::uuid, me, edit)
  on conflict (id) do update set client_id = excluded.client_id, client_name = excluded.client_name, staff_id = excluded.staff_id,
    start_at = excluded.start_at, end_at = excluded.end_at, services = excluded.services, status = excluded.status, source = excluded.source,
    note = excluded.note, repeat_rule_id = coalesce(excluded.repeat_rule_id, public.appointments.repeat_rule_id),
    ticket_id = coalesce(excluded.ticket_id, public.appointments.ticket_id), updated_at = excluded.updated_at
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
    and o.status not in ('canceled', 'no_show') and a.status not in ('canceled', 'no_show')
    and o.start_at < a.end_at and o.end_at > a.start_at;
  return jsonb_build_object('id', a.id, 'overlaps', n);
end $$;

-- Bookings in a time range, with what the desk needs on the card (client name/phone, allergy flag, visits).
create function public.appt_list(p_salon uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'start', a.start_at, 'end', a.end_at, 'staffId', a.staff_id, 'status', a.status, 'source', a.source, 'note', a.note,
    'services', a.services, 'ticketId', a.ticket_id, 'repeatRuleId', a.repeat_rule_id, 'updatedAt', a.updated_at,
    'client', case when a.client_id is null then jsonb_build_object('name', a.client_name, 'phone', '')
              else jsonb_build_object('id', c.id, 'name', coalesce(nullif(c.name, ''), a.client_name), 'phone', c.phone, 'care', c.care <> '', 'textsOk', c.texts_ok) end,
    'ticketStatus', (select t.status from public.tickets t where t.id = a.ticket_id)
  ) order by a.start_at), '[]'::jsonb)
  from public.appointments a left join public.clients c on c.id = a.client_id
  where a.salon_id = p_salon and public.is_member(p_salon) and a.start_at < p_to and a.end_at > p_from;
$$;

revoke execute on function public.appt_save(jsonb), public.appt_list(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.appt_save(jsonb), public.appt_list(uuid, timestamptz, timestamptz) to authenticated;
