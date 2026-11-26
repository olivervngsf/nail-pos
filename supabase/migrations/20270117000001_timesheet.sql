-- Timesheet (Settings → Team + time clock → Timesheet, Nov 26): every clock in/out per person per day, plus fixes.
-- A fix never hides what happened: the old time is kept in clock_fixes (who, when, why), the clock event gets the
-- real time so pay sheets use it, and the Activity log shows "Clock time fixed". A missing clock-out can be added.
alter table public.clock_events drop constraint if exists clock_events_source_check;
alter table public.clock_events add constraint clock_events_source_check check (source in ('pin', 'phone', 'fix'));

create table public.clock_fixes (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons(id),
  membership_id uuid not null references public.memberships(id),
  event_id bigint not null references public.clock_events(id),
  kind text not null check (kind in ('in', 'out')),
  old_at timestamptz,                 -- null = this clock-out/in was missing and was added
  new_at timestamptz not null,
  reason text not null check (reason in ('forgot', 'device_off', 'wrong_person', 'other')),
  note text,
  by_person uuid references public.people(id),
  at timestamptz not null default now()
);
create index on public.clock_fixes (salon_id, at desc);
create index on public.clock_fixes (event_id);
alter table public.clock_fixes enable row level security;
create policy "admins read clock fixes" on public.clock_fixes for select to authenticated using (public.is_admin(salon_id));
create policy "own clock fixes" on public.clock_fixes for select to authenticated
  using (exists (select 1 from public.memberships m where m.id = membership_id and m.person_id = public.my_person_id()));

-- One row per active team member: their punches in the day range (salon's own days), any fix on each punch,
-- and refused phone clock-ins. Owner + manager only.
create function public.timesheet(p_salon uuid, p_from date, p_to date)
returns table (membership_id uuid, name text, role public.member_role, events jsonb, refused jsonb)
language sql stable security definer set search_path = '' as $$
  with s as (select time_zone tz from public.salons where id = p_salon),
  win as (
    select (greatest(p_from, p_to - 62)::timestamp at time zone s.tz) f, ((p_to + 1)::timestamp at time zone s.tz) t, s.tz
    from s
  )
  select m.id, m.display_name, m.role,
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', c.id, 'kind', c.kind, 'at', c.at,
          'day', to_char(c.at at time zone win.tz, 'YYYY-MM-DD'),
          'via', coalesce(c.via, case when c.source = 'fix' then 'fix' when c.device_id is not null then 'device' else c.source end),
          'device', d.name,
          'fix', (select jsonb_build_object('old_at', f.old_at, 'reason', f.reason, 'note', f.note,
                    'by', coalesce(pe.name, 'Owner'), 'at', f.at)
                  from public.clock_fixes f left join public.people pe on pe.id = f.by_person
                  where f.event_id = c.id order by f.at desc limit 1)
        ) order by c.at)
      from public.clock_events c left join public.devices d on d.id = c.device_id
      where c.membership_id = m.id and c.at >= win.f and c.at < win.t
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('at', a.at, 'day', to_char(a.at at time zone win.tz, 'YYYY-MM-DD'),
          'reason', a.detail->>'reason') order by a.at)
      from public.audit_log a
      where a.salon_id = p_salon and a.action = 'clock.refused' and a.person_id = m.person_id
        and a.at >= win.f and a.at < win.t
    ), '[]'::jsonb)
  from public.memberships m cross join win
  where m.salon_id = p_salon and m.archived_at is null and public.is_admin(p_salon)
  order by (m.role = 'owner') desc, m.role, m.display_name;
$$;

-- Fix one punch (p_event) or add a missing one (p_event null). Owner + manager only; logged.
create function public.clock_fix(p_salon uuid, p_membership uuid, p_event bigint, p_kind text, p_at timestamptz,
  p_reason text, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare old timestamptz; eid bigint; me uuid := public.my_person_id(); self boolean;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.memberships where id = p_membership and salon_id = p_salon) then raise exception 'not on this team'; end if;
  if p_at is null or p_at > now() + interval '5 minutes' then raise exception 'time can not be in the future'; end if;
  if p_reason not in ('forgot', 'device_off', 'wrong_person', 'other') then raise exception 'reason needed'; end if;
  if p_event is not null then
    select at, kind into old, p_kind from public.clock_events where id = p_event and membership_id = p_membership and salon_id = p_salon;
    if old is null then raise exception 'punch not found'; end if;
    update public.clock_events set at = p_at where id = p_event;
    eid := p_event;
  else
    if p_kind not in ('in', 'out') then raise exception 'in or out'; end if;
    insert into public.clock_events (salon_id, membership_id, kind, source, by_person, at)
      values (p_salon, p_membership, p_kind, 'fix', me, p_at) returning id into eid;
  end if;
  insert into public.clock_fixes (salon_id, membership_id, event_id, kind, old_at, new_at, reason, note, by_person)
    values (p_salon, p_membership, eid, p_kind, old, p_at, p_reason, nullif(trim(coalesce(p_note, '')), ''), me);
  self := exists (select 1 from public.memberships where id = p_membership and person_id = me);
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, me, 'clock.fix', jsonb_build_object('membership', p_membership, 'kind', p_kind,
      'old_at', old, 'new_at', p_at, 'reason', p_reason, 'self', self));
  return eid;
end $$;

revoke all on function public.timesheet(uuid, date, date), public.clock_fix(uuid, uuid, bigint, text, timestamptz, text, text) from public, anon;
grant execute on function public.timesheet(uuid, date, date), public.clock_fix(uuid, uuid, bigint, text, timestamptz, text, text) to authenticated;
