-- Founder Admin v1 (Nov 18): home = alerts inbox, Salons tab = control table.
-- Health only: totals per salon (tickets, $ today, Stripe, devices, setup). Never client or staff private data.
-- Alerts are worked out in the app (src/lib/admin/health.ts) from these facts; "Handled" is stored here per salon + kind + day
-- and written to the salon's audit_log so the owner can see we looked.

create table public.admin_alert_handled (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons(id),
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  day date not null,
  handled_by uuid not null references auth.users(id),
  at timestamptz not null default now(),
  unique (salon_id, kind, day)
);
alter table public.admin_alert_handled enable row level security;
-- No policies: only the functions below read or write it.

create function public.admin_health() returns jsonb
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
        (select max(l.at) from public.audit_log l where l.salon_id = s.id) as last_activity_at
      from public.salons s
      left join lateral (select * from public.memberships m where m.salon_id = s.id and m.role = 'owner' and m.archived_at is null order by m.created_at limit 1) o on true
      left join public.stripe_accounts a on a.salon_id = s.id
      left join lateral (
        select
          count(*) filter (where k.paid_at >= z.start)::int as tickets_today,
          coalesce(sum(k.total_cents) filter (where k.paid_at >= z.start), 0)::bigint as cents_today,
          count(*) filter (where k.paid_at >= z.start - interval '7 days' and k.paid_at < now() - interval '7 days')::int as tickets_week_ago,
          count(*) filter (where k.paid_at >= now() - interval '7 days')::int as tickets_7d,
          max(k.paid_at) as last_ticket_at
        from (select (date_trunc('day', now() at time zone s.time_zone) at time zone s.time_zone) as start) z
        left join public.tickets k on k.salon_id = s.id and k.status = 'paid' and k.paid_at >= z.start - interval '7 days'
      ) t on true
      where s.archived_at is null
    ) x), '[]'::jsonb),
    'handled', coalesce((select jsonb_agg(jsonb_build_object('salon_id', h.salon_id, 'kind', h.kind, 'at', h.at,
        'by', coalesce((select p.name from public.people p where p.auth_user_id = h.handled_by), 'Admin')) order by h.at desc)
      from public.admin_alert_handled h where h.day = today), '[]'::jsonb)
  );
end $$;

create function public.admin_handle(p_salon uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  insert into public.admin_alert_handled (salon_id, kind, day, handled_by) values (p_salon, p_kind, today, (select auth.uid()))
    on conflict (salon_id, kind, day) do nothing;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'admin.alert_handled', jsonb_build_object('kind', p_kind));
end $$;

revoke all on function public.admin_health() from public, anon;
revoke all on function public.admin_handle(uuid, text) from public, anon;
grant execute on function public.admin_health() to authenticated;
grant execute on function public.admin_handle(uuid, text) to authenticated;
