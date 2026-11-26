-- Techs add upsells themselves (Oliver, Nov 26): any service from the menu OR their own custom item, no manager OK.
-- Every add / remove from a tech's phone is written to audit_log (who, when, what, how much), so the owner can trace it
-- in Settings → Activity log, and the desk ticket shows "Added by <tech> on phone · <time>" (ticket_lines.added_at).
alter table public.ticket_lines add column if not exists added_at timestamptz;

create or replace function public.tech_add_service(p_ticket uuid, p_line uuid, p_service uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; mid uuid; sv public.services; n int; added int;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  if t.status <> 'open' then raise exception 'this ticket is already paid'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  select * into sv from public.services where id = p_service and salon_id = t.salon_id and archived_at is null;
  if mid is null or sv.id is null then raise exception 'not allowed'; end if;
  select coalesce(max(sort), 0) + 1 into n from public.ticket_lines where ticket_id = t.id;
  insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, sort, source, added_at)
  values (p_line, t.salon_id, t.id, 'service', sv.id, mid, sv.name, sv.minutes, sv.price_cents, sv.price_from, n, 'phone', now())
  on conflict (id) do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (t.salon_id, public.my_person_id(), 'ticket.tech_added',
            jsonb_build_object('ticket', t.id, 'number', t.number, 'service', sv.name, 'cents', sv.price_cents, 'from_price', sv.price_from));
  end if;
  update public.tickets set subtotal_cents = (select coalesce(sum(amount_cents), 0) from public.ticket_lines where ticket_id = t.id and kind = 'service' and removed_at is null),
    updated_at = now() where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

-- A custom item the tech types (not on the menu): name + price (+ minutes). Desk can still change the price before charging.
create or replace function public.tech_add_custom(p_ticket uuid, p_line uuid, p_name text, p_cents bigint, p_minutes int default 15) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; mid uuid; n int; nm text := btrim(coalesce(p_name, '')); added int;
begin
  if length(nm) < 1 or length(nm) > 60 then raise exception 'name: 1 to 60 letters'; end if;
  if p_cents is null or p_cents < 0 or p_cents > 100000 then raise exception 'price: $0 to $1,000'; end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 480 then raise exception 'minutes: 0 to 480'; end if;
  select * into t from public.tickets where id = p_ticket for update;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  if t.status <> 'open' then raise exception 'this ticket is already paid'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  if mid is null then raise exception 'not allowed'; end if;
  select coalesce(max(sort), 0) + 1 into n from public.ticket_lines where ticket_id = t.id;
  insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, sort, source, added_at)
  values (p_line, t.salon_id, t.id, 'service', null, mid, nm, p_minutes, p_cents, false, n, 'phone', now())
  on conflict (id) do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (t.salon_id, public.my_person_id(), 'ticket.tech_added',
            jsonb_build_object('ticket', t.id, 'number', t.number, 'service', nm, 'cents', p_cents, 'custom', true));
  end if;
  update public.tickets set subtotal_cents = (select coalesce(sum(amount_cents), 0) from public.ticket_lines where ticket_id = t.id and kind = 'service' and removed_at is null),
    updated_at = now() where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.tech_remove_line(p_ticket uuid, p_line uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; mid uuid; l public.ticket_lines;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  if t.status <> 'open' then raise exception 'this ticket is already paid'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  perform set_config('app.tech_remove', 'on', true);
  update public.ticket_lines set removed_at = now() where id = p_line and ticket_id = t.id and staff_id = mid and kind = 'service' and removed_at is null
  returning * into l;
  perform set_config('app.tech_remove', '', true);
  if l.id is not null then
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (t.salon_id, public.my_person_id(), 'ticket.tech_removed',
            jsonb_build_object('ticket', t.id, 'number', t.number, 'service', l.name, 'cents', l.amount_cents));
  end if;
  update public.tickets set subtotal_cents = (select coalesce(sum(amount_cents), 0) from public.ticket_lines where ticket_id = t.id and kind = 'service' and removed_at is null),
    updated_at = now() where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.tech_add_service(uuid, uuid, uuid), public.tech_add_custom(uuid, uuid, text, bigint, int),
  public.tech_remove_line(uuid, uuid) from public, anon;
grant execute on function public.tech_add_service(uuid, uuid, uuid), public.tech_add_custom(uuid, uuid, text, bigint, int),
  public.tech_remove_line(uuid, uuid) to authenticated;
