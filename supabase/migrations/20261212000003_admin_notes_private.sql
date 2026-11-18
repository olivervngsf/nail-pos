-- Call notes are ours only (Oliver, Elang). audit_log is readable by the salon's owner/manager, so notes move to their own
-- table with no policies (only the functions below touch it). admin_salon shows them in the salon's activity for admins.

create table public.admin_notes (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons(id),
  person_id uuid references public.people(id),
  text text not null check (length(text) between 1 and 1000),
  at timestamptz not null default now()
);
create index on public.admin_notes (salon_id, at desc);
alter table public.admin_notes enable row level security;

-- Any note already written to audit_log (test project only) moves over.
insert into public.admin_notes (salon_id, person_id, text, at)
  select salon_id, person_id, detail->>'text', at from public.audit_log where action = 'admin.note' and salon_id is not null;
delete from public.audit_log where action = 'admin.note';

create or replace function public.admin_note(p_salon uuid, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if length(trim(coalesce(p_text, ''))) = 0 or length(p_text) > 1000 then raise exception 'Note: 1 to 1000 characters' using errcode = '22023'; end if;
  insert into public.admin_notes (salon_id, person_id, text) values (p_salon, public.my_person_id(), trim(p_text));
end $$;

create or replace function public.admin_salon(p_salon uuid) returns jsonb
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
    'activity', coalesce((select jsonb_agg(row_to_json(e) order by e.at desc) from (
      (select l.at, l.action,
        case
          when l.action like 'admin.%' then coalesce((select p.name from public.people p where p.id = l.person_id), 'Admin')
          when l.person_id is null then 'System'
          else coalesce((select m.role::text from public.memberships m where m.salon_id = s.id and m.person_id = l.person_id order by m.created_at limit 1), 'Staff') end as who,
        null::text as note
       from public.audit_log l where l.salon_id = s.id and l.action <> 'pin.ok' order by l.at desc limit 200)
      union all
      (select n.at, 'admin.note', coalesce((select p.name from public.people p where p.id = n.person_id), 'Admin'), n.text
       from public.admin_notes n where n.salon_id = s.id order by n.at desc limit 50)
    ) e), '[]'::jsonb)
  );
end $$;
