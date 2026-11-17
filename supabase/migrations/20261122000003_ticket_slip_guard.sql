-- Ticket slip, made independent of save_ticket (other work rewrites that function):
-- * Lines a tech adds from their phone are marked source = 'phone'. A desk save can't remove one until the desk
--   has seen it (desk_seen_at, set by ack_ticket_lines when the desk pulls it in). The tech can always remove their own.
-- * Tickets are front-desk-only to read; tech_ticket shows a tech just the one ticket they scanned (no client phone).
alter table public.ticket_lines add column if not exists source text not null default 'desk' check (source in ('desk', 'phone')),
  add column if not exists desk_seen_at timestamptz;

create or replace function public._keep_phone_lines() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.removed_at is not null and old.removed_at is null and old.source = 'phone' and old.desk_seen_at is null
     and coalesce(current_setting('app.tech_remove', true), '') <> 'on' then
    new.removed_at := null; -- the desk hasn't seen this line yet: keep it
  end if;
  return new;
end $$;
drop trigger if exists keep_phone_lines on public.ticket_lines;
create trigger keep_phone_lines before update of removed_at on public.ticket_lines for each row execute function public._keep_phone_lines();

create or replace function public.tech_add_service(p_ticket uuid, p_line uuid, p_service uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; mid uuid; sv public.services; n int;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  if t.status <> 'open' then raise exception 'this ticket is already paid'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  select * into sv from public.services where id = p_service and salon_id = t.salon_id and archived_at is null;
  if mid is null or sv.id is null then raise exception 'not allowed'; end if;
  select coalesce(max(sort), 0) + 1 into n from public.ticket_lines where ticket_id = t.id;
  insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, sort, source)
  values (p_line, t.salon_id, t.id, 'service', sv.id, mid, sv.name, sv.minutes, sv.price_cents, sv.price_from, n, 'phone')
  on conflict (id) do nothing;
  update public.tickets set subtotal_cents = (select coalesce(sum(amount_cents), 0) from public.ticket_lines where ticket_id = t.id and kind = 'service' and removed_at is null),
    updated_at = now() where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.tech_remove_line(p_ticket uuid, p_line uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; mid uuid;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  if t.status <> 'open' then raise exception 'this ticket is already paid'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  perform set_config('app.tech_remove', 'on', true);
  update public.ticket_lines set removed_at = now() where id = p_line and ticket_id = t.id and staff_id = mid and kind = 'service' and removed_at is null;
  perform set_config('app.tech_remove', '', true);
  update public.tickets set subtotal_cents = (select coalesce(sum(amount_cents), 0) from public.ticket_lines where ticket_id = t.id and kind = 'service' and removed_at is null),
    updated_at = now() where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

-- What a tech sees after scanning a slip: this one ticket only. Client first name, services with tech names. No phone.
create or replace function public.tech_ticket(p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tickets; mid uuid;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  return jsonb_build_object(
    'id', t.id, 'number', t.number, 'status', t.status, 'salon_id', t.salon_id, 'me', mid,
    'salon', (select name from public.salons where id = t.salon_id),
    'client', (select split_part(c.name, ' ', 1) from public.clients c where c.id = t.client_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'cents', l.amount_cents, 'staff_id', l.staff_id,
        'staff', (select display_name from public.memberships where id = l.staff_id)) order by l.sort)
      from public.ticket_lines l where l.ticket_id = t.id and l.kind = 'service' and l.removed_at is null), '[]'::jsonb));
end $$;

-- Desk pulled in the tech's lines: from now on the desk may remove them like any other line.
create or replace function public.ack_ticket_lines(p_ticket uuid, p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.ticket_lines l set desk_seen_at = coalesce(l.desk_seen_at, now())
  where l.ticket_id = p_ticket and l.id = any (p_ids) and l.source = 'phone' and public._is_desk(l.salon_id);
$$;

revoke execute on function public.tech_ticket(uuid), public.ack_ticket_lines(uuid, uuid[]) from public, anon;
grant execute on function public.tech_ticket(uuid), public.ack_ticket_lines(uuid, uuid[]) to authenticated;
revoke execute on function public._keep_phone_lines() from public, anon, authenticated;
