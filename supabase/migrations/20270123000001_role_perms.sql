-- Roles + permissions the owner sets (Settings → Roles + permissions). One jsonb on the salon:
--   salons.role_perms = {"manager": {"ok.refund": false, "set.money": false, ...}, "front_desk": {"ok.discount": true}}
-- Only keys that differ from the defaults need to be there; a missing key = the default below.
--   ok.<purpose>  = may OK it with their PIN / own login (approve_discount: discount, refund, close, client, menu)
--   set.<group>   = a manager may open that Settings group (salon, team, pay, clients, money, safety)
-- The owner can always do everything; techs never approve. Saving is owner-only and logged ('roles.saved').
alter table public.salons add column if not exists role_perms jsonb not null default '{}'::jsonb;

create function public._role_perm_default(p_role text, p_perm text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_role = 'owner' then true
    when p_role = 'manager' then true
    when p_role = 'front_desk' then false
    else false end $$;

create function public._role_can(p_salon uuid, p_role text, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_role = 'owner' then true
    when p_role not in ('manager', 'front_desk') then false
    else coalesce((select (s.role_perms->p_role->>p_perm)::boolean from public.salons s where s.id = p_salon),
                  public._role_perm_default(p_role, p_perm)) end $$;
revoke execute on function public._role_can(uuid, text, text) from public, anon, authenticated;

-- Everyone in the salon reads it (screens hide what a role may not do; works offline from the device copy).
create function public.role_perms_get(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_salon) then raise exception 'Not a member of this salon' using errcode = '42501'; end if;
  return (select role_perms from public.salons where id = p_salon);
end $$;

create function public.role_perms_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text; k text; v jsonb; clean jsonb := '{}'::jsonb; one jsonb;
  keys text[] := array['ok.discount', 'ok.refund', 'ok.close', 'ok.client', 'ok.menu',
                       'set.salon', 'set.team', 'set.pay', 'set.clients', 'set.money', 'set.safety'];
begin
  if not (public.is_owner(p_salon) or public._support_on(p_salon)) then
    raise exception 'Only the owner can change roles + permissions' using errcode = '42501';
  end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'bad permissions' using errcode = '22023'; end if;
  for r in select jsonb_object_keys(p) loop
    if r not in ('manager', 'front_desk') then raise exception 'Unknown role %', r using errcode = '22023'; end if;
    one := '{}'::jsonb;
    for k, v in select * from jsonb_each(p->r) loop
      if not (k = any(keys)) then raise exception 'Unknown permission %', k using errcode = '22023'; end if;
      if jsonb_typeof(v) <> 'boolean' then raise exception 'Permission % must be on or off', k using errcode = '22023'; end if;
      if r = 'front_desk' and k like 'set.%' then continue; end if; -- Settings stays owner + manager
      if v::text::boolean <> public._role_perm_default(r, k) then one := one || jsonb_build_object(k, v); end if;
    end loop;
    if one <> '{}'::jsonb then clean := clean || jsonb_build_object(r, one); end if;
  end loop;
  update public.salons set role_perms = clean where id = p_salon;
  insert into public.audit_log (salon_id, action, detail) values (p_salon, 'roles.saved', jsonb_build_object('changed', clean));
  return clean;
end $$;

revoke execute on function public.role_perms_get(uuid) from public, anon;
revoke execute on function public.role_perms_save(uuid, jsonb) from public, anon;
grant execute on function public.role_perms_get(uuid) to authenticated;
grant execute on function public.role_perms_save(uuid, jsonb) to authenticated;

-- Approvals follow the owner's choice: owner always; manager / front desk when their role has ok.<purpose>.
create or replace function public.approve_discount(p_salon uuid, p_device uuid default null, p_membership uuid default null, p_pin text default null,
  p_purpose text default 'discount', p_ticket uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; mid uuid; aid uuid; rl text;
begin
  if p_purpose not in ('discount', 'refund', 'close', 'client', 'menu') then raise exception 'bad purpose'; end if;
  if p_purpose = 'refund' and not exists (select 1 from public.tickets where id = p_ticket and salon_id = p_salon) then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;
  if p_device is null then
    select m.id, m.role::text into mid, rl from public.memberships m
      where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
    if mid is null then
      -- support access (owner-granted) keeps the old owner/manager view
      if not public.is_admin(p_salon) then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    elsif not public._role_can(p_salon, rl, 'ok.' || p_purpose) then
      return jsonb_build_object('ok', false, 'reason', 'not_manager');
    end if;
    r := jsonb_build_object('ok', true, 'membership_id', mid, 'name', (select display_name from public.memberships where id = mid));
  else
    perform set_config('nailpos.pin_purpose', 'approve_' || p_purpose, true);
    r := public._check_pin(p_device, p_membership, p_pin);
    if not (r->>'ok')::boolean then return r; end if;
    if (r->>'salon_id')::uuid <> p_salon then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
    if not public._role_can(p_salon, r->>'role', 'ok.' || p_purpose) then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    mid := p_membership;
  end if;
  insert into public.discount_approvals (salon_id, membership_id, device_id, purpose, ticket_id)
    values (p_salon, mid, p_device, p_purpose, case when p_purpose = 'refund' then p_ticket end) returning id into aid;
  return r || jsonb_build_object('approval_id', aid);
end $$;
