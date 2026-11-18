-- Save a one-time service to the menu from the desk (Nov 18).
--  * approve_discount takes purpose 'menu': an owner/manager PIN on the salon device, or an owner/manager's own login.
--  * menu_add_service: desk roles only, needs that OK (used once, within 15 min), refuses a name already on the menu,
--    puts the service at the end of its group, and logs who approved it.

alter table public.discount_approvals drop constraint discount_approvals_purpose_check;
alter table public.discount_approvals add constraint discount_approvals_purpose_check check (purpose in ('discount', 'refund', 'close', 'client', 'menu'));

create or replace function public.approve_discount(p_salon uuid, p_device uuid default null, p_membership uuid default null, p_pin text default null,
  p_purpose text default 'discount', p_ticket uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; mid uuid; aid uuid;
begin
  if p_purpose not in ('discount', 'refund', 'close', 'client', 'menu') then raise exception 'bad purpose'; end if;
  if p_purpose = 'refund' and not exists (select 1 from public.tickets where id = p_ticket and salon_id = p_salon) then
    return jsonb_build_object('ok', false, 'reason', 'ticket');
  end if;
  if p_device is null then
    if not public.is_admin(p_salon) then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    select m.id into mid from public.memberships m where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
    r := jsonb_build_object('ok', true, 'membership_id', mid, 'name', (select display_name from public.memberships where id = mid));
  else
    perform set_config('nailpos.pin_purpose', 'approve_' || p_purpose, true);
    r := public._check_pin(p_device, p_membership, p_pin);
    if not (r->>'ok')::boolean then return r; end if;
    if (r->>'salon_id')::uuid <> p_salon then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
    if r->>'role' not in ('owner', 'manager') then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    mid := p_membership;
  end if;
  insert into public.discount_approvals (salon_id, membership_id, device_id, purpose, ticket_id)
    values (p_salon, mid, p_device, p_purpose, case when p_purpose = 'refund' then p_ticket end) returning id into aid;
  return r || jsonb_build_object('approval_id', aid);
end $$;

create or replace function public.menu_add_service(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := (p->>'salonId')::uuid;
  nm text := trim(coalesce(p->>'name', ''));
  cat text := coalesce(nullif(trim(p->>'cat'), ''), 'Custom');
  mins int := coalesce((p->>'minutes')::int, 0);
  cents int := coalesce((p->>'cents')::int, -1);
  by_m uuid; new_id uuid;
begin
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  if nm = '' or length(nm) > 80 then raise exception 'name needed'; end if;
  if length(cat) > 40 then raise exception 'group name too long'; end if;
  if mins < 5 or mins > 600 then raise exception 'minutes 5 to 600'; end if;
  if cents < 0 or cents > 10000000 then raise exception 'price not valid'; end if;
  if exists (select 1 from public.services where salon_id = sid and archived_at is null and lower(name) = lower(nm)) then
    raise exception 'already on the menu';
  end if;
  update public.discount_approvals set used_at = now()
  where id = (p->>'approvalId')::uuid and salon_id = sid and purpose = 'menu' and used_at is null and at > now() - interval '15 minutes'
  returning membership_id into by_m;
  if by_m is null then raise exception 'adding to the menu needs an owner or manager OK'; end if;
  insert into public.services (salon_id, category, name, minutes, price_cents, sort)
  values (sid, cat, nm, mins, cents, coalesce((select max(sort) from public.services where salon_id = sid), 0) + 1)
  returning id into new_id;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (sid, public.my_person_id(), 'service.added', jsonb_build_object('service', new_id, 'name', nm, 'cat', cat, 'minutes', mins, 'cents', cents, 'by', by_m));
  return new_id;
end $$;
revoke execute on function public.menu_add_service(jsonb) from public, anon;
grant execute on function public.menu_add_service(jsonb) to authenticated;
