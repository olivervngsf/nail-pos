-- Activity log (Settings → Activity log, Nov 26): one read-only list for the owner + manager of everything that
-- happened in the salon on a day range: PIN tries, clock in/out, money, client, settings, team, device, support rows.
-- Sources: audit_log (server-written, nobody edits it) + clock_events. Founder Admin rows (admin.*) stay private to us.
-- Never returns a PIN, card number, full phone, IP address or code: those keys are cut from the detail.
create function public.activity_log(p_salon uuid, p_from timestamptz, p_to timestamptz)
returns table (
  at timestamptz, action text, actor text, actor_role public.member_role, subject text,
  device text, device_id uuid, detail jsonb
)
language sql stable security definer set search_path = '' as $$
  with win as (
    select greatest(coalesce(p_from, now() - interval '1 day'), coalesce(p_to, now()) - interval '93 days') as f,
           coalesce(p_to, now()) as t
  )
  select * from (
    select a.at, a.action,
      coalesce(pe.name, case when a.action like 'pin.%' or a.action = 'desk.locked' then sm.display_name end) as actor,
      coalesce(am.role, case when a.action like 'pin.%' or a.action = 'desk.locked' then sm.role end) as actor_role,
      case when a.action like 'pin.%' or a.action = 'desk.locked' then null else sm.display_name end as subject,
      d.name, a.device_id,
      coalesce(a.detail, '{}'::jsonb) - array['ip', 'addr', 'to_addr', 'pin', 'pin_hash', 'code', 'token', 'email', 'membership', 'phone_number']
    from public.audit_log a
    cross join win
    left join public.people pe on pe.id = a.person_id
    left join public.memberships am on am.person_id = a.person_id and am.salon_id = a.salon_id
    left join public.memberships sm on sm.id = case when (a.detail->>'membership') ~ '^[0-9a-f-]{36}$' then (a.detail->>'membership')::uuid end
    left join public.devices d on d.id = a.device_id
    where a.salon_id = p_salon and a.at >= win.f and a.at < win.t
      and a.action not like 'admin.%'
    union all
    select c.at, 'clock.' || c.kind, m.display_name, m.role, null, d.name, c.device_id,
      jsonb_build_object('source', c.source) || case when c.by_person is not null and c.by_person <> m.person_id
        then jsonb_build_object('by', (select p.name from public.people p where p.id = c.by_person)) else '{}'::jsonb end
    from public.clock_events c
    cross join win
    join public.memberships m on m.id = c.membership_id
    left join public.devices d on d.id = c.device_id
    where c.salon_id = p_salon and c.at >= win.f and c.at < win.t
  ) x
  where public.is_admin(p_salon)
  order by 1 desc
  limit 3000;
$$;
revoke all on function public.activity_log(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.activity_log(uuid, timestamptz, timestamptz) to authenticated;
