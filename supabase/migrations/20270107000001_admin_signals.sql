-- Salon health table (Admin Texting board, tab 4 "Health table", Oliver Nov 20): one row per salon, one word per check.
-- 1) app_vitals: how fast + smooth the app runs on each salon's devices (page loads, slow loads, errors), per salon per day.
--    Written only by vitals_report (a salon device, same rule as device_ping); read only by admins. Counts only, no screens'
--    content, no names.
-- 2) admin_health adds: last Stripe message, card payments today, speed (last 2 days), texts in 30 days (sent / failed / promo).
-- 3) admin_signals(salon): the salon page tabs: last Stripe messages (type + ticket #, never payload), speed per day,
--    texts per kind (30 days).

create table public.app_vitals (
  salon_id uuid not null references public.salons(id),
  day date not null default current_date,
  loads int not null default 0,
  load_ms bigint not null default 0,
  slow int not null default 0,
  errors int not null default 0,
  last_error text,
  primary key (salon_id, day)
);
alter table public.app_vitals enable row level security;   -- no policies: server functions only

create function public.vitals_report(p_device uuid, p_loads int, p_load_ms bigint, p_slow int, p_errors int, p_last_error text default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.devices;
begin
  select * into d from public.devices where id = p_device and archived_at is null;
  if d.id is null or not public.is_member(d.salon_id) then return false; end if;
  -- a device reports every few minutes: keep numbers sane whatever it sends
  if p_loads < 0 or p_loads > 500 or p_slow < 0 or p_slow > p_loads or p_errors < 0 or p_errors > 500
     or p_load_ms < 0 or p_load_ms > p_loads::bigint * 120000 then return false; end if;
  insert into public.app_vitals as a (salon_id, day, loads, load_ms, slow, errors, last_error)
    values (d.salon_id, current_date, p_loads, p_load_ms, p_slow, p_errors, left(p_last_error, 200))
  on conflict (salon_id, day) do update set loads = a.loads + excluded.loads, load_ms = a.load_ms + excluded.load_ms,
    slow = a.slow + excluded.slow, errors = a.errors + excluded.errors, last_error = coalesce(excluded.last_error, a.last_error);
  return true;
end $$;
revoke all on function public.vitals_report(uuid, int, bigint, int, int, text) from public, anon;
grant execute on function public.vitals_report(uuid, int, bigint, int, int, text) to authenticated;

create function public.admin_signals(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'stripe', coalesce((select jsonb_agg(x order by x.at desc) from (
      select e.received_at as at, e.type, k.number as ticket from public.stripe_events e
      left join public.tickets k on k.id = e.ticket_id
      where e.salon_id = p_salon order by e.received_at desc limit 8) x), '[]'::jsonb),
    'stripe_week', jsonb_build_object(
      'pay', (select count(*) from public.stripe_events e where e.salon_id = p_salon and e.received_at > now() - interval '7 days' and e.type like 'payment_intent.%'),
      'matched', (select count(*) from public.stripe_events e where e.salon_id = p_salon and e.received_at > now() - interval '7 days' and e.type like 'payment_intent.%' and e.ticket_id is not null)),
    'vitals', coalesce((select jsonb_agg(jsonb_build_object('day', a.day, 'loads', a.loads, 'avg_ms', a.load_ms / nullif(a.loads, 0),
        'slow', a.slow, 'errors', a.errors, 'last_error', a.last_error) order by a.day desc)
      from public.app_vitals a where a.salon_id = p_salon and a.day > current_date - 7), '[]'::jsonb),
    'texts', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'sent', x.sent, 'failed', x.failed)) from (
      select m.kind, count(*) filter (where m.status in ('sent', 'delivered', 'failed'))::int as sent, count(*) filter (where m.status = 'failed')::int as failed
      from public.text_messages m where m.salon_id = p_salon and m.created_at > now() - interval '30 days' group by m.kind) x), '[]'::jsonb),
    'texts_daily', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'n', x.n, 'promo', x.promo) order by x.day) from (
      select (m.created_at at time zone 'America/Los_Angeles')::date as day, count(*)::int as n, count(*) filter (where m.kind = 'promo')::int as promo
      from public.text_messages m where m.salon_id = p_salon and m.created_at > now() - interval '30 days' and m.status in ('sent', 'delivered', 'failed') group by 1) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_signals(uuid) from public, anon;
grant execute on function public.admin_signals(uuid) to authenticated;

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
        nd.need, nd.due as need_due, nd.who as need_who,
        (select max(e.received_at) from public.stripe_events e where e.salon_id = s.id) as stripe_last_at,
        (select count(*)::int from public.payments p where p.salon_id = s.id and p.method in ('card_reader', 'pay_link') and p.at >= t.day_start) as cards_today,
        v.loads as speed_loads, v.avg_ms as speed_ms, v.slow as speed_slow, v.errors as speed_errors,
        tx.sent as texts_30d, tx.failed as texts_failed_30d, tx.promo as promos_30d
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
          max(k.paid_at) as last_ticket_at,
          min(z.start) as day_start
        from (select (date_trunc('day', now() at time zone s.time_zone) at time zone s.time_zone) as start) z
        left join public.tickets k on k.salon_id = s.id and k.status = 'paid' and k.paid_at >= z.start - interval '28 days'
      ) t on true
      left join lateral (select sum(a.loads)::int as loads, (sum(a.load_ms) / nullif(sum(a.loads), 0))::int as avg_ms,
          sum(a.slow)::int as slow, sum(a.errors)::int as errors
        from public.app_vitals a where a.salon_id = s.id and a.day >= current_date - 1) v on true
      left join lateral (select count(*) filter (where m.status in ('sent', 'delivered', 'failed'))::int as sent,
          count(*) filter (where m.status = 'failed')::int as failed,
          count(*) filter (where m.kind = 'promo' and m.status in ('sent', 'delivered'))::int as promo
        from public.text_messages m where m.salon_id = s.id and m.created_at > now() - interval '30 days') tx on true
      where s.archived_at is null
    ) x), '[]'::jsonb),
    'handled', coalesce((select jsonb_agg(jsonb_build_object('salon_id', h.salon_id, 'kind', h.kind, 'at', h.at,
        'by', coalesce((select p.name from public.people p where p.auth_user_id = h.handled_by), 'Admin')) order by h.at desc)
      from public.admin_alert_handled h where h.day = today), '[]'::jsonb),
    'archived', coalesce((select jsonb_agg(jsonb_build_object('salon_id', s.id, 'salon_name', s.name, 'archived_at', s.archived_at) order by s.archived_at desc)
      from public.salons s where s.archived_at is not null), '[]'::jsonb)
  );
end $$;
