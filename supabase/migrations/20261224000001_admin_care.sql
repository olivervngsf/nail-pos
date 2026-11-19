-- Founder Admin · Salons page = design E "Salon care" (board Founder Admin Variations, Nov 18).
-- 1) Check-ins: when we last talked to a salon, how it was, what they need from us + a date and a name.
--    Admin-only table (RLS on, no policies): the salon never sees it. One open need per salon.
-- 2) 3-dot menu actions: edit salon details, archive (never delete) + restore.
-- 3) admin_health: last check-in, open need, plan next bill date, tickets in the 3 weeks before this one
--    (for the word busy / normal / quiet instead of sales), archived salons.

create table public.admin_checkins (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons(id),
  person_id uuid references public.people(id),
  mood text not null check (mood in ('happy', 'ok', 'help')),
  note text not null default '' check (length(note) <= 1000),
  need text not null default '' check (length(need) <= 300),
  due date,
  who text not null default '' check (length(who) <= 60),
  done_at timestamptz,
  at timestamptz not null default now()
);
create index on public.admin_checkins (salon_id, at desc);
alter table public.admin_checkins enable row level security;

create function public.admin_checkin(p_salon uuid, p_mood text, p_note text default '', p_need text default '', p_due date default null, p_who text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare n text := trim(coalesce(p_need, ''));
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_mood not in ('happy', 'ok', 'help') then raise exception 'Pick how it was' using errcode = '22023'; end if;
  if length(coalesce(p_note, '')) > 1000 or length(n) > 300 then raise exception 'Too long' using errcode = '22023'; end if;
  if not exists (select 1 from public.salons where id = p_salon) then raise exception 'Salon not found' using errcode = 'P0002'; end if;
  -- one open need per salon: a new one replaces the old one
  if n <> '' then update public.admin_checkins set done_at = now() where salon_id = p_salon and need <> '' and done_at is null; end if;
  insert into public.admin_checkins (salon_id, person_id, mood, note, need, due, who)
    values (p_salon, public.my_person_id(), p_mood, trim(coalesce(p_note, '')), n, case when n <> '' then p_due end, left(trim(coalesce(p_who, '')), 60));
  -- also in our private call notes, so it shows in the salon page's activity (admins only)
  insert into public.admin_notes (salon_id, person_id, text) values (p_salon, public.my_person_id(), left(
    'Check-in · ' || case p_mood when 'happy' then 'Happy' when 'ok' then 'OK' else 'Needs help' end
    || case when trim(coalesce(p_note, '')) <> '' then ': ' || trim(p_note) else '' end
    || case when n <> '' then ' → ' || n else '' end, 1000));
end $$;

create function public.admin_need_done(p_salon uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.admin_checkins set done_at = now() where salon_id = p_salon and need <> '' and done_at is null;
end $$;

-- Salon name + state: any time (logged where the owner can see it). Owner name / phone / email: only until the owner
-- has joined; after that they are the owner's own login details and only the owner changes them.
create function public.admin_salon_edit(p_salon uuid, p_name text, p_state text, p_owner text default null, p_phone text default null, p_email text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Salon name is needed' using errcode = '22023'; end if;
  update public.salons set name = trim(p_name), state = coalesce(nullif(trim(p_state), ''), state) where id = p_salon and archived_at is null;
  if not found then raise exception 'Salon not found' using errcode = 'P0002'; end if;
  select * into m from public.memberships where salon_id = p_salon and role = 'owner' and archived_at is null order by created_at limit 1;
  if m.id is not null and m.person_id is null then
    if p_phone is not null and p_phone !~ '^\+1[0-9]{10}$' then raise exception 'Phone like +14085550110' using errcode = '22023'; end if;
    update public.memberships set display_name = coalesce(nullif(trim(p_owner), ''), display_name), phone = coalesce(p_phone, phone),
      email = case when p_email is null then email else nullif(lower(trim(p_email)), '') end
    where id = m.id;
  end if;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, public.my_person_id(), 'admin.salon_edited', '{}'::jsonb);
end $$;

-- Archive = the salon is closed to its staff and gone from our lists; nothing is deleted and it can come back.
create function public.admin_salon_archive(p_salon uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.salons set archived_at = case when p_on then now() end where id = p_salon and (archived_at is null) = p_on;
  if not found then raise exception 'Salon not found' using errcode = 'P0002'; end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), case when p_on then 'admin.salon_archived' else 'admin.salon_restored' end, '{}'::jsonb);
end $$;

revoke all on function public.admin_checkin(uuid, text, text, text, date, text), public.admin_need_done(uuid),
  public.admin_salon_edit(uuid, text, text, text, text, text), public.admin_salon_archive(uuid, boolean) from public, anon;
grant execute on function public.admin_checkin(uuid, text, text, text, date, text), public.admin_need_done(uuid),
  public.admin_salon_edit(uuid, text, text, text, text, text), public.admin_salon_archive(uuid, boolean) to authenticated;

create or replace function public.admin_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'me', coalesce((select p.name from public.people p where p.auth_user_id = (select auth.uid())), ''),
    'now', now(),
    'salons', coalesce((select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
      select s.id as salon_id, s.name as salon_name, s.state, s.created_at, s.setup_step, s.time_zone,
        o.display_name as owner_name, o.phone as owner_phone, (o.person_id is not null) as owner_joined,
        (select max(i.created_at) from public.invites i where i.membership_id = o.id) as invited_at,
        exists (select 1 from public.invites i where i.membership_id = o.id and i.used_at is null and i.expires_at > now()) as invite_open,
        (select count(*)::int from public.memberships m where m.salon_id = s.id and m.archived_at is null) as staff,
        t.tickets_today, t.cents_today, t.tickets_week_ago, t.tickets_7d, t.last_ticket_at,
        a.account_id is not null as stripe_linked, coalesce(a.charges_enabled, false) as charges_enabled,
        coalesce(a.payouts_enabled, false) as payouts_enabled, coalesce(a.details_submitted, false) as details_submitted,
        (select count(*)::int from public.devices d where d.salon_id = s.id and d.archived_at is null) as devices,
        (select count(*)::int from public.devices d where d.salon_id = s.id and d.archived_at is null and d.last_seen > now() - interval '10 minutes') as devices_online,
        (select max(d.last_seen) from public.devices d where d.salon_id = s.id and d.archived_at is null) as device_last_seen,
        greatest(s.setup_step_at, (select max(l.at) from public.audit_log l where l.salon_id = s.id
          and l.action not like 'admin.%' and l.action not like 'pin.%')) as last_activity_at,
        coalesce(b.status, 'none') as plan_status, b.cycle as plan_cycle, b.trial_end,
        coalesce(ts.texting, 'not_started') as texting, ts.texting_at,
        b.current_period_end as plan_period_end, t.tickets_prev_21d,
        ci.at as checkin_at, ci.by as checkin_by, ci.mood as checkin_mood, ci.note as checkin_note,
        nd.need, nd.due as need_due, nd.who as need_who
      from public.salons s
      left join lateral (select * from public.memberships m where m.salon_id = s.id and m.role = 'owner' and m.archived_at is null order by m.created_at limit 1) o on true
      left join public.stripe_accounts a on a.salon_id = s.id
      left join public.salon_billing b on b.salon_id = s.id
      left join public.admin_salon_status ts on ts.salon_id = s.id
      left join lateral (select c.at, c.mood, c.note, coalesce((select p.name from public.people p where p.id = c.person_id), 'Admin') as by
        from public.admin_checkins c where c.salon_id = s.id order by c.at desc, c.id desc limit 1) ci on true
      left join lateral (select c.need, c.due, c.who
        from public.admin_checkins c where c.salon_id = s.id and c.need <> '' and c.done_at is null order by c.at desc, c.id desc limit 1) nd on true
      left join lateral (
        select
          count(*) filter (where k.paid_at >= z.start)::int as tickets_today,
          coalesce(sum(k.total_cents) filter (where k.paid_at >= z.start), 0)::bigint as cents_today,
          count(*) filter (where k.paid_at >= z.start - interval '7 days' and k.paid_at < now() - interval '7 days')::int as tickets_week_ago,
          count(*) filter (where k.paid_at >= now() - interval '7 days')::int as tickets_7d,
          count(*) filter (where k.paid_at >= now() - interval '28 days' and k.paid_at < now() - interval '7 days')::int as tickets_prev_21d,
          max(k.paid_at) as last_ticket_at
        from (select (date_trunc('day', now() at time zone s.time_zone) at time zone s.time_zone) as start) z
        left join public.tickets k on k.salon_id = s.id and k.status = 'paid' and k.paid_at >= z.start - interval '28 days'
      ) t on true
      where s.archived_at is null
    ) x), '[]'::jsonb),
    'handled', coalesce((select jsonb_agg(jsonb_build_object('salon_id', h.salon_id, 'kind', h.kind, 'at', h.at,
        'by', coalesce((select p.name from public.people p where p.auth_user_id = h.handled_by), 'Admin')) order by h.at desc)
      from public.admin_alert_handled h where h.day = today), '[]'::jsonb),
    'archived', coalesce((select jsonb_agg(jsonb_build_object('salon_id', s.id, 'salon_name', s.name, 'archived_at', s.archived_at) order by s.archived_at desc)
      from public.salons s where s.archived_at is not null), '[]'::jsonb)
  );
end $$;
