-- Nail POS — database draft (Supabase / Postgres). Start migrations from this file.
-- Rules: every table has salon_id + RLS; money in cents (bigint); nothing is deleted (status / void / opposite rows);
-- ledgers are insert-only and written by server functions only; timestamps are timestamptz.

-- §1 Salons, people, access ---------------------------------------------------
create table salons (
  id uuid primary key default gen_random_uuid(),
  name text not null, short_code text not null unique,          -- e.g. MAIN (gift card prefix)
  state text not null, timezone text not null default 'America/Los_Angeles',
  phone text, address text, hours jsonb, plan text default 'pilot',
  created_at timestamptz default now()
);
create table people (                                           -- one person = one account (phone)
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,                                     -- supabase auth.users.id
  phone text unique not null, email text, name text not null,
  language text not null default 'en', photo_url text,
  created_at timestamptz default now()
);
create type role as enum ('owner','manager','front_desk','tech');
create table memberships (                                      -- person ↔ salon + role + PIN
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons, person_id uuid not null references people,
  role role not null, pin_hash text, active boolean default true,
  pay_type text, rate_cents bigint, commission_pct numeric, skills text[],
  unique (salon_id, person_id)
);
create table devices (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons, name text, kind text, last_seen timestamptz);
create table audit_log (id bigserial primary key, salon_id uuid, person_id uuid, action text not null, detail jsonb, at timestamptz default now());

create or replace function is_member(s uuid) returns boolean language sql stable as $$
  select exists (select 1 from memberships m join people p on p.id = m.person_id
                 where m.salon_id = s and m.active and p.auth_user_id = auth.uid());
$$;
-- pattern for every table with salon_id:
--   alter table <t> enable row level security;
--   create policy member_read on <t> for select using (is_member(salon_id));
--   writes: through server routes / functions with role checks, not open policies.

-- §2 Services, clients, booking, tickets ------------------------------------------
create table services (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  category text, name text not null, minutes int not null, price_cents bigint not null, online boolean default true, active boolean default true);
create table clients (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  phone text, name text, email text, birthday date, language text default 'en', texts_ok boolean default false,
  referral_code text, notes text, created_at timestamptz default now(), unique (salon_id, phone), unique (salon_id, referral_code));
create table appointments (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  client_id uuid references clients, staff_id uuid references memberships, starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'booked',   -- booked, confirmed, unconfirmed, in_chair, done, cancelled, no_show
  source text not null,                    -- phone, walk_in, desk, online_google, online_website, instagram, qr, text, kiosk, staff_phone, rebook
  repeat_rule_id uuid, services jsonb, created_by uuid, created_at timestamptz default now());
create table repeat_rules (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  every int not null, unit text not null, weekday int, ends text, ends_after int, ends_on date);
create table waitlist (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  client_id uuid references clients, ticket_no text, services jsonb, joined_at timestamptz default now(), status text default 'waiting');
create table clock_events (id bigserial primary key, salon_id uuid not null references salons, membership_id uuid not null references memberships, kind text not null, at timestamptz default now(), device_id uuid);

create table tickets (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  number int not null, client_id uuid references clients, appointment_id uuid references appointments,
  status text not null default 'open',     -- open, paid, refunded, voided
  opened_by uuid, paid_at timestamptz, unique (salon_id, number));
create table ticket_lines (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  ticket_id uuid not null references tickets, kind text not null,  -- service, discount, gift_card_sale, gift_card_reload, loyalty_reward, perk, package, tip
  service_id uuid references services, staff_id uuid references memberships, gift_card_id uuid,
  amount_cents bigint not null, note text);
create table payments (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  ticket_id uuid not null references tickets, method text not null,  -- cash, card_reader, pay_link, gift_card
  amount_cents bigint not null, tip_cents bigint default 0, fee_cents bigint default 0,
  stripe_payment_intent text, status text not null, at timestamptz default now());
create table stripe_events (id text primary key, salon_id uuid, ticket_id uuid, type text, payload jsonb, received_at timestamptz default now());

-- §3 Gift cards + loyalty (ledgers) -------------------------------------------------
create table gift_cards (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  code_hash text not null, last4 text not null, kind text not null,        -- digital, plastic, paper
  status text not null default 'in_stock',  -- in_stock, active, used_up, locked, replaced, voided
  linked_client_id uuid references clients, replaced_by uuid references gift_cards,
  made_by text not null default 'system', created_at timestamptz default now(), unique (salon_id, code_hash));
create table gift_card_ledger (id bigserial primary key, salon_id uuid not null references salons,
  card_id uuid not null references gift_cards, ticket_id uuid references tickets,
  change_cents bigint not null, reason text not null,  -- sold, reload, used, refund, replaced_out, replaced_in, adjust, migrated
  staff_id uuid, note text, at timestamptz default now());
create table loyalty_settings (salon_id uuid primary key references salons, kind text not null default 'points',
  points_per_dollar int default 1, reward_points int default 100, reward_cents bigint default 1000, on boolean default false);
create table loyalty_ledger (id bigserial primary key, salon_id uuid not null references salons,
  client_id uuid not null references clients, ticket_id uuid references tickets,
  change int not null, reason text not null,  -- earn, redeem, refund, adjust, referral, perk
  staff_id uuid, note text, at timestamptz default now());
create view client_points as select salon_id, client_id, sum(change) as points from loyalty_ledger group by 1,2;
create view gift_card_balance as select salon_id, card_id, sum(change_cents) as balance_cents from gift_card_ledger group by 1,2;
-- ledgers: revoke insert/update/delete from authenticated; only security-definer functions write.

-- §4 The one function that settles a paid ticket -------------------------------------
-- on_ticket_paid(ticket_id): called by the Stripe webhook (card) or the server route that closes cash / gift card.
-- One transaction, all or nothing:
--   1. tickets.status = 'paid', paid_at = now()
--   2. for each gift_card_sale / gift_card_reload line: card.status = 'active'; ledger +amount (sold / reload)
--   3. for each gift_card payment: ledger −amount (used); status = 'used_up' when balance hits 0
--   4. loyalty (if on and client has phone): ledger +points on service lines (before tip, tax, discounts, gift card sales);
--      ledger −reward_points for a loyalty_reward line
--   5. audit_log row
-- Refund: refund_ticket(ticket_id) writes the opposite rows; never edits old rows.

-- §5 Close day + payouts --------------------------------------------------------------
create table day_closes (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons, day date not null,
  cash_counted_cents bigint, cash_expected_cents bigint, card_stripe_cents bigint, closed_by uuid, closed_at timestamptz, unique (salon_id, day));
create table payout_lines (id uuid primary key default gen_random_uuid(), salon_id uuid not null references salons,
  day date not null, membership_id uuid not null references memberships,
  service_cents bigint, commission_cents bigint, tips_card_cents bigint, tips_cash_cents bigint, paid_by text);  -- cash / check split
