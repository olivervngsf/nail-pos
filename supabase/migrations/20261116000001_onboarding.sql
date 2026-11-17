-- Salon setup (onboarding) tables. System Design rules:
-- one person = one account (auth.users, phone login); membership links person -> salon + role + PIN;
-- every salon row has salon_id + row-level security; money in cents; nothing deleted (archived_at).

create type public.member_role as enum ('owner', 'manager', 'front_desk', 'tech');
create type public.pay_type as enum ('commission', 'hourly', 'booth_rent');

create table public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  state text not null default 'CA',
  -- Card fee on tips is locked off in CA + MN (enforced in app + here).
  tip_fee_passthrough boolean not null default false
    check (not (tip_fee_passthrough and state in ('CA', 'MN'))),
  setup_step smallint not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  user_id uuid references auth.users(id),          -- null until the invite is accepted
  display_name text not null,
  phone text not null,
  role public.member_role not null,
  pay_type public.pay_type,
  commission_pct numeric(5,2),
  hourly_cents integer check (hourly_cents >= 0),
  pin_hash text,                                    -- bcrypt via pgcrypto; never the raw PIN
  language text not null default 'en' check (language in ('en', 'vi')),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (salon_id, phone)
);
create index on public.memberships (user_id);

create table public.invites (
  code text primary key,
  salon_id uuid not null references public.salons(id),
  membership_id uuid not null references public.memberships(id),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.salon_hours (
  salon_id uuid not null references public.salons(id),
  weekday smallint not null check (weekday between 0 and 6),  -- 0 = Mon
  is_open boolean not null default true,
  opens time,
  closes time,
  primary key (salon_id, weekday),
  check (not is_open or closes > opens)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  category text not null,
  name text not null,
  minutes integer not null check (minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on public.services (salon_id);

-- Data wall helpers (security definer so policies don't recurse into memberships RLS).
create function public.is_member(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
    where m.salon_id = s and m.user_id = (select auth.uid()) and m.archived_at is null);
$$;
create function public.is_admin(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
    where m.salon_id = s and m.user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager'));
$$;

alter table public.salons enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.salon_hours enable row level security;
alter table public.services enable row level security;

create policy "members read salon" on public.salons for select to authenticated using (public.is_member(id));
create policy "admins update salon" on public.salons for update to authenticated using (public.is_admin(id));

create policy "members read team" on public.memberships for select to authenticated using (public.is_member(salon_id));
create policy "admins add team" on public.memberships for insert to authenticated with check (public.is_admin(salon_id));
create policy "admins edit team" on public.memberships for update to authenticated using (public.is_admin(salon_id));

create policy "admins manage invites" on public.invites for all to authenticated
  using (public.is_admin(salon_id)) with check (public.is_admin(salon_id));

create policy "members read hours" on public.salon_hours for select to authenticated using (public.is_member(salon_id));
create policy "admins write hours" on public.salon_hours for all to authenticated
  using (public.is_admin(salon_id)) with check (public.is_admin(salon_id));

create policy "members read services" on public.services for select to authenticated using (public.is_member(salon_id));
create policy "admins write services" on public.services for all to authenticated
  using (public.is_admin(salon_id)) with check (public.is_admin(salon_id));

-- New salon: creates the salon + owner membership in one step (owner can't pass the RLS check before they exist).
create function public.create_salon(p_name text, p_state text, p_owner_name text, p_owner_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  insert into public.salons (name, state) values (p_name, coalesce(p_state, 'CA')) returning id into sid;
  insert into public.memberships (salon_id, user_id, display_name, phone, role)
    values (sid, (select auth.uid()), p_owner_name, p_owner_phone, 'owner');
  return sid;
end $$;
revoke execute on function public.create_salon from public, anon;
grant execute on function public.create_salon to authenticated;
