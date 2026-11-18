-- Founder Admin · salon page (Nov 18): one salon's health, totals, devices, readers and activity log.
-- Health only: activity rows show WHAT happened and WHO (role or "Stripe"/"System"), never details like client names,
-- amounts per person, PINs or notes written by salon staff. Our own call notes (admin.note) are ours and show their text.

create function public.admin_salon(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.salons;
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into s from public.salons where id = p_salon and archived_at is null;
  if s.id is null then raise exception 'Salon not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'tickets', d.n, 'cents', d.c) order by d.day) from (
      select (k.paid_at at time zone s.time_zone)::date as day, count(*)::int as n, sum(k.total_cents)::bigint as c
      from public.tickets k
      where k.salon_id = s.id and k.status = 'paid' and k.paid_at >= now() - interval '8 days'
      group by 1) d), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'kind', d.kind, 'last_seen', d.last_seen) order by d.last_seen desc nulls last)
      from public.devices d where d.salon_id = s.id and d.archived_at is null), '[]'::jsonb),
    'readers', coalesce((select jsonb_agg(jsonb_build_object('label', r.label, 'simulated', r.simulated, 'added', r.created_at) order by r.created_at)
      from public.card_readers r where r.salon_id = s.id and r.archived_at is null), '[]'::jsonb),
    'roles', coalesce((select jsonb_object_agg(x.role, x.n) from (
      select m.role::text as role, count(*)::int as n from public.memberships m where m.salon_id = s.id and m.archived_at is null group by 1) x), '{}'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
        'at', l.at, 'action', l.action,
        'who', case
          when l.action like 'admin.%' then coalesce((select p.name from public.people p where p.id = l.person_id), 'Admin')
          when l.person_id is null then 'System'
          else coalesce((select m.role::text from public.memberships m where m.salon_id = s.id and m.person_id = l.person_id order by m.created_at limit 1), 'Staff') end,
        'note', case when l.action = 'admin.note' then l.detail->>'text' end) order by l.at desc)
      from (select * from public.audit_log a where a.salon_id = s.id and a.action not in ('pin.ok') order by a.at desc limit 200) l), '[]'::jsonb)
  );
end $$;

-- A call note from us (Oliver, Elang) on a salon: kept in that salon's activity log.
create function public.admin_note(p_salon uuid, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if length(trim(coalesce(p_text, ''))) = 0 or length(p_text) > 1000 then raise exception 'Note: 1 to 1000 characters' using errcode = '22023'; end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'admin.note', jsonb_build_object('text', trim(p_text)));
end $$;

revoke all on function public.admin_salon(uuid) from public, anon;
revoke all on function public.admin_note(uuid, text) from public, anon;
grant execute on function public.admin_salon(uuid) to authenticated;
grant execute on function public.admin_note(uuid, text) to authenticated;
