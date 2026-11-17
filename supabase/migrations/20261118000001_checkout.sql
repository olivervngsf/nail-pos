-- Session 2 (M3): checkout without cards. Ticket built on the desk device (works offline), sent whole each time
-- through the outbox (safe to repeat: same ids), paid in cash, receipt logged.
-- Rules: money in cents; nothing deleted (removed_at / voided); every row has salon_id + RLS; writes only via functions.

alter table public.salons add column time_zone text not null default 'America/Los_Angeles';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  phone text,
  name text not null default '',
  email text,
  language text not null default 'en' check (language in ('en', 'vi')),
  texts_ok boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (salon_id, phone)
);

create table public.ticket_counters (salon_id uuid primary key references public.salons(id), last int not null default 1000);

create table public.tickets (
  id uuid primary key,                                   -- made on the device, so an offline ticket keeps its id
  salon_id uuid not null references public.salons(id),
  number int not null,
  client_id uuid references public.clients(id),
  status text not null default 'open' check (status in ('open', 'paid', 'voided')),
  note text not null default '',
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  tip_cents bigint not null default 0,
  total_cents bigint not null default 0,
  opened_by uuid references public.memberships(id),
  paid_by uuid references public.memberships(id),
  device_id uuid references public.devices(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (salon_id, number)
);
create index on public.tickets (salon_id, created_at desc);
create index on public.tickets (client_id);

create table public.discount_approvals (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  membership_id uuid not null references public.memberships(id),
  device_id uuid references public.devices(id),
  at timestamptz not null default now()
);

create table public.ticket_lines (
  id uuid primary key,
  salon_id uuid not null references public.salons(id),
  ticket_id uuid not null references public.tickets(id),
  kind text not null check (kind in ('service', 'discount', 'tip')),
  service_id uuid references public.services(id),
  staff_id uuid references public.memberships(id),
  name text not null default '',
  minutes int,
  amount_cents bigint not null,                          -- discount lines are negative
  price_from boolean not null default false,
  reason text,
  approval_id uuid references public.discount_approvals(id),
  sort int not null default 0,
  removed_at timestamptz
);
create index on public.ticket_lines (ticket_id);
create index on public.ticket_lines (salon_id, staff_id);

create table public.payments (
  id uuid primary key,
  salon_id uuid not null references public.salons(id),
  ticket_id uuid not null references public.tickets(id),
  method text not null check (method in ('cash')),       -- card_reader, pay_link, gift_card come in sessions 3-4
  amount_cents bigint not null check (amount_cents >= 0),
  tip_cents bigint not null default 0,
  fee_cents bigint not null default 0,
  given_cents bigint,
  change_cents bigint,
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  taken_by uuid references public.memberships(id),
  device_id uuid references public.devices(id),
  at timestamptz not null default now()
);
create index on public.payments (ticket_id);

create table public.receipts (
  id uuid primary key,
  salon_id uuid not null references public.salons(id),
  ticket_id uuid not null references public.tickets(id),
  channel text not null check (channel in ('print', 'text', 'email', 'none')),
  sent_to text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'printed', 'failed', 'skipped')),
  at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['clients', 'ticket_counters', 'tickets', 'discount_approvals', 'ticket_lines', 'payments', 'receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member(salon_id))', t);
  end loop;
end $$;

-- ---------- helpers ----------
-- Desk roles (owner, manager, front desk) of the signed-in person in this salon.
create function public._is_desk(p_salon uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.salon_id = p_salon and p.auth_user_id = (select auth.uid()) and m.archived_at is null
      and m.role in ('owner', 'manager', 'front_desk'));
$$;

create function public._salon_member(p_salon uuid, p_membership uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.memberships where id = p_membership and salon_id = p_salon;
$$;

-- ---------- discount approval: manager / owner PIN on the salon device, or an owner/manager on their own login ----------
create function public.approve_discount(p_salon uuid, p_device uuid default null, p_membership uuid default null, p_pin text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; mid uuid; aid uuid;
begin
  if p_device is null then
    if not public.is_admin(p_salon) then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    select m.id into mid from public.memberships m where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
    r := jsonb_build_object('ok', true, 'membership_id', mid, 'name', (select display_name from public.memberships where id = mid));
  else
    r := public._check_pin(p_device, p_membership, p_pin);
    if not (r->>'ok')::boolean then return r; end if;
    if (r->>'salon_id')::uuid <> p_salon then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
    if r->>'role' not in ('owner', 'manager') then return jsonb_build_object('ok', false, 'reason', 'not_manager'); end if;
    mid := p_membership;
  end if;
  insert into public.discount_approvals (salon_id, membership_id, device_id) values (p_salon, mid, p_device) returning id into aid;
  return r || jsonb_build_object('approval_id', aid);
end $$;

-- ---------- save a ticket (whole ticket each time; same ids = same rows) ----------
-- p: { id, salonId, deviceId?, openedBy?, note, client?: {phone, name},
--      lines: [{id, kind: service|discount|tip, serviceId?, staffId?, name, minutes?, cents, priceFrom?, reason?, approvalId?}],
--      payment?: {id, method: 'cash', givenCents, takenBy?} }
-- Paid tickets never change: a repeat save returns the ticket as it is.
create function public.save_ticket(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid := (p->>'id')::uuid;
  sid uuid := (p->>'salonId')::uuid;
  t public.tickets;
  cid uuid;
  ln jsonb; i int := 0; keep uuid[] := '{}';
  sub bigint; disc bigint; tip bigint; total bigint; given bigint;
begin
  if tid is null or sid is null then raise exception 'ticket id and salon required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;

  select * into t from public.tickets where id = tid for update;
  if t.id is not null and t.salon_id <> sid then raise exception 'not allowed'; end if;
  if t.id is not null and t.status <> 'open' then
    return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status);
  end if;

  -- Client by phone (one per phone per salon). Name fills in, never wiped.
  if coalesce(p->'client'->>'phone', '') <> '' then
    insert into public.clients (salon_id, phone, name) values (sid, p->'client'->>'phone', coalesce(p->'client'->>'name', ''))
    on conflict (salon_id, phone) do update set name = coalesce(nullif(excluded.name, ''), public.clients.name)
    returning id into cid;
  end if;

  if t.id is null then
    insert into public.ticket_counters (salon_id) values (sid) on conflict (salon_id) do update set last = public.ticket_counters.last + 1;
    insert into public.tickets (id, salon_id, number, client_id, note, opened_by, device_id, created_at)
    values (tid, sid, (select last from public.ticket_counters where salon_id = sid), cid, coalesce(p->>'note', ''),
            public._salon_member(sid, (p->>'openedBy')::uuid),
            (select id from public.devices where id = (p->>'deviceId')::uuid and salon_id = sid),
            least(now(), coalesce((p->>'createdAt')::timestamptz, now())))
    returning * into t;
  else
    update public.tickets set client_id = cid, note = coalesce(p->>'note', ''), updated_at = now() where id = tid returning * into t;
  end if;

  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]')) loop
    i := i + 1;
    if ln->>'kind' not in ('service', 'discount', 'tip') then raise exception 'bad line'; end if;
    if ln->>'kind' = 'discount' then
      if not exists (select 1 from public.discount_approvals a where a.id = (ln->>'approvalId')::uuid and a.salon_id = sid and a.at > now() - interval '12 hours')
      then raise exception 'discount needs a manager PIN'; end if;
      if (ln->>'cents')::bigint > 0 then raise exception 'discount must take money off'; end if;
    elsif (ln->>'cents')::bigint < 0 then raise exception 'amount can''t be below $0';
    end if;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, reason, approval_id, sort)
    values ((ln->>'id')::uuid, sid, tid, ln->>'kind',
            (select id from public.services where id = (ln->>'serviceId')::uuid and salon_id = sid),
            public._salon_member(sid, (ln->>'staffId')::uuid),
            coalesce(ln->>'name', ''), (ln->>'minutes')::int, (ln->>'cents')::bigint, coalesce((ln->>'priceFrom')::boolean, false),
            ln->>'reason', (ln->>'approvalId')::uuid, i)
    on conflict (id) do update set kind = excluded.kind, service_id = excluded.service_id, staff_id = excluded.staff_id, name = excluded.name,
      minutes = excluded.minutes, amount_cents = excluded.amount_cents, price_from = excluded.price_from, reason = excluded.reason,
      approval_id = excluded.approval_id, sort = excluded.sort, removed_at = null
    where public.ticket_lines.ticket_id = tid;
    keep := keep || (ln->>'id')::uuid;
  end loop;
  update public.ticket_lines set removed_at = now() where ticket_id = tid and removed_at is null and not (id = any (keep));

  -- Totals are worked out here, never trusted from the device.
  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0),
         coalesce(-sum(amount_cents) filter (where kind = 'discount'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0)
    into sub, disc, tip from public.ticket_lines where ticket_id = tid and removed_at is null;
  disc := least(disc, sub);
  total := sub - disc + tip;
  update public.tickets set subtotal_cents = sub, discount_cents = disc, tip_cents = tip, total_cents = total where id = tid;

  if p ? 'payment' and p->'payment' is not null and jsonb_typeof(p->'payment') = 'object' then
    if p->'payment'->>'method' <> 'cash' then raise exception 'only cash for now'; end if;
    if exists (select 1 from public.ticket_lines where ticket_id = tid and removed_at is null and kind = 'service' and staff_id is null) then
      raise exception 'every service needs a staff member';
    end if;
    given := (p->'payment'->>'givenCents')::bigint;
    if given is null or given < total then raise exception 'cash given is less than the total'; end if;
    insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, given_cents, change_cents, taken_by, device_id, at)
    values ((p->'payment'->>'id')::uuid, sid, tid, 'cash', total, tip, given, given - total,
            public._salon_member(sid, (p->'payment'->>'takenBy')::uuid), t.device_id,
            least(now(), coalesce((p->'payment'->>'at')::timestamptz, now())))
    on conflict (id) do nothing;
    update public.tickets set status = 'paid', paid_at = least(now(), coalesce((p->'payment'->>'at')::timestamptz, now())),
      paid_by = public._salon_member(sid, (p->'payment'->>'takenBy')::uuid), updated_at = now()
    where id = tid returning * into t;
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (sid, public.my_person_id(), 'ticket.paid', jsonb_build_object('ticket', tid, 'number', t.number, 'total_cents', total, 'method', 'cash'));
  end if;

  return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status);
end $$;

-- Receipt asked for (print, text, email, none). Texts/emails go out once the salon's number is set up (session 5).
create function public.log_receipt(p_id uuid, p_salon uuid, p_ticket uuid, p_channel text, p_to text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_desk(p_salon) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.tickets where id = p_ticket and salon_id = p_salon) then raise exception 'no such ticket'; end if;
  insert into public.receipts (id, salon_id, ticket_id, channel, sent_to, status)
  values (p_id, p_salon, p_ticket, p_channel, nullif(p_to, ''),
          case p_channel when 'print' then 'printed' when 'none' then 'skipped' else 'queued' end)
  on conflict (id) do nothing;
end $$;

-- Staff picker facts (insight, not autopilot): clocked in, turns today, $ today.
create function public.desk_staff(p_salon uuid)
returns table (membership_id uuid, display_name text, role public.member_role, clocked_in boolean, turns_today int, cents_today bigint)
language sql stable security definer set search_path = '' as $$
  with day as (
    select (date_trunc('day', now() at time zone s.time_zone) at time zone s.time_zone) as start from public.salons s where s.id = p_salon
  )
  select m.id, m.display_name, m.role,
    coalesce((select ce.kind = 'in' from public.clock_events ce where ce.membership_id = m.id order by ce.at desc limit 1), false),
    (select count(distinct l.ticket_id)::int from public.ticket_lines l join public.tickets t on t.id = l.ticket_id
       where l.staff_id = m.id and l.kind = 'service' and l.removed_at is null and t.status <> 'voided' and t.created_at >= (select start from day)),
    (select coalesce(sum(l.amount_cents), 0)::bigint from public.ticket_lines l join public.tickets t on t.id = l.ticket_id
       where l.staff_id = m.id and l.kind = 'service' and l.removed_at is null and t.status = 'paid' and t.created_at >= (select start from day))
  from public.memberships m
  where m.salon_id = p_salon and m.archived_at is null and public.is_member(p_salon)
  order by (m.role = 'tech') desc, m.display_name;
$$;

-- Client panel on checkout: who they are + visits, avg ticket, last visit, notes.
create function public.client_lookup(p_salon uuid, p_phone text)
returns table (client_id uuid, name text, phone text, notes text, visits int, avg_cents bigint, last_visit timestamptz, last_services text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.phone, c.notes,
    (select count(*)::int from public.tickets t where t.client_id = c.id and t.status = 'paid'),
    (select coalesce(round(avg(t.subtotal_cents - t.discount_cents)), 0)::bigint from public.tickets t where t.client_id = c.id and t.status = 'paid'),
    lt.paid_at,
    (select string_agg(l.name || coalesce(' with ' || m.display_name, ''), ', ' order by l.sort)
       from public.ticket_lines l left join public.memberships m on m.id = l.staff_id
       where l.ticket_id = lt.id and l.kind = 'service' and l.removed_at is null)
  from public.clients c
  left join lateral (select t.id, t.paid_at from public.tickets t where t.client_id = c.id and t.status = 'paid' order by t.paid_at desc limit 1) lt on true
  where c.salon_id = p_salon and c.phone = p_phone and c.archived_at is null and public.is_member(p_salon);
$$;

revoke execute on function public._is_desk(uuid), public._salon_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.approve_discount(uuid, uuid, uuid, text), public.save_ticket(jsonb),
  public.log_receipt(uuid, uuid, uuid, text, text), public.desk_staff(uuid), public.client_lookup(uuid, text) from public, anon;
grant execute on function public.approve_discount(uuid, uuid, uuid, text), public.save_ticket(jsonb),
  public.log_receipt(uuid, uuid, uuid, text, text), public.desk_staff(uuid), public.client_lookup(uuid, text) to authenticated;
