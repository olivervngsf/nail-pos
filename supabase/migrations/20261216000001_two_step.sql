-- 2-step sign-in (M14). Anyone with a verified authenticator app (auth.mfa_factors) must finish the 6-digit step
-- (session aal2) before their person login opens any salon. No app set up = works as before. Salon devices (QR logins)
-- are not people, so they're not affected.
create or replace function public._aal_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;

create or replace function public.my_person_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.people p where p.auth_user_id = (select auth.uid()) and (select public._aal_ok());
$$;

create or replace function public.is_member(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null) and (select public._aal_ok()))
    or public._device_of(s, array['front_desk', 'clock', 'kiosk']);
$$;

create or replace function public.is_admin(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager')) and (select public._aal_ok()))
    or public._device_of(s, array['front_desk']);
$$;

create or replace function public._is_desk(p_salon uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = p_salon and p.auth_user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager', 'front_desk')) and (select public._aal_ok()))
    or public._device_of(p_salon, array['front_desk', 'kiosk']);
$$;

create or replace function public.is_owner(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = s and p.auth_user_id = (select auth.uid()) and m.archived_at is null and m.role = 'owner')
    and (select public._aal_ok());
$$;

create or replace function public._is_owner(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner(s);
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where auth_user_id = (select auth.uid())) and (select public._aal_ok());
$$;

-- my_memberships: people rows only after the 2-step (device rows unchanged).
create or replace function public.my_memberships()
returns table (membership_id uuid, salon_id uuid, salon_name text, role public.member_role, display_name text, setup_step smallint, has_pin boolean, language text)
language sql stable security definer set search_path = '' as $$
  select x.membership_id, x.salon_id, x.salon_name, x.role, x.display_name, x.setup_step, x.has_pin, x.language from (
    select m.id as membership_id, s.id as salon_id, s.name as salon_name, m.role, m.display_name, s.setup_step, m.pin_hash is not null as has_pin, p.language,
      (m.role = 'owner') as is_owner, s.created_at
    from public.memberships m join public.salons s on s.id = m.salon_id join public.people p on p.id = m.person_id
    where p.auth_user_id = (select auth.uid()) and m.archived_at is null and s.archived_at is null and (select public._aal_ok())
    union all
    select null::uuid, s.id, s.name, (case when d.kind = 'front_desk' then 'manager' else 'front_desk' end)::public.member_role,
      d.name, s.setup_step, false, 'en', false, s.created_at
    from public.device_logins dl join public.devices d on d.id = dl.device_id join public.salons s on s.id = d.salon_id
    where dl.auth_user_id = (select auth.uid()) and d.archived_at is null and s.archived_at is null
  ) x order by x.is_owner desc, x.created_at;
$$;

-- The app asks: does this login still owe the 2-step code? (true = show the code screen)
create or replace function public.two_step_needed() returns boolean
language sql stable security definer set search_path = '' as $$ select not public._aal_ok(); $$;

revoke execute on function public._aal_ok() from public, anon;
grant execute on function public._aal_ok() to authenticated;
revoke execute on function public.two_step_needed() from public, anon;
grant execute on function public.two_step_needed() to authenticated;
