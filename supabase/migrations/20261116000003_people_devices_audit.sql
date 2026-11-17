-- M0: one person = one account. `people` holds the human (phone, name, language); memberships point at a person.
-- Also: salon devices (front desk iPad etc.) and an audit log (who did what). Salon wall now checks via people.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id),
  phone text not null unique,                       -- +1XXXXXXXXXX
  email text,
  name text not null,
  language text not null default 'en' check (language in ('en', 'vi')),
  photo_url text,
  created_at timestamptz not null default now()
);

alter table public.memberships add column person_id uuid references public.people(id);
create index on public.memberships (person_id);
alter table public.memberships
  add column license_no text,
  add column license_state text,
  add column license_expires date,
  add column pin_fails smallint not null default 0,
  add column pin_locked_until timestamptz;

-- Backfill people for memberships made before this table existed.
insert into public.people (auth_user_id, phone, name)
select distinct on (m.user_id) m.user_id, m.phone, m.display_name
from public.memberships m where m.user_id is not null
on conflict do nothing;
update public.memberships m set person_id = p.id from public.people p where p.auth_user_id = m.user_id and m.person_id is null;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  name text not null,
  kind text not null default 'front_desk' check (kind in ('front_desk', 'kiosk', 'owner')),
  signed_in_by uuid references public.people(id),
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on public.devices (salon_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  salon_id uuid references public.salons(id),
  person_id uuid references public.people(id),
  device_id uuid references public.devices(id),
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);
create index on public.audit_log (salon_id, at desc);

-- The signed-in person (null when not signed in).
create function public.my_person_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.people p where p.auth_user_id = (select auth.uid());
$$;

-- Salon wall, now through people.
create or replace function public.is_member(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null);
$$;
create or replace function public.is_admin(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager'));
$$;

-- New salon: the signed-in person (made if new) becomes its owner.
create or replace function public.create_salon(p_name text, p_state text, p_owner_name text, p_owner_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; pid uuid;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  insert into public.people (auth_user_id, phone, name)
    values ((select auth.uid()), p_owner_phone, p_owner_name)
    on conflict (auth_user_id) do update set name = coalesce(nullif(excluded.name, ''), public.people.name)
    returning id into pid;
  insert into public.salons (name, state) values (p_name, coalesce(p_state, 'CA')) returning id into sid;
  insert into public.memberships (salon_id, user_id, person_id, display_name, phone, role)
    values (sid, (select auth.uid()), pid, p_owner_name, p_owner_phone, 'owner');
  insert into public.audit_log (salon_id, person_id, action) values (sid, pid, 'salon.created');
  return sid;
end $$;

alter table public.people enable row level security;
alter table public.devices enable row level security;
alter table public.audit_log enable row level security;

-- People: you see and edit yourself; you see the names of people in your salons.
create policy "self read" on public.people for select to authenticated using (auth_user_id = (select auth.uid()));
create policy "self update" on public.people for update to authenticated using (auth_user_id = (select auth.uid()));
create policy "salon mates read" on public.people for select to authenticated using (
  exists (select 1 from public.memberships m where m.person_id = people.id and public.is_member(m.salon_id)));

create policy "members read devices" on public.devices for select to authenticated using (public.is_member(salon_id));
create policy "admins manage devices" on public.devices for all to authenticated
  using (public.is_admin(salon_id)) with check (public.is_admin(salon_id));

-- Audit log: owners/managers read; only server functions write (no insert policy).
create policy "admins read audit" on public.audit_log for select to authenticated using (public.is_admin(salon_id));

revoke execute on function public.my_person_id() from public, anon;
grant execute on function public.my_person_id() to authenticated;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
revoke execute on function public.create_salon(text, text, text, text) from public, anon;
grant execute on function public.create_salon(text, text, text, text) to authenticated;
