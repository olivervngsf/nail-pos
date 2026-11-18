-- Text sender (Nov 18): every outgoing text goes through one server-side sender (src/lib/server/sms.ts).
-- Server only: the app never reads or writes these tables directly (RLS on, no policies; the server uses the secret key).
--
-- text_numbers   = our sending numbers: the PolishOS number (salon_id null) + one per salon once registered (A2P 10DLC).
-- text_messages  = one row per text we tried to send (kind, body, parts, status from Twilio), sent once per client_key.
-- text_optouts   = phones that replied STOP to a number (per salon; salon_id null = the PolishOS number).

create table public.text_numbers (
  phone text primary key,                                   -- E.164, e.g. +14085550100
  salon_id uuid references public.salons(id),               -- null = the PolishOS platform number
  messaging_service_sid text not null,                      -- Twilio Messaging Service (MG…) the number sits in
  status text not null default 'pending' check (status in ('pending', 'active', 'stopped')),
  created_at timestamptz not null default now()
);
create unique index text_numbers_one_active_per_salon on public.text_numbers (coalesce(salon_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'active';

create table public.text_messages (
  id uuid primary key default gen_random_uuid(),
  client_key text not null unique,                          -- same key = same text: never sent twice
  salon_id uuid references public.salons(id),
  kind text not null check (kind in ('invite', 'salon_ready', 'confirm', 'reminder', 'receipt', 'promo', 'other')),
  to_phone text not null,
  from_number text,
  body text not null,
  parts int not null default 1,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped', 'blocked')),
  provider_sid text unique,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.text_messages (salon_id, created_at desc);

create table public.text_optouts (
  id bigserial primary key,
  phone text not null,
  salon_id uuid references public.salons(id),               -- null = opted out of the PolishOS number
  stopped_at timestamptz not null default now()
);
create unique index text_optouts_one on public.text_optouts (phone, coalesce(salon_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.text_numbers enable row level security;
alter table public.text_messages enable row level security;
alter table public.text_optouts enable row level security;
revoke all on public.text_numbers, public.text_messages, public.text_optouts from anon, authenticated;
revoke all on sequence public.text_optouts_id_seq from anon, authenticated;
