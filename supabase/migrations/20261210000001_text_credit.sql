-- Text credit (Nov 17, Text Credits board https://claude.ai/artifact/6Rak28Hwuu6PJoQDfMXWwX, pick "2 · Two lines").
-- Service texts (confirmations, reminders, receipts, login codes) are part of the plan: never use credit, never stop.
-- Promo texts use prepaid credit: 2¢ per text part. The balance is the sum of the ledger; nothing edits or deletes a row.
-- Owner + manager see it (is_admin); only the owner adds credit. Adding is a test stub until platform billing exists
-- (no card is charged yet; the row says so).

create table public.text_credit_settings (
  salon_id uuid primary key references public.salons(id),
  warn_pct int not null default 20 check (warn_pct between 5 and 50),
  auto_add_on boolean not null default false,                       -- only if the owner turns it on
  auto_add_cents bigint not null default 2500 check (auto_add_cents between 500 and 50000),
  auto_add_max_cents bigint not null default 5000 check (auto_add_max_cents between 500 and 100000),  -- cap per month
  updated_at timestamptz not null default now()
);
create table public.text_credit_ledger (
  id bigserial primary key,
  salon_id uuid not null references public.salons(id),
  kind text not null check (kind in ('add', 'spend', 'refund', 'adjust')),
  cents bigint not null,                    -- + add/refund, − spend
  texts int not null default 0,             -- text parts sent (spend) or given back (refund)
  label text not null,
  person_id uuid references public.people(id),
  client_id text unique,                    -- device id of the request: applied once
  at timestamptz not null default now(),
  check ((kind = 'spend' and cents <= 0) or (kind in ('add', 'refund') and cents >= 0) or kind = 'adjust')
);
create index on public.text_credit_ledger (salon_id, at desc);
alter table public.text_credit_settings enable row level security;
alter table public.text_credit_ledger enable row level security;
create policy "admins read" on public.text_credit_settings for select to authenticated using (public.is_admin(salon_id));
create policy "admins read" on public.text_credit_ledger for select to authenticated using (public.is_admin(salon_id));
-- Ledger + settings: only the functions below write them.

create function public._text_credit_balance(p_salon uuid) returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cents), 0)::bigint from public.text_credit_ledger where salon_id = p_salon;
$$;

-- Everything the menu ring + Manage credit page show. Null for anyone who isn't owner/manager.
create function public.text_credit_get(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.text_credit_settings; bal bigint; last_add bigint; month_start timestamptz;
begin
  if not public.is_admin(p_salon) then return null; end if;
  select * into s from public.text_credit_settings where salon_id = p_salon;
  bal := public._text_credit_balance(p_salon);
  select cents into last_add from public.text_credit_ledger where salon_id = p_salon and kind = 'add' order by at desc, id desc limit 1;
  month_start := date_trunc('month', now());
  return jsonb_build_object(
    'balanceCents', bal,
    'lastAddCents', coalesce(last_add, 0),
    'centsPerText', 2,
    'warnPct', coalesce(s.warn_pct, 20),
    'autoAdd', jsonb_build_object('on', coalesce(s.auto_add_on, false), 'cents', coalesce(s.auto_add_cents, 2500), 'maxCents', coalesce(s.auto_add_max_cents, 5000)),
    'includedMonth', (select count(*) from public.reminders where salon_id = p_salon and status = 'sent' and send_at >= month_start),
    'addedMonthCents', (select coalesce(sum(cents), 0) from public.text_credit_ledger where salon_id = p_salon and kind = 'add' and at >= month_start),
    'spentMonthCents', (select coalesce(-sum(cents), 0) from public.text_credit_ledger where salon_id = p_salon and kind = 'spend' and at >= month_start),
    'lastSend', (select jsonb_build_object('label', label, 'cents', cents, 'texts', texts, 'at', at) from public.text_credit_ledger
      where salon_id = p_salon and kind = 'spend' order by at desc, id desc limit 1),
    'rows', coalesce((select jsonb_agg(r order by r->>'at' desc, (r->>'id')::bigint desc) from (
      select jsonb_build_object('id', l.id, 'at', l.at, 'kind', l.kind, 'label', l.label, 'texts', l.texts, 'cents', l.cents,
        'who', (select m.display_name from public.memberships m where m.salon_id = p_salon and m.person_id = l.person_id limit 1),
        'balanceCents', sum(l.cents) over (order by l.at, l.id)) as r
      from public.text_credit_ledger l where l.salon_id = p_salon order by l.at desc, l.id desc limit 50) x), '[]'::jsonb)
  );
end $$;

-- Owner adds credit. TEST STUB: no card is charged yet (platform billing comes later); the label says so.
create function public.text_credit_add(p_salon uuid, p_cents bigint, p_client_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_person_id();
begin
  if not exists (select 1 from public.memberships where salon_id = p_salon and person_id = me and role = 'owner' and archived_at is null) then
    raise exception 'only the owner can add text credit';
  end if;
  if p_cents is null or p_cents < 500 or p_cents > 50000 then raise exception 'credit must be $5 to $500'; end if;
  if p_client_id is null or length(p_client_id) < 8 then raise exception 'missing request id'; end if;
  perform pg_advisory_xact_lock(hashtext('text_credit:' || p_salon::text));
  if not exists (select 1 from public.text_credit_ledger where client_id = p_client_id) then
    insert into public.text_credit_ledger (salon_id, kind, cents, label, person_id, client_id)
    values (p_salon, 'add', p_cents, 'Added credit (test version, no card charged)', me, p_client_id);
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, me, 'text_credit_add', jsonb_build_object('cents', p_cents));
  end if;
  return public.text_credit_get(p_salon);
end $$;

create function public.text_credit_settings_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'owner or manager only'; end if;
  insert into public.text_credit_settings (salon_id, warn_pct, auto_add_on, auto_add_cents, auto_add_max_cents, updated_at)
  values (p_salon, coalesce((p->>'warnPct')::int, 20), coalesce((p->>'autoAddOn')::boolean, false),
          coalesce((p->>'autoAddCents')::bigint, 2500), coalesce((p->>'autoAddMaxCents')::bigint, 5000), now())
  on conflict (salon_id) do update set warn_pct = excluded.warn_pct, auto_add_on = excluded.auto_add_on,
    auto_add_cents = excluded.auto_add_cents, auto_add_max_cents = excluded.auto_add_max_cents, updated_at = now();
  return public.text_credit_get(p_salon);
end $$;

-- The one place promo texts take credit (server only, used by the promo sender). All or nothing: refuses when the
-- balance can't cover the whole send. p_texts = people × parts. Returns the new balance.
create function public._text_credit_spend(p_salon uuid, p_texts int, p_label text, p_person uuid, p_client_id text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare cost bigint := p_texts::bigint * 2; bal bigint;
begin
  if p_texts is null or p_texts <= 0 then raise exception 'nothing to send'; end if;
  perform pg_advisory_xact_lock(hashtext('text_credit:' || p_salon::text));
  if exists (select 1 from public.text_credit_ledger where client_id = p_client_id) then return public._text_credit_balance(p_salon); end if;
  bal := public._text_credit_balance(p_salon);
  if bal < cost then raise exception 'not enough text credit: need %, have %', cost, bal; end if;
  insert into public.text_credit_ledger (salon_id, kind, cents, texts, label, person_id, client_id)
  values (p_salon, 'spend', -cost, p_texts, p_label, p_person, p_client_id);
  return bal - cost;
end $$;

revoke execute on function public._text_credit_balance(uuid) from public, anon, authenticated;
revoke execute on function public._text_credit_spend(uuid, int, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.text_credit_get(uuid) from public, anon;
revoke execute on function public.text_credit_add(uuid, bigint, text) from public, anon;
revoke execute on function public.text_credit_settings_save(uuid, jsonb) from public, anon;
grant execute on function public.text_credit_get(uuid) to authenticated;
grant execute on function public.text_credit_add(uuid, bigint, text) to authenticated;
grant execute on function public.text_credit_settings_save(uuid, jsonb) to authenticated;
