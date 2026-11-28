-- Tech profiles on the salon page (Nov 27; board "Tech Profiles" https://claude.ai/artifact/7khMot9JgmGpUY959TP1QN ,
-- Oliver picked C = team row + quick sheet on the booking page, B = the full profile page).
-- A tech fills in their own profile on their phone (photo, about me, best at, languages, years, work photos);
-- the owner sees and edits everyone's, can "Ask to update", and OKs new work photos before clients see them.
-- Who may do what = three new rows on Settings → Roles (salons.role_perms):
--   pf.own  = edit their own profile      (default on for manager, front desk AND tech: a tech's first right)
--   pf.team = edit everyone's profile     (default on for manager, off for front desk; techs never)
--   pf.ok   = OK new work photos          (default on for manager, off for front desk; techs never)
-- Salon switches in salons.booking_settings: profiles_on (show profiles on the booking page, default on) and
-- photo_ok (new work photos wait for an OK, default on). Words show at once; only photos wait.
-- Clients never see a last name or a phone: the booking page gets the first word of the name only.

create table public.staff_profiles (
  membership_id uuid primary key references public.memberships(id),
  salon_id uuid not null references public.salons(id),
  about text not null default '' check (char_length(about) <= 120),
  best_at text[] not null default '{}',
  languages text[] not null default '{}',
  years int check (years between 0 and 60),
  photo_path text,
  updated_at timestamptz,
  updated_by uuid,
  asked_at timestamptz,
  asked_by uuid
);
create index on public.staff_profiles (salon_id);
alter table public.staff_profiles enable row level security; -- read + write only through the functions below

create table public.staff_photos (
  id uuid primary key,
  salon_id uuid not null references public.salons(id),
  membership_id uuid not null references public.memberships(id),
  path text not null,
  label text not null default '' check (char_length(label) <= 40),
  status text not null default 'waiting' check (status in ('waiting', 'shown', 'hidden')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create index on public.staff_photos (membership_id, status);
alter table public.staff_photos enable row level security;

-- Roles: the three new rows. Techs may hold pf.own only; everything else for techs stays "never".
create or replace function public._role_perm_default(p_role text, p_perm text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_role = 'owner' then true
    when p_perm = 'pf.own' then p_role in ('manager', 'front_desk', 'tech')
    when p_perm in ('pf.team', 'pf.ok') then p_role = 'manager'
    when p_role = 'manager' then true
    when p_role = 'front_desk' then false
    else false end $$;

create or replace function public._role_can(p_salon uuid, p_role text, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_role = 'owner' then true
    when p_role = 'tech' and p_perm <> 'pf.own' then false
    when p_role not in ('manager', 'front_desk', 'tech') then false
    else coalesce((select (s.role_perms->p_role->>p_perm)::boolean from public.salons s where s.id = p_salon),
                  public._role_perm_default(p_role, p_perm)) end $$;
revoke execute on function public._role_can(uuid, text, text) from public, anon, authenticated;

create or replace function public.role_perms_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text; k text; v jsonb; clean jsonb := '{}'::jsonb; one jsonb;
  keys text[] := array['ok.discount', 'ok.refund', 'ok.close', 'ok.client', 'ok.menu',
                       'set.salon', 'set.team', 'set.pay', 'set.clients', 'set.money', 'set.safety',
                       'pf.own', 'pf.team', 'pf.ok'];
begin
  if not (public.is_owner(p_salon) or public._support_on(p_salon)) then
    raise exception 'Only the owner can change roles + permissions' using errcode = '42501';
  end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'bad permissions' using errcode = '22023'; end if;
  for r in select jsonb_object_keys(p) loop
    if r not in ('manager', 'front_desk', 'tech') then raise exception 'Unknown role %', r using errcode = '22023'; end if;
    one := '{}'::jsonb;
    for k, v in select * from jsonb_each(p->r) loop
      if not (k = any(keys)) then raise exception 'Unknown permission %', k using errcode = '22023'; end if;
      if jsonb_typeof(v) <> 'boolean' then raise exception 'Permission % must be on or off', k using errcode = '22023'; end if;
      if r = 'front_desk' and k like 'set.%' then continue; end if; -- Settings stays owner + manager
      if r = 'tech' and k <> 'pf.own' then continue; end if;       -- techs: only their own profile
      if v::text::boolean <> public._role_perm_default(r, k) then one := one || jsonb_build_object(k, v); end if;
    end loop;
    if one <> '{}'::jsonb then clean := clean || jsonb_build_object(r, one); end if;
  end loop;
  update public.salons set role_perms = clean where id = p_salon;
  insert into public.audit_log (salon_id, action, detail) values (p_salon, 'roles.saved', jsonb_build_object('changed', clean));
  return clean;
end $$;

-- What the person signed in may do with one person's profile. Own login only (a shared salon device can't edit
-- profiles); owner-granted support access counts as the owner.
create function public._profile_can(p_salon uuid, p_membership uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me uuid; rl text;
begin
  select m.id, m.role::text into me, rl from public.memberships m
    where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
  if me is null then return public.is_admin(p_salon); end if;
  if rl = 'owner' then return true; end if;
  if p_perm = 'edit' then
    return (me = p_membership and public._role_can(p_salon, rl, 'pf.own')) or public._role_can(p_salon, rl, 'pf.team');
  end if;
  return public._role_can(p_salon, rl, p_perm);
end $$;
revoke execute on function public._profile_can(uuid, uuid, text) from public, anon;
grant execute on function public._profile_can(uuid, uuid, text) to authenticated; -- used by the Storage policies

create function public._profile_json(p_membership uuid, p_all_photos boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'membershipId', m.id, 'name', m.display_name, 'role', m.role,
    'about', coalesce(p.about, ''), 'bestAt', to_jsonb(coalesce(p.best_at, '{}')), 'languages', to_jsonb(coalesce(p.languages, '{}')),
    'years', p.years, 'photo', p.photo_path, 'updatedAt', p.updated_at,
    'updatedBy', (select coalesce(nullif(pe.name, ''), 'Someone') from public.people pe where pe.id = p.updated_by),
    'askedAt', p.asked_at,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'label', f.label, 'status', f.status, 'at', f.created_at)
        order by f.sort, f.created_at)
      from public.staff_photos f where f.membership_id = m.id and (p_all_photos or f.status = 'shown')), '[]'::jsonb))
  from public.memberships m left join public.staff_profiles p on p.membership_id = m.id
  where m.id = p_membership $$;
revoke execute on function public._profile_json(uuid, boolean) from public, anon, authenticated;

-- Owner screen: every tech's profile, photos (all statuses) and the two salon switches.
create function public.staff_profiles_list(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s jsonb;
begin
  if not public._profile_can(p_salon, null, 'pf.team') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select booking_settings into s from public.salons where id = p_salon;
  return jsonb_build_object(
    'profilesOn', coalesce((s->>'profiles_on')::boolean, true),
    'photoOk', coalesce((s->>'photo_ok')::boolean, true),
    'people', coalesce((select jsonb_agg(public._profile_json(m.id, true) order by m.display_name)
      from public.memberships m where m.salon_id = p_salon and m.archived_at is null and m.role = 'tech'), '[]'::jsonb));
end $$;

-- One profile (the tech's own, or anyone's for those who may edit the team).
create function public.staff_profile_get(p_salon uuid, p_membership uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s jsonb;
begin
  if not exists (select 1 from public.memberships where id = p_membership and salon_id = p_salon) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not public._profile_can(p_salon, p_membership, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select booking_settings into s from public.salons where id = p_salon;
  return public._profile_json(p_membership, true)
    || jsonb_build_object('photoOk', coalesce((s->>'photo_ok')::boolean, true),
                          'canOk', public._profile_can(p_salon, p_membership, 'pf.ok'));
end $$;

create function public._clean_list(p jsonb, p_max int, p_len int) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(v order by o), '{}') from (
    select v, o from (
      select distinct on (lower(left(trim(x), p_len))) left(trim(x), p_len) v, o
        from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality t(x, o)
        where trim(x) <> ''
        order by lower(left(trim(x), p_len)), o) d
    order by o limit p_max) e $$;

create function public.staff_profile_save(p_salon uuid, p_membership uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ph text := nullif(trim(p->>'photo'), '');
begin
  if not exists (select 1 from public.memberships where id = p_membership and salon_id = p_salon and archived_at is null) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not public._profile_can(p_salon, p_membership, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if ph is not null and ph not like p_salon::text || '/' || p_membership::text || '/%' then raise exception 'bad photo' using errcode = '22023'; end if;
  insert into public.staff_profiles as sp (membership_id, salon_id, about, best_at, languages, years, photo_path, updated_at, updated_by, asked_at)
  values (p_membership, p_salon, left(trim(coalesce(p->>'about', '')), 120),
          public._clean_list(p->'bestAt', 8, 24), public._clean_list(p->'languages', 6, 20),
          case when (p->>'years') ~ '^\d{1,2}$' and (p->>'years')::int <= 60 then (p->>'years')::int end,
          ph, now(), public.my_person_id(), null)
  on conflict (membership_id) do update set about = excluded.about, best_at = excluded.best_at, languages = excluded.languages,
    years = excluded.years, photo_path = excluded.photo_path, updated_at = now(), updated_by = excluded.updated_by, asked_at = null;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'profile.saved', jsonb_build_object('membership', p_membership));
  return public._profile_json(p_membership, true);
end $$;

-- A new work photo: shown at once when the salon doesn't ask for an OK or the person adding it may OK photos.
create function public.staff_photo_add(p_salon uuid, p_membership uuid, p_id uuid, p_path text, p_label text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st text; s jsonb;
begin
  if not exists (select 1 from public.memberships where id = p_membership and salon_id = p_salon and archived_at is null) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not public._profile_can(p_salon, p_membership, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_path not like p_salon::text || '/' || p_membership::text || '/%' then raise exception 'bad photo' using errcode = '22023'; end if;
  if (select count(*) from public.staff_photos where membership_id = p_membership and status <> 'hidden') >= 12 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  if exists (select 1 from public.staff_photos where id = p_id) then
    return jsonb_build_object('ok', true, 'status', (select status from public.staff_photos where id = p_id));
  end if;
  select booking_settings into s from public.salons where id = p_salon;
  st := case when not coalesce((s->>'photo_ok')::boolean, true) or public._profile_can(p_salon, p_membership, 'pf.ok') then 'shown' else 'waiting' end;
  insert into public.staff_photos (id, salon_id, membership_id, path, label, status, sort)
  values (p_id, p_salon, p_membership, p_path, left(trim(coalesce(p_label, '')), 40), st,
          coalesce((select max(sort) + 1 from public.staff_photos where membership_id = p_membership), 0));
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'profile.photo_added', jsonb_build_object('membership', p_membership, 'status', st));
  return jsonb_build_object('ok', true, 'status', st);
end $$;

create function public.staff_photo_decide(p_id uuid, p_show boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  select * into f from public.staff_photos where id = p_id;
  if f.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not public._profile_can(f.salon_id, f.membership_id, 'pf.ok') then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.staff_photos set status = case when p_show then 'shown' else 'hidden' end, decided_at = now(), decided_by = public.my_person_id()
    where id = p_id;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (f.salon_id, public.my_person_id(), case when p_show then 'profile.photo_shown' else 'profile.photo_hidden' end,
            jsonb_build_object('membership', f.membership_id));
  return jsonb_build_object('ok', true, 'status', case when p_show then 'shown' else 'hidden' end);
end $$;

create function public.staff_photo_remove(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  select * into f from public.staff_photos where id = p_id;
  if f.id is null then return jsonb_build_object('ok', true); end if;
  if not public._profile_can(f.salon_id, f.membership_id, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from public.staff_photos where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create function public.staff_profile_ask(p_salon uuid, p_membership uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships where id = p_membership and salon_id = p_salon and archived_at is null) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not public._profile_can(p_salon, p_membership, 'pf.team') then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.staff_profiles as sp (membership_id, salon_id, asked_at, asked_by)
  values (p_membership, p_salon, now(), public.my_person_id())
  on conflict (membership_id) do update set asked_at = now(), asked_by = excluded.asked_by;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'profile.asked', jsonb_build_object('membership', p_membership));
  return jsonb_build_object('ok', true, 'askedAt', now());
end $$;

create function public.staff_profile_settings_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur jsonb;
begin
  if not public._profile_can(p_salon, null, 'pf.team') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select booking_settings into cur from public.salons where id = p_salon;
  update public.salons set booking_settings = cur || jsonb_strip_nulls(jsonb_build_object(
    'profiles_on', case when jsonb_typeof(p->'profilesOn') = 'boolean' then (p->>'profilesOn')::boolean end,
    'photo_ok', case when jsonb_typeof(p->'photoOk') = 'boolean' then (p->>'photoOk')::boolean end)) where id = p_salon;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'profile.settings_saved', p);
  select booking_settings into cur from public.salons where id = p_salon;
  return jsonb_build_object('profilesOn', coalesce((cur->>'profiles_on')::boolean, true), 'photoOk', coalesce((cur->>'photo_ok')::boolean, true));
end $$;

-- Public (booking page): the salon's techs with first names only. Profiles off = names only.
create function public.book_team(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s record; on_ boolean;
begin
  select * into s from public.salons where slug = lower(p_slug) and archived_at is null
    and coalesce((booking_settings->>'on')::boolean, true);
  if s.id is null then return null; end if;
  on_ := coalesce((s.booking_settings->>'profiles_on')::boolean, true);
  return jsonb_build_object('on', on_, 'team', coalesce((select jsonb_agg(
      case when on_ then jsonb_build_object('id', m.id, 'name', split_part(trim(m.display_name), ' ', 1),
          'about', coalesce(p.about, ''), 'bestAt', to_jsonb(coalesce(p.best_at, '{}')), 'languages', to_jsonb(coalesce(p.languages, '{}')),
          'years', p.years, 'photo', p.photo_path,
          'photos', coalesce((select jsonb_agg(jsonb_build_object('path', f.path, 'label', f.label) order by f.sort, f.created_at)
            from public.staff_photos f where f.membership_id = m.id and f.status = 'shown'), '[]'::jsonb))
        else jsonb_build_object('id', m.id, 'name', split_part(trim(m.display_name), ' ', 1)) end
      order by m.display_name)
    from public.memberships m left join public.staff_profiles p on p.membership_id = m.id
    where m.salon_id = s.id and m.archived_at is null and m.role = 'tech'), '[]'::jsonb));
end $$;

revoke execute on function public.staff_profiles_list(uuid), public.staff_profile_get(uuid, uuid), public.staff_profile_save(uuid, uuid, jsonb),
  public.staff_photo_add(uuid, uuid, uuid, text, text), public.staff_photo_decide(uuid, boolean), public.staff_photo_remove(uuid),
  public.staff_profile_ask(uuid, uuid), public.staff_profile_settings_save(uuid, jsonb) from public, anon;
revoke execute on function public.book_team(text) from public;
grant execute on function public.staff_profiles_list(uuid), public.staff_profile_get(uuid, uuid), public.staff_profile_save(uuid, uuid, jsonb),
  public.staff_photo_add(uuid, uuid, uuid, text, text), public.staff_photo_decide(uuid, boolean), public.staff_photo_remove(uuid),
  public.staff_profile_ask(uuid, uuid), public.staff_profile_settings_save(uuid, jsonb) to authenticated;
grant execute on function public.book_team(text) to anon, authenticated;
revoke execute on function public._clean_list(jsonb, int, int) from public, anon, authenticated;

-- Photos live in Storage bucket "staff-photos" under <salon>/<membership>/<random>.jpg. The bucket is public so the
-- booking page loads pictures without a signed link (a waiting photo's random name is never listed to clients);
-- only someone who may edit that person's profile can add or delete files in their folder.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('staff-photos', 'staff-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy "staff photo upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'staff-photos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
        and public._profile_can(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid, 'edit'))$p$;
    execute $p$create policy "staff photo delete" on storage.objects for delete to authenticated
      using (bucket_id = 'staff-photos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
        and public._profile_can(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid, 'edit'))$p$;
  end if;
end $$;
