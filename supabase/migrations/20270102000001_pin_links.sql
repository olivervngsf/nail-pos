-- Personal "make your PIN" link (Nov 20). One link per person who joined but needs a (new) PIN, made by the
-- owner/manager in Settings → Team. The link only says WHO it is for; the person still signs in with their own
-- phone, and only a sign-in that owns that membership can use it. One use, 7 days, a new link ends older ones.
create table public.pin_links (
  code text primary key,
  salon_id uuid not null references public.salons(id),
  membership_id uuid not null references public.memberships(id),
  made_by uuid references public.people(id),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index pin_links_membership on public.pin_links (membership_id);
alter table public.pin_links enable row level security;  -- server/functions only, no policies

-- Owner/manager makes a link for a joined member (owner's link: owner only, same rule as admin_set_pin).
create function public.pin_link_make(p_membership uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare m record; c text;
begin
  select id, salon_id, role, person_id, archived_at into m from public.memberships where id = p_membership;
  if m.id is null or not public.is_admin(m.salon_id) then raise exception 'not allowed'; end if;
  if m.role = 'owner' and not public.is_owner(m.salon_id) then raise exception 'not allowed'; end if;
  if m.archived_at is not null then raise exception 'removed from the team'; end if;
  if m.person_id is null then raise exception 'not joined yet'; end if;
  update public.pin_links set expires_at = least(expires_at, now()) where membership_id = p_membership and used_at is null;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.pin_links (code, salon_id, membership_id, made_by) values (c, m.salon_id, p_membership, public.my_person_id());
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (m.salon_id, public.my_person_id(), 'pin.link', jsonb_build_object('membership', p_membership));
  return c;
end $$;

-- What the link page shows before sign-in: name, salon, last 4 of the phone, status. Nothing else.
create function public.pin_link_get(p_code text) returns table (
  salon_id uuid, salon_name text, membership_id uuid, display_name text, phone_last4 text, language text, status text)
language sql stable security definer set search_path = '' as $$
  select l.salon_id, s.name, l.membership_id, m.display_name, right(coalesce(m.phone, ''), 4), m.language,
    case when l.used_at is not null then 'used' when l.expires_at < now() or m.archived_at is not null then 'expired' else 'open' end
  from public.pin_links l join public.memberships m on m.id = l.membership_id join public.salons s on s.id = l.salon_id
  where l.code = upper(trim(p_code));
$$;

-- Set the PIN through the link: the signed-in person must own that membership. Marks the link used.
create function public.pin_link_set(p_code text, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare l record; len int;
begin
  select * into l from public.pin_links where code = upper(trim(p_code)) for update;
  if l.code is null or l.used_at is not null or l.expires_at < now() then raise exception 'link ended'; end if;
  if not exists (select 1 from public.memberships where id = l.membership_id and person_id = public.my_person_id() and archived_at is null)
    then raise exception 'not your link'; end if;
  len := (public._pin_rules(l.salon_id)->>'length')::int;
  if public._pin_bad(p_pin, len) then raise exception 'weak pin'; end if;
  update public.memberships set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_len = len, pin_fails = 0, pin_locked_until = null
    where id = l.membership_id;
  update public.pin_links set used_at = now() where code = l.code;
  insert into public.audit_log (salon_id, person_id, action) values (l.salon_id, public.my_person_id(), 'pin.changed');
end $$;

revoke execute on function public.pin_link_make(uuid), public.pin_link_get(text), public.pin_link_set(text, text) from public, anon;
grant execute on function public.pin_link_make(uuid), public.pin_link_set(text, text) to authenticated;
grant execute on function public.pin_link_get(text) to anon, authenticated;
