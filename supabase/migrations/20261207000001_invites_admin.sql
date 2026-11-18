-- Invite-only salons (Nov 17). Only platform admins (Oliver, Elang, our staff) create salons. The owner gets a link + code;
-- they sign in any way (phone code, email code, password, Google) and the invite attaches when their phone or verified email
-- matches, or when they type the code. Salon creation from the setup wizard is closed for everyone else.

-- ---------- platform admins (us) ----------
create table public.platform_admins (
  auth_user_id uuid primary key references auth.users(id),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security; -- no policies: only security definer functions read it

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where auth_user_id = (select auth.uid()));
$$;

-- ---------- invites can be matched by email too ----------
alter table public.memberships add column if not exists email text; -- also added by profile_pin_settings
create index if not exists memberships_email_lower on public.memberships (lower(email)) where email is not null;
alter table public.invites add column if not exists created_by uuid references auth.users(id);

-- Verified email of the signed-in user (Google + email codes are verified; an unconfirmed email never matches).
create function public._auth_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and coalesce(u.email, '') <> '' and u.email_confirmed_at is not null;
$$;

-- The person for this login. Signed in without a phone (Google / email): use the phone on the membership being claimed.
create function public._person_for(p_phone text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); pid uuid; owner uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select id into pid from public.people where auth_user_id = uid;
  if pid is not null then return pid; end if;
  if public._auth_phone() is not null then return public._ensure_person(p_name); end if;
  select id, auth_user_id into pid, owner from public.people where phone = p_phone;
  if pid is null then
    insert into public.people (auth_user_id, phone, email, name) values (uid, p_phone, public._auth_email(), coalesce(p_name, '')) returning id into pid;
  elsif owner is null then
    update public.people set auth_user_id = uid, email = coalesce(email, public._auth_email()) where id = pid;
  else
    raise exception 'phone has a login';
  end if;
  return pid;
end $$;

-- After sign-in: link every membership waiting for this phone OR this verified email.
create or replace function public.claim_memberships() returns int
language plpgsql security definer set search_path = '' as $$
declare ph text := public._auth_phone(); em text := public._auth_email(); pid uuid; fm public.memberships; n int;
begin
  select * into fm from public.memberships m
  where m.person_id is null and m.archived_at is null and (m.phone = ph or (em is not null and lower(m.email) = em))
  order by (m.phone = ph) desc nulls last, m.created_at limit 1;
  if ph is not null then
    pid := public._ensure_person(fm.display_name); -- same as before: raises if this phone belongs to another account
  else
    select id into pid from public.people where auth_user_id = (select auth.uid());
    if pid is null then
      if fm.id is null then return 0; end if;
      begin
        pid := public._person_for(fm.phone, fm.display_name);
      exception when raise_exception then
        return 0; -- the invite's phone already has another login: they can still type the code
      end;
    end if;
  end if;
  with c as (
    update public.memberships set person_id = pid, user_id = (select auth.uid())
    where person_id is null and archived_at is null and (phone = ph or (em is not null and lower(email) = em)) returning id, salon_id
  ), i as (
    update public.invites set used_at = now() where membership_id in (select id from c) and used_at is null returning 1
  ), a as (
    insert into public.audit_log (salon_id, person_id, action) select salon_id, pid, 'staff.joined' from c returning 1
  )
  select count(*) into n from c;
  return n;
end $$;

-- Typed or linked code: attach that invite to whoever is signed in. Returns the salon id.
create function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.invites; m public.memberships; pid uuid;
begin
  select * into i from public.invites where code = upper(replace(trim(p_code), '-', ''));
  if i.code is null then raise exception 'invite not found'; end if;
  select * into m from public.memberships where id = i.membership_id and archived_at is null;
  if m.id is null then raise exception 'invite not found'; end if;
  if m.person_id is not null and m.person_id = public.my_person_id() then return m.salon_id; end if; -- already yours
  if i.used_at is not null or m.person_id is not null then raise exception 'invite used'; end if;
  if i.expires_at < now() then raise exception 'invite expired'; end if;
  pid := public._person_for(m.phone, m.display_name);
  if exists (select 1 from public.memberships where salon_id = m.salon_id and person_id = pid and archived_at is null) then
    raise exception 'already in salon';
  end if;
  update public.memberships set person_id = pid, user_id = (select auth.uid()) where id = m.id;
  update public.invites set used_at = now() where code = i.code;
  insert into public.audit_log (salon_id, person_id, action, detail) values (m.salon_id, pid, 'invite.used', jsonb_build_object('role', m.role));
  return m.salon_id;
end $$;

-- get_invite: also accept codes typed with a dash / spaces.
create or replace function public.get_invite(p_code text)
returns table (salon_name text, display_name text, role public.member_role, owner_name text, phone_last4 text, status text)
language sql stable security definer set search_path = '' as $$
  select s.name, m.display_name, m.role,
    (select o.display_name from public.memberships o where o.salon_id = s.id and o.role = 'owner' order by o.created_at limit 1),
    right(m.phone, 4),
    case when i.used_at is not null or m.person_id is not null then 'used' when i.expires_at < now() then 'expired' else 'open' end
  from public.invites i join public.memberships m on m.id = i.membership_id join public.salons s on s.id = i.salon_id
  where i.code = upper(replace(trim(p_code), '-', '')) and m.archived_at is null;
$$;

-- 8 letters/numbers without look-alikes (no 0/O, 1/I/L): hard to guess, easy to read aloud.
create function public._invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    c := '';
    for k in 1..8 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from public.invites where code = c);
  end loop;
  return c;
end $$;

-- ---------- admin: create a salon + owner invite ----------
create function public.admin_create_salon(p_salon text, p_state text, p_owner text, p_phone text, p_email text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sid uuid := gen_random_uuid(); mid uuid := gen_random_uuid(); c text := public._invite_code();
begin
  if not public.is_platform_admin() then raise exception 'not allowed'; end if;
  if coalesce(trim(p_salon), '') = '' or coalesce(trim(p_owner), '') = '' then raise exception 'name required'; end if;
  if p_phone !~ '^\+1[0-9]{10}$' then raise exception 'phone like +14085550110'; end if;
  insert into public.salons (id, name, state) values (sid, trim(p_salon), coalesce(nullif(p_state, ''), 'CA'));
  insert into public.memberships (id, salon_id, display_name, phone, email, role)
    values (mid, sid, trim(p_owner), p_phone, nullif(lower(trim(coalesce(p_email, ''))), ''), 'owner');
  insert into public.invites (code, salon_id, membership_id, created_by) values (c, sid, mid, (select auth.uid()));
  insert into public.audit_log (salon_id, action, detail) values (sid, 'salon.created', jsonb_build_object('by', 'platform', 'admin', (select auth.uid())));
  return jsonb_build_object('salon_id', sid, 'code', c);
end $$;

-- New owner code (old one stops working). Only while the owner hasn't joined yet.
create function public.admin_new_code(p_salon uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; c text := public._invite_code();
begin
  if not public.is_platform_admin() then raise exception 'not allowed'; end if;
  select * into m from public.memberships where salon_id = p_salon and role = 'owner' and archived_at is null order by created_at limit 1;
  if m.id is null then raise exception 'no owner'; end if;
  if m.person_id is not null then raise exception 'owner already joined'; end if;
  update public.invites set expires_at = least(expires_at, now()) where membership_id = m.id and used_at is null;
  insert into public.invites (code, salon_id, membership_id, created_by) values (c, p_salon, m.id, (select auth.uid()));
  return c;
end $$;

-- Every salon, for our admin page: health only (no client data).
create function public.admin_salons()
returns table (salon_id uuid, salon_name text, state text, created_at timestamptz, setup_step smallint, owner_name text, owner_phone text,
  owner_email text, owner_joined boolean, code text, code_expires timestamptz, staff int)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.state, s.created_at, s.setup_step, o.display_name, o.phone, o.email, o.person_id is not null,
    (select i.code from public.invites i where i.membership_id = o.id and i.used_at is null and i.expires_at > now() order by i.created_at desc limit 1),
    (select i.expires_at from public.invites i where i.membership_id = o.id and i.used_at is null and i.expires_at > now() order by i.created_at desc limit 1),
    (select count(*)::int from public.memberships x where x.salon_id = s.id and x.archived_at is null)
  from public.salons s
  left join lateral (select * from public.memberships m where m.salon_id = s.id and m.role = 'owner' and m.archived_at is null order by m.created_at limit 1) o on true
  where public.is_platform_admin() and s.archived_at is null
  order by s.created_at desc;
$$;

-- ---------- close self-serve salon creation ----------
-- save_setup used to make a new salon for anyone signed in. Now only a salon that already exists (made by us) can be set up.
create or replace function public._no_self_serve_salon() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_platform_admin() then
    raise exception 'Salons are made by invite. Ask PolishOS for your invite link.';
  end if;
  return new;
end $$;
create trigger no_self_serve_salon before insert on public.salons for each row execute function public._no_self_serve_salon();

revoke execute on function public.is_platform_admin(), public._auth_email(), public._person_for(text, text), public.redeem_invite(text),
  public._invite_code(), public.admin_create_salon(text, text, text, text, text), public.admin_new_code(uuid), public.admin_salons(),
  public._no_self_serve_salon() from public, anon;
grant execute on function public.is_platform_admin(), public.redeem_invite(text), public.admin_create_salon(text, text, text, text, text),
  public.admin_new_code(uuid), public.admin_salons() to authenticated;
