-- Session 4 (M5): gift cards. Rules (Gift cards + loyalty doc, PRD "Gift cards and discounts"):
-- * The system makes every code (16 chars, no 0/O/1/I, last char = check). Plastic: 16 digits, last = Luhn check.
-- * Only a hash + last 4 are stored. The full code is shown once (to print it, or on the buyer's receipt / text).
-- * A card is worth $0 until the ticket that sells it is PAID; then the ledger gets "+sold" (or "+reload").
-- * Money on a card = sum of its ledger rows. Rows are never edited; refunds write the opposite row.
-- * Using a card: checks in order (real code → this salon → sold/active → not locked → money left).
--   5 wrong codes in 15 minutes → lookups stop for that person for 15 minutes.
-- * No expiry (V1 rule). Gift card sales get no tech, no tip, no points, no discount.

-- ---------- settings ----------
alter table public.salons add column gift_prefix text,
  add column gift_settings jsonb not null default '{"on": true, "amounts": [2500, 5000, 10000], "min_cents": 1000, "max_cents": 50000}';
update public.salons set gift_prefix = coalesce(nullif(left(regexp_replace(upper(name), '[^A-Z]', '', 'g'), 4), ''), 'GIFT');

-- ---------- tables ----------
create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  code_hash text not null unique,                         -- sha256 of the code (normalized); codes are unique everywhere
  last4 text not null,
  kind text not null check (kind in ('digital', 'plastic', 'paper')),
  status text not null default 'in_stock' check (status in ('in_stock', 'active', 'used_up', 'locked', 'replaced', 'voided')),
  client_id uuid references public.clients(id),           -- buyer (from the ticket)
  sent_to text,                                           -- receiver phone or email (digital)
  from_name text,
  message text,
  replaced_by uuid references public.gift_cards(id),
  made_by text not null default 'system',                 -- system | migrated
  sold_ticket uuid references public.tickets(id),
  sold_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.gift_cards (salon_id, status);
create index on public.gift_cards (client_id);

create table public.gift_card_ledger (
  id bigserial primary key,
  salon_id uuid not null references public.salons(id),
  card_id uuid not null references public.gift_cards(id),
  ticket_id uuid references public.tickets(id),
  payment_id uuid,
  change_cents bigint not null,
  reason text not null check (reason in ('sold', 'reload', 'used', 'undo', 'refund', 'replaced_out', 'replaced_in', 'adjust', 'migrated')),
  by_member uuid references public.memberships(id),
  note text,
  at timestamptz not null default now()
);
create index on public.gift_card_ledger (card_id);

create table public.gift_attempts (
  id bigserial primary key,
  salon_id uuid not null references public.salons(id),
  person_id uuid,
  ok boolean not null,
  at timestamptz not null default now()
);
create index on public.gift_attempts (salon_id, person_id, at desc);

alter table public.ticket_lines drop constraint ticket_lines_kind_check;
alter table public.ticket_lines add constraint ticket_lines_kind_check check (kind in ('service', 'discount', 'tip', 'gift_sale'));
alter table public.ticket_lines add column gift_card_id uuid references public.gift_cards(id);
alter table public.tickets add column gift_cents bigint not null default 0;      -- gift cards sold on this ticket
alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('cash', 'card_reader', 'pay_link', 'gift_card'));
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('paid', 'refunded', 'canceled'));
alter table public.payments add column gift_card_id uuid references public.gift_cards(id);

alter table public.gift_cards enable row level security;
alter table public.gift_card_ledger enable row level security;
alter table public.gift_attempts enable row level security;
-- No direct reads of cards (hashes stay server-side); owners/managers read the ledger. Everything else goes through functions.
create policy "admins read" on public.gift_card_ledger for select to authenticated using (public.is_admin(salon_id));

-- ---------- codes ----------
create function public._gift_alpha() returns text language sql immutable as $$ select '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' $$;
create function public._gift_norm(c text) returns text language sql immutable as $$ select regexp_replace(upper(coalesce(c, '')), '[^A-Z0-9]', '', 'g') $$;
create function public._gift_hash(c text) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(public._gift_norm(c), 'sha256'), 'hex') $$;

-- Check char for letter codes: weighted sum of positions, mod 32.
create function public._gift_check(body text) returns text language plpgsql immutable set search_path = '' as $$
declare a text := public._gift_alpha(); s int := 0; i int;
begin
  for i in 1..length(body) loop s := s + (greatest(strpos(a, substr(body, i, 1)), 1) - 1 + ascii(substr(body, i, 1)) % 7) * (i + 1); end loop;
  return substr(a, s % 32 + 1, 1);
end $$;
create function public._luhn(digits text) returns int language plpgsql immutable as $$
declare s int := 0; d int; i int; dbl boolean := true;
begin
  for i in reverse length(digits)..1 loop
    d := substr(digits, i, 1)::int;
    if dbl then d := d * 2; if d > 9 then d := d - 9; end if; end if;
    s := s + d; dbl := not dbl;
  end loop;
  return (10 - s % 10) % 10;
end $$;
-- Is this a well-formed code (typo check)?
create function public._gift_wellformed(c text) returns boolean language sql immutable set search_path = '' as $$
  select case
    when public._gift_norm(c) ~ '^[0-9]{16}$' then public._luhn(left(public._gift_norm(c), 15)) = right(public._gift_norm(c), 1)::int
    when length(public._gift_norm(c)) = 16 then public._gift_check(left(public._gift_norm(c), 15)) = right(public._gift_norm(c), 1)
    else false end $$;

-- New code: letters = PREF + 11 random + check (shown PREF-XXXX-XXXX-XXXX); plastic = 15 random digits + Luhn.
create function public._gift_new_code(p_prefix text, p_plastic boolean) returns text
language plpgsql volatile set search_path = '' as $$
declare a text := public._gift_alpha(); b bytea; body text := ''; i int; pre text;
begin
  if p_plastic then
    b := extensions.gen_random_bytes(15);
    for i in 0..14 loop body := body || (get_byte(b, i) % 10)::text; end loop;
    return body || public._luhn(body)::text;
  end if;
  pre := left(rpad(coalesce(nullif(regexp_replace(upper(p_prefix), '[^A-Z]', '', 'g'), ''), 'GIFT'), 4, 'X'), 4);
  pre := translate(pre, 'OI', 'QJ');
  b := extensions.gen_random_bytes(11);
  for i in 0..10 loop body := body || substr(a, get_byte(b, i) % 32 + 1, 1); end loop;
  body := pre || body;
  return body || public._gift_check(body);
end $$;
create function public._gift_pretty(c text) returns text language sql immutable set search_path = '' as $$
  select case when c ~ '^[0-9]{16}$' then substr(c, 1, 4) || ' ' || substr(c, 5, 4) || ' ' || substr(c, 9, 4) || ' ' || substr(c, 13, 4)
    else substr(c, 1, 4) || '-' || substr(c, 5, 4) || '-' || substr(c, 9, 4) || '-' || substr(c, 13, 4) end $$;

create function public._gift_balance(p_card uuid) returns bigint language sql stable set search_path = '' as $$
  select coalesce(sum(change_cents), 0)::bigint from public.gift_card_ledger where card_id = p_card $$;

-- Make one card (in stock, $0). Returns id + the full code (shown once).
create function public._gift_make(p_salon uuid, p_kind text, p_made text default 'system') returns table (id uuid, code text)
language plpgsql set search_path = '' as $$
declare c text; cid uuid; tries int := 0;
begin
  loop
    c := public._gift_new_code((select coalesce(gift_prefix, regexp_replace(upper(name), '[^A-Z]', '', 'g')) from public.salons where salons.id = p_salon), p_kind = 'plastic');
    begin
      insert into public.gift_cards (salon_id, code_hash, last4, kind, made_by) values (p_salon, public._gift_hash(c), right(c, 4), p_kind, p_made)
      returning gift_cards.id into cid;
      exit;
    exception when unique_violation then tries := tries + 1; if tries > 5 then raise; end if;
    end;
  end loop;
  return query select cid, public._gift_pretty(c);
end $$;

-- ---------- desk: find a card ----------
-- Result: { ok, reason?, card?: {id, last4, kind, status, balance_cents, sold_at, sent_to, from_name} }
-- reasons: locked_out (too many wrong codes), typo, not_found, other_salon, not_sold, locked, replaced, voided, used_up
create function public.gift_lookup(p_salon uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.gift_cards; me uuid := public.my_person_id(); fails int; bal bigint; r text;
begin
  if not public._is_desk(p_salon) then raise exception 'not allowed'; end if;
  select count(*) into fails from public.gift_attempts where salon_id = p_salon and person_id is not distinct from me and not ok and at > now() - interval '15 minutes';
  if fails >= 5 then return jsonb_build_object('ok', false, 'reason', 'locked_out'); end if;
  if not public._gift_wellformed(p_code) then r := 'typo';
  else
    select * into g from public.gift_cards where code_hash = public._gift_hash(p_code);
    r := case when g.id is null then 'not_found' when g.salon_id <> p_salon then 'other_salon' else null end;
  end if;
  insert into public.gift_attempts (salon_id, person_id, ok) values (p_salon, me, r is null or r not in ('typo', 'not_found', 'other_salon'));
  if r is not null then return jsonb_build_object('ok', false, 'reason', r); end if;
  return public._gift_card_json(g.id);
end $$;

create function public._gift_card_json(p_card uuid) returns jsonb language plpgsql stable set search_path = '' as $$
declare g public.gift_cards; bal bigint; nw text;
begin
  select * into g from public.gift_cards where id = p_card;
  bal := public._gift_balance(g.id);
  select last4 into nw from public.gift_cards where id = g.replaced_by;
  return jsonb_build_object('ok', g.status = 'active',
    'reason', case g.status when 'in_stock' then 'not_sold' when 'locked' then 'locked' when 'replaced' then 'replaced' when 'voided' then 'voided'
                            when 'used_up' then 'used_up' else null end,
    'card', jsonb_build_object('id', g.id, 'last4', g.last4, 'kind', g.kind, 'status', g.status, 'balance_cents', bal, 'sold_at', g.sold_at,
      'sent_to', g.sent_to, 'from_name', g.from_name, 'replaced_by_last4', nw,
      'buyer', (select name from public.clients where id = g.client_id)));
end $$;

-- Cards for a client phone (bought by them or sent to them), with money left first.
create function public.gift_find(p_salon uuid, p_phone text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public._gift_card_json(g.id) order by g.status = 'active' desc, g.sold_at desc), '[]'::jsonb)
  from public.gift_cards g left join public.clients c on c.id = g.client_id
  where public._is_desk(p_salon) and g.salon_id = p_salon and coalesce(p_phone, '') <> ''
    and (c.phone = p_phone or g.sent_to = p_phone) and g.status in ('active', 'locked', 'replaced', 'used_up');
$$;

-- New digital card for a sale (in stock, $0 until the ticket is paid). The desk gets the code to print / send.
create function public.gift_prepare_digital(p_salon uuid, p_to text, p_from text, p_message text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not public._is_desk(p_salon) then raise exception 'not allowed'; end if;
  if not coalesce((select (gift_settings->>'on')::boolean from public.salons where id = p_salon), false) then raise exception 'gift cards are off'; end if;
  select * into r from public._gift_make(p_salon, 'digital');
  update public.gift_cards set sent_to = nullif(p_to, ''), from_name = nullif(p_from, ''), message = nullif(left(p_message, 200), '') where id = r.id;
  return jsonb_build_object('id', r.id, 'code', r.code, 'last4', right(r.code, 4));
end $$;

-- What is still owed on a ticket after gift cards used on it.
create function public._ticket_left(p_ticket uuid) returns bigint language sql stable set search_path = '' as $$
  select (t.total_cents - coalesce((select sum(amount_cents) from public.payments p where p.ticket_id = t.id and p.method = 'gift_card' and p.status = 'paid'), 0))::bigint
  from public.tickets t where t.id = p_ticket $$;

-- ---------- desk: pay with a gift card ----------
-- p: { paymentId, salonId, ticketId, cardId, cents, takenBy? }. Money comes off the card now (ledger "used").
-- If nothing is left to pay, the ticket is paid. Same paymentId twice = once.
create function public.gift_use(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := (p->>'salonId')::uuid; tid uuid := (p->>'ticketId')::uuid; pid uuid := (p->>'paymentId')::uuid;
  g public.gift_cards; t public.tickets; bal bigint; due bigint; amt bigint; by_m uuid;
begin
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  if exists (select 1 from public.payments where id = pid) then
    return jsonb_build_object('ok', true, 'repeat', true, 'left_cents', public._ticket_left(tid), 'status', (select status from public.tickets where id = tid));
  end if;
  select * into t from public.tickets where id = tid and salon_id = sid for update;
  if t.id is null then raise exception 'save the ticket first'; end if;
  if t.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'already_' || t.status); end if;
  select * into g from public.gift_cards where id = (p->>'cardId')::uuid and salon_id = sid for update;
  if g.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if g.status <> 'active' then return public._gift_card_json(g.id); end if;
  if exists (select 1 from public.ticket_lines where ticket_id = tid and removed_at is null and gift_card_id = g.id) then
    return jsonb_build_object('ok', false, 'reason', 'same_ticket');  -- can't pay for a card with itself
  end if;
  bal := public._gift_balance(g.id);
  due := public._ticket_left(tid);
  amt := least(coalesce((p->>'cents')::bigint, bal), bal, due);
  if amt <= 0 then return jsonb_build_object('ok', false, 'reason', case when bal <= 0 then 'used_up' else 'nothing_due' end); end if;
  if exists (select 1 from public.ticket_lines where ticket_id = tid and removed_at is null and kind = 'service' and staff_id is null) then
    raise exception 'every service needs a staff member';
  end if;
  by_m := public._salon_member(sid, (p->>'takenBy')::uuid);
  insert into public.payments (id, salon_id, ticket_id, method, amount_cents, gift_card_id, card_last4, taken_by, device_id)
  values (pid, sid, tid, 'gift_card', amt, g.id, g.last4, by_m, t.device_id);
  insert into public.gift_card_ledger (salon_id, card_id, ticket_id, payment_id, change_cents, reason, by_member)
  values (sid, g.id, tid, pid, -amt, 'used', by_m);
  if bal - amt = 0 then update public.gift_cards set status = 'used_up' where id = g.id; end if;
  due := due - amt;
  if due = 0 then
    update public.tickets set status = 'paid', paid_at = now(), paid_by = by_m, updated_at = now() where id = tid;
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (sid, public.my_person_id(), 'ticket.paid', jsonb_build_object('ticket', tid, 'number', t.number, 'total_cents', t.total_cents, 'method', 'gift_card'));
  end if;
  return jsonb_build_object('ok', true, 'used_cents', amt, 'balance_after', bal - amt, 'left_cents', due, 'last4', g.last4,
    'status', case when due = 0 then 'paid' else 'open' end);
end $$;

-- Take a gift card payment off an open ticket (desk changed their mind): money goes back on the card.
create function public.gift_undo(p_payment uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pay public.payments; t public.tickets;
begin
  select * into pay from public.payments where id = p_payment and method = 'gift_card' for update;
  if pay.id is null or not public._is_desk(pay.salon_id) then raise exception 'not allowed'; end if;
  if pay.status <> 'paid' then return jsonb_build_object('ok', true, 'repeat', true); end if;
  select * into t from public.tickets where id = pay.ticket_id for update;
  if t.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'already_' || t.status); end if;
  update public.payments set status = 'canceled' where id = pay.id;
  insert into public.gift_card_ledger (salon_id, card_id, ticket_id, payment_id, change_cents, reason)
  values (pay.salon_id, pay.gift_card_id, pay.ticket_id, pay.id, pay.amount_cents, 'undo');
  update public.gift_cards set status = 'active' where id = pay.gift_card_id and status = 'used_up';
  return jsonb_build_object('ok', true, 'left_cents', public._ticket_left(t.id));
end $$;

-- ---------- when a ticket is paid / refunded ----------
create function public._gift_on_ticket() returns trigger language plpgsql security definer set search_path = '' as $$
declare l record; g public.gift_cards; bal bigint;
begin
  if old.status = 'open' and new.status = 'paid' then
    -- Cards sold or topped up on this ticket get their money now (never before).
    for l in select * from public.ticket_lines where ticket_id = new.id and kind = 'gift_sale' and removed_at is null and gift_card_id is not null loop
      select * into g from public.gift_cards where id = l.gift_card_id for update;
      if g.status = 'in_stock' then
        update public.gift_cards set status = 'active', sold_at = now(), sold_ticket = new.id, client_id = coalesce(client_id, new.client_id) where id = g.id;
        insert into public.gift_card_ledger (salon_id, card_id, ticket_id, change_cents, reason, by_member) values (new.salon_id, g.id, new.id, l.amount_cents, 'sold', new.paid_by);
      elsif g.status in ('active', 'used_up') then
        update public.gift_cards set status = 'active' where id = g.id;
        insert into public.gift_card_ledger (salon_id, card_id, ticket_id, change_cents, reason, by_member) values (new.salon_id, g.id, new.id, l.amount_cents, 'reload', new.paid_by);
      end if;
    end loop;
  elsif old.status = 'paid' and new.status = 'refunded' then
    -- Refund: money used from gift cards goes back on them; cards sold on this ticket lose what they got (what's left).
    for l in select * from public.payments p where p.ticket_id = new.id and p.method = 'gift_card' and p.status in ('paid', 'refunded')
               and not exists (select 1 from public.gift_card_ledger x where x.payment_id = p.id and x.reason = 'refund') loop
      insert into public.gift_card_ledger (salon_id, card_id, ticket_id, payment_id, change_cents, reason) values (new.salon_id, l.gift_card_id, new.id, l.id, l.amount_cents, 'refund');
      update public.gift_cards set status = 'active' where id = l.gift_card_id and status = 'used_up';
      update public.payments set status = 'refunded', refunded_cents = amount_cents where id = l.id;
    end loop;
    for l in select * from public.ticket_lines where ticket_id = new.id and kind = 'gift_sale' and removed_at is null and gift_card_id is not null loop
      bal := public._gift_balance(l.gift_card_id);
      if least(bal, l.amount_cents) > 0 then
        insert into public.gift_card_ledger (salon_id, card_id, ticket_id, change_cents, reason) values (new.salon_id, l.gift_card_id, new.id, -least(bal, l.amount_cents), 'refund');
      end if;
      update public.gift_cards set status = 'voided' where id = l.gift_card_id and public._gift_balance(id) = 0;
    end loop;
  end if;
  return new;
end $$;
create trigger gift_on_ticket after update of status on public.tickets for each row execute function public._gift_on_ticket();

-- ---------- save_ticket: + gift card sale lines, cash pays what's left after gift cards ----------
create or replace function public.save_ticket(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid := (p->>'id')::uuid;
  sid uuid := (p->>'salonId')::uuid;
  t public.tickets;
  cid uuid;
  ln jsonb; i int := 0; keep uuid[] := '{}';
  sub bigint; disc bigint; tip bigint; gift bigint; total bigint; given bigint; left_due bigint;
  gc public.gift_cards; gs jsonb;
begin
  if tid is null or sid is null then raise exception 'ticket id and salon required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;

  select * into t from public.tickets where id = tid for update;
  if t.id is not null and t.salon_id <> sid then raise exception 'not allowed'; end if;
  if t.id is not null and t.status <> 'open' then
    return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status);
  end if;
  select gift_settings into gs from public.salons where id = sid;

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
    if ln->>'kind' not in ('service', 'discount', 'tip', 'gift_sale') then raise exception 'bad line'; end if;
    if ln->>'kind' = 'discount' then
      if not exists (select 1 from public.discount_approvals a where a.id = (ln->>'approvalId')::uuid and a.salon_id = sid and a.at > now() - interval '12 hours')
      then raise exception 'discount needs a manager PIN'; end if;
      if (ln->>'cents')::bigint > 0 then raise exception 'discount must take money off'; end if;
    elsif (ln->>'cents')::bigint < 0 then raise exception 'amount can''t be below $0';
    end if;
    if ln->>'kind' = 'gift_sale' then
      select * into gc from public.gift_cards where id = (ln->>'giftCardId')::uuid and salon_id = sid;
      if gc.id is null or gc.status not in ('in_stock', 'active', 'used_up') then raise exception 'gift card can''t be sold'; end if;
      if gc.status = 'in_stock' and (ln->>'cents')::bigint < coalesce((gs->>'min_cents')::bigint, 100) then raise exception 'gift card amount too small'; end if;
      if public._gift_balance(gc.id) + (ln->>'cents')::bigint > coalesce((gs->>'max_cents')::bigint, 100000) then raise exception 'gift card amount too big'; end if;
    end if;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, service_id, staff_id, name, minutes, amount_cents, price_from, reason, approval_id, gift_card_id, sort)
    values ((ln->>'id')::uuid, sid, tid, ln->>'kind',
            (select id from public.services where id = (ln->>'serviceId')::uuid and salon_id = sid),
            case when ln->>'kind' = 'gift_sale' then null else public._salon_member(sid, (ln->>'staffId')::uuid) end,
            coalesce(ln->>'name', ''), (ln->>'minutes')::int, (ln->>'cents')::bigint, coalesce((ln->>'priceFrom')::boolean, false),
            ln->>'reason', (ln->>'approvalId')::uuid, case when ln->>'kind' = 'gift_sale' then gc.id end, i)
    on conflict (id) do update set kind = excluded.kind, service_id = excluded.service_id, staff_id = excluded.staff_id, name = excluded.name,
      minutes = excluded.minutes, amount_cents = excluded.amount_cents, price_from = excluded.price_from, reason = excluded.reason,
      approval_id = excluded.approval_id, gift_card_id = excluded.gift_card_id, sort = excluded.sort, removed_at = null
    where public.ticket_lines.ticket_id = tid;
    keep := keep || (ln->>'id')::uuid;
  end loop;
  -- Card tips come from Stripe, not the device: keep them.
  update public.ticket_lines set removed_at = now() where ticket_id = tid and removed_at is null and not (id = any (keep)) and name <> 'Card tip';

  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0),
         coalesce(-sum(amount_cents) filter (where kind = 'discount'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'gift_sale'), 0)
    into sub, disc, tip, gift from public.ticket_lines where ticket_id = tid and removed_at is null;
  disc := least(disc, sub);
  total := sub - disc + tip + gift;
  update public.tickets set subtotal_cents = sub, discount_cents = disc, tip_cents = tip, gift_cents = gift, total_cents = total where id = tid;

  if p ? 'payment' and p->'payment' is not null and jsonb_typeof(p->'payment') = 'object' then
    if p->'payment'->>'method' <> 'cash' then raise exception 'only cash here'; end if;
    if exists (select 1 from public.ticket_lines where ticket_id = tid and removed_at is null and kind = 'service' and staff_id is null) then
      raise exception 'every service needs a staff member';
    end if;
    left_due := public._ticket_left(tid);
    given := (p->'payment'->>'givenCents')::bigint;
    if given is null or given < left_due then raise exception 'cash given is less than the total'; end if;
    insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, given_cents, change_cents, taken_by, device_id, at)
    values ((p->'payment'->>'id')::uuid, sid, tid, 'cash', left_due, tip, given, given - left_due,
            public._salon_member(sid, (p->'payment'->>'takenBy')::uuid), t.device_id,
            least(now(), coalesce((p->'payment'->>'at')::timestamptz, now())))
    on conflict (id) do nothing;
    update public.tickets set status = 'paid', paid_at = least(now(), coalesce((p->'payment'->>'at')::timestamptz, now())),
      paid_by = public._salon_member(sid, (p->'payment'->>'takenBy')::uuid), updated_at = now()
    where id = tid returning * into t;
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (sid, public.my_person_id(), 'ticket.paid', jsonb_build_object('ticket', tid, 'number', t.number, 'total_cents', total, 'method', 'cash'));
  end if;

  return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status, 'left_cents', public._ticket_left(tid));
end $$;

-- ---------- cards: what's left after gift cards; gift card sales count in the total ----------
create or replace function public.pay_info(p_ticket uuid)
returns table (salon_id uuid, number int, status text, due_cents bigint, account_id text, charges_enabled boolean, salon_name text)
language plpgsql stable security definer set search_path = '' as $$
declare t public.tickets;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null or not public._is_desk(t.salon_id) then raise exception 'not allowed'; end if;
  return query select t.salon_id, t.number, t.status,
    t.subtotal_cents - t.discount_cents + t.gift_cents
      - coalesce((select sum(amount_cents) from public.payments p where p.ticket_id = t.id and p.method = 'gift_card' and p.status = 'paid'), 0)::bigint,
    a.account_id, coalesce(a.charges_enabled, false), s.name
    from public.salons s left join public.stripe_accounts a on a.salon_id = s.id where s.id = t.salon_id;
end $$;

create or replace function public.settle_card(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pr public.pay_requests; t public.tickets; pid uuid; tp jsonb; sub bigint; disc bigint; tip bigint; gift bigint;
begin
  select * into pr from public.pay_requests where id = (p->>'payRequestId')::uuid for update;
  if pr.id is null then raise exception 'no pay request'; end if;
  select * into t from public.tickets where id = pr.ticket_id for update;
  if exists (select 1 from public.payments where stripe_payment_intent = p->>'paymentIntent') or t.status <> 'open' then
    update public.pay_requests set status = 'paid', updated_at = now() where id = pr.id and status = 'pending';
    return jsonb_build_object('ticket', t.id, 'status', t.status, 'already', true);
  end if;
  for tp in select * from jsonb_array_elements(coalesce(p->'tips', '[]')) loop
    continue when coalesce((tp->>'cents')::bigint, 0) <= 0;
    insert into public.ticket_lines (id, salon_id, ticket_id, kind, staff_id, name, amount_cents, sort)
    values (gen_random_uuid(), t.salon_id, t.id, 'tip', public._salon_member(t.salon_id, (tp->>'staffId')::uuid), 'Card tip', (tp->>'cents')::bigint, 1000);
  end loop;
  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0), coalesce(-sum(amount_cents) filter (where kind = 'discount'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0), coalesce(sum(amount_cents) filter (where kind = 'gift_sale'), 0)
    into sub, disc, tip, gift from public.ticket_lines where ticket_id = t.id and removed_at is null;
  disc := least(disc, sub);
  insert into public.payments (id, salon_id, ticket_id, method, amount_cents, tip_cents, fee_cents, stripe_payment_intent, card_brand, card_last4, taken_by, device_id, at)
  values (gen_random_uuid(), t.salon_id, t.id, pr.method, (p->>'amountCents')::bigint, coalesce((p->>'tipCents')::bigint, 0), coalesce((p->>'feeCents')::bigint, 0),
          p->>'paymentIntent', p->>'brand', p->>'last4', pr.created_by, t.device_id, coalesce((p->>'at')::timestamptz, now()))
  returning id into pid;
  update public.tickets set status = 'paid', paid_at = coalesce((p->>'at')::timestamptz, now()), paid_by = pr.created_by,
    subtotal_cents = sub, discount_cents = disc, tip_cents = tip, gift_cents = gift, total_cents = sub - disc + tip + gift, updated_at = now() where id = t.id;
  update public.pay_requests set status = 'paid', tip_cents = coalesce((p->>'tipCents')::bigint, 0), payment_intent = p->>'paymentIntent', updated_at = now() where id = pr.id;
  update public.pay_requests set status = 'canceled', updated_at = now() where ticket_id = t.id and id <> pr.id and status = 'pending';
  insert into public.audit_log (salon_id, action, detail)
  values (t.salon_id, 'ticket.paid', jsonb_build_object('ticket', t.id, 'number', t.number, 'total_cents', (p->>'amountCents')::bigint, 'method', pr.method));
  return jsonb_build_object('ticket', t.id, 'status', 'paid', 'payment', pid);
end $$;

-- Refund picks the cash/card payment (gift card money goes back on the card through the trigger above).
create or replace function public.settle_refund(p_ticket uuid, p_stripe_refund text, p_reason text, p_by uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; pay public.payments;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.status = 'refunded' then return jsonb_build_object('status', 'refunded', 'already', true); end if;
  if t.status <> 'paid' then raise exception 'only a paid ticket can be refunded'; end if;
  select * into pay from public.payments where ticket_id = t.id and status = 'paid' order by (method = 'gift_card'), at desc limit 1;
  insert into public.refunds (salon_id, ticket_id, payment_id, amount_cents, reason, stripe_refund_id, approved_by)
  values (t.salon_id, t.id, pay.id, pay.amount_cents, coalesce(p_reason, ''), p_stripe_refund, public._salon_member(t.salon_id, p_by));
  if pay.method <> 'gift_card' then update public.payments set status = 'refunded', refunded_cents = amount_cents where id = pay.id; end if;
  update public.tickets set status = 'refunded', updated_at = now() where id = t.id;
  insert into public.audit_log (salon_id, action, detail) values (t.salon_id, 'ticket.refunded', jsonb_build_object('ticket', t.id, 'number', t.number, 'amount_cents', pay.amount_cents));
  return jsonb_build_object('status', 'refunded');
end $$;

-- ---------- owner / manager ----------
-- Totals for the Gift cards page.
create function public.gift_summary(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with z as (select date_trunc('month', now() at time zone time_zone) at time zone time_zone as m from public.salons where id = p_salon)
  select case when public.is_admin(p_salon) then jsonb_build_object(
    'owed_cents', (select coalesce(sum(change_cents), 0) from public.gift_card_ledger l join public.gift_cards g on g.id = l.card_id
                   where l.salon_id = p_salon and g.status in ('active', 'locked')),
    'active', (select count(*) from public.gift_cards where salon_id = p_salon and status = 'active'),
    'in_stock_plastic', (select count(*) from public.gift_cards where salon_id = p_salon and status = 'in_stock' and kind = 'plastic'),
    'sold_month_cents', (select coalesce(sum(change_cents), 0) from public.gift_card_ledger, z where salon_id = p_salon and reason in ('sold', 'reload') and at >= z.m),
    'used_month_cents', (select coalesce(-sum(change_cents), 0) from public.gift_card_ledger, z where salon_id = p_salon and reason = 'used' and at >= z.m),
    'settings', (select gift_settings from public.salons where id = p_salon),
    'prefix', (select gift_prefix from public.salons where id = p_salon)) end;
$$;

-- All codes (last 4 only), newest first.
create function public.gift_list(p_salon uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', g.id, 'last4', g.last4, 'kind', g.kind, 'status', g.status, 'made_by', g.made_by,
      'balance_cents', public._gift_balance(g.id), 'sold_at', g.sold_at, 'buyer', c.name, 'sent_to', g.sent_to,
      'replaced_by_last4', (select last4 from public.gift_cards n where n.id = g.replaced_by),
      'last_used', (select max(at) from public.gift_card_ledger l where l.card_id = g.id and l.reason = 'used'),
      'created_at', g.created_at) as x
    from public.gift_cards g left join public.clients c on c.id = g.client_id
    where g.salon_id = p_salon and public.is_admin(p_salon)
  ) s;
$$;

create function public.gift_history(p_card uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'reason', l.reason, 'cents', l.change_cents, 'ticket', t.number, 'by', m.display_name) order by l.id), '[]'::jsonb)
  from public.gift_card_ledger l join public.gift_cards g on g.id = l.card_id
  left join public.tickets t on t.id = l.ticket_id left join public.memberships m on m.id = l.by_member
  where l.card_id = p_card and public.is_admin(g.salon_id);
$$;

-- Make N plastic cards (in stock, $0). Codes come back once, to print. Owner/manager.
create function public.gift_make_plastic(p_salon uuid, p_count int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb := '[]'; r record; i int;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_count < 1 or p_count > 500 then raise exception 'make 1 to 500 cards at a time'; end if;
  for i in 1..p_count loop
    select * into r from public._gift_make(p_salon, 'plastic');
    out := out || jsonb_build_array(r.code);
  end loop;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, public.my_person_id(), 'gift.made', jsonb_build_object('count', p_count));
  return out;
end $$;

-- Lost card: lock it and move its money to a new card (digital = new code shown once; plastic = scanned from stock).
create function public.gift_replace(p_card uuid, p_plastic_code text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.gift_cards; n public.gift_cards; bal bigint; code text; r record; me uuid;
begin
  select * into g from public.gift_cards where id = p_card for update;
  if g.id is null or not public.is_admin(g.salon_id) then raise exception 'not allowed'; end if;
  if g.status not in ('active', 'locked') then raise exception 'only an active or locked card can be replaced'; end if;
  me := (select m.id from public.memberships m where m.salon_id = g.salon_id and m.person_id = public.my_person_id() and m.archived_at is null limit 1);
  bal := public._gift_balance(g.id);
  if p_plastic_code is not null then
    select * into n from public.gift_cards where code_hash = public._gift_hash(p_plastic_code) and salon_id = g.salon_id for update;
    if n.id is null or n.status <> 'in_stock' or n.kind <> 'plastic' then raise exception 'scan a blank card from stock'; end if;
  else
    select * into r from public._gift_make(g.salon_id, 'digital');
    select * into n from public.gift_cards where id = r.id;
    code := r.code;
  end if;
  update public.gift_cards set status = 'active', sold_at = now(), client_id = g.client_id, sent_to = g.sent_to, from_name = g.from_name where id = n.id;
  update public.gift_cards set status = 'replaced', locked_at = coalesce(locked_at, now()), replaced_by = n.id where id = g.id;
  if bal > 0 then
    insert into public.gift_card_ledger (salon_id, card_id, change_cents, reason, by_member, note) values (g.salon_id, g.id, -bal, 'replaced_out', me, 'to ' || n.last4);
    insert into public.gift_card_ledger (salon_id, card_id, change_cents, reason, by_member, note) values (g.salon_id, n.id, bal, 'replaced_in', me, 'from ' || g.last4);
  end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (g.salon_id, public.my_person_id(), 'gift.replaced', jsonb_build_object('old', g.last4, 'new', n.last4, 'cents', bal));
  return jsonb_build_object('ok', true, 'last4', n.last4, 'code', code, 'moved_cents', bal);
end $$;

-- Lock only (card reported lost, replace later).
create function public.gift_lock(p_card uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.gift_cards;
begin
  select * into g from public.gift_cards where id = p_card;
  if g.id is null or not public.is_admin(g.salon_id) then raise exception 'not allowed'; end if;
  update public.gift_cards set status = 'locked', locked_at = now() where id = g.id and status = 'active';
  insert into public.audit_log (salon_id, person_id, action, detail) values (g.salon_id, public.my_person_id(), 'gift.locked', jsonb_build_object('card', g.last4));
end $$;

-- Plastic card with $0 back to stock (unlinked from the client; history stays).
create function public.gift_restock(p_card uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.gift_cards;
begin
  select * into g from public.gift_cards where id = p_card for update;
  if g.id is null or not public.is_admin(g.salon_id) then raise exception 'not allowed'; end if;
  if g.kind <> 'plastic' or g.status <> 'used_up' or public._gift_balance(g.id) <> 0 then raise exception 'only a used-up plastic card with $0 can go back to stock'; end if;
  update public.gift_cards set status = 'in_stock', client_id = null, sent_to = null, from_name = null, message = null, sold_at = null, sold_ticket = null where id = g.id;
end $$;

-- Old paper certificates / another system's cards: owner adds them with their balance (new code made by us).
create function public.gift_migrate(p_salon uuid, p_cents bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_cents <= 0 then raise exception 'amount must be above $0'; end if;
  select * into r from public._gift_make(p_salon, 'paper', 'migrated');
  update public.gift_cards set status = 'active', sold_at = now() where id = r.id;
  insert into public.gift_card_ledger (salon_id, card_id, change_cents, reason, note) values (p_salon, r.id, p_cents, 'migrated', p_note);
  return jsonb_build_object('id', r.id, 'code', r.code, 'last4', right(r.code, 4));
end $$;

create function public.gift_settings_save(p_salon uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  update public.salons set gift_settings = jsonb_build_object(
    'on', coalesce((p->>'on')::boolean, true),
    'amounts', coalesce(p->'amounts', '[2500, 5000, 10000]'),
    'min_cents', greatest(100, coalesce((p->>'min_cents')::bigint, 1000)),
    'max_cents', least(200000, coalesce((p->>'max_cents')::bigint, 50000))) where id = p_salon;
end $$;

-- ---------- grants ----------
revoke execute on function public._gift_new_code(text, boolean), public._gift_make(uuid, text, text), public._gift_card_json(uuid),
  public._gift_balance(uuid), public._ticket_left(uuid), public._gift_on_ticket() from public, anon, authenticated;
revoke execute on function public.gift_lookup(uuid, text), public.gift_find(uuid, text), public.gift_prepare_digital(uuid, text, text, text),
  public.gift_use(jsonb), public.gift_undo(uuid), public.gift_summary(uuid), public.gift_list(uuid), public.gift_history(uuid),
  public.gift_make_plastic(uuid, int), public.gift_replace(uuid, text), public.gift_lock(uuid), public.gift_restock(uuid),
  public.gift_migrate(uuid, bigint, text), public.gift_settings_save(uuid, jsonb) from public, anon;
grant execute on function public.gift_lookup(uuid, text), public.gift_find(uuid, text), public.gift_prepare_digital(uuid, text, text, text),
  public.gift_use(jsonb), public.gift_undo(uuid), public.gift_summary(uuid), public.gift_list(uuid), public.gift_history(uuid),
  public.gift_make_plastic(uuid, int), public.gift_replace(uuid, text), public.gift_lock(uuid), public.gift_restock(uuid),
  public.gift_migrate(uuid, bigint, text), public.gift_settings_save(uuid, jsonb) to authenticated;
