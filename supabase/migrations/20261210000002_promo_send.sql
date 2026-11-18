-- Promo send with cost check (Text Credits board, "All · Cost check before every send"). TEST VERSION: the send is recorded and
-- the credit is taken, but no text goes out yet (needs the salon's own number + A2P 10DLC). Every row says status 'test'.
-- Who gets it: clients who said yes to texts (texts_ok) with a phone; "lapsed" = last paid visit 60+ days ago.
-- Cost is worked out here, not on the device: people × parts × 2¢, all or nothing (_text_credit_spend).

create table public.promo_sends (
  id uuid primary key,                       -- made on the device: a retry is applied once
  salon_id uuid not null references public.salons(id),
  message text not null check (char_length(message) between 1 and 480),
  audience text not null check (audience in ('all', 'lapsed')),
  people int not null,
  parts int not null,
  texts int not null,
  cents bigint not null,
  status text not null default 'test' check (status in ('test', 'queued', 'sent')),
  person_id uuid references public.people(id),
  at timestamptz not null default now()
);
create index on public.promo_sends (salon_id, at desc);
alter table public.promo_sends enable row level security;
create policy "admins read" on public.promo_sends for select to authenticated using (public.is_admin(salon_id));

-- Text parts: plain letters (printable ASCII) 160 per text, 153 each when split; anything else (Vietnamese accents) 70 / 67.
-- Same rule as textParts() in src/lib/texting/credit.ts.
create function public._text_parts(msg text) returns int language sql immutable set search_path = '' as $$
  select case
    when coalesce(char_length(msg), 0) = 0 then 0
    when msg ~ '^[\x20-\x7E\n\r]*$' then case when char_length(msg) <= 160 then 1 else ceil(char_length(msg) / 153.0)::int end
    else case when char_length(msg) <= 70 then 1 else ceil(char_length(msg) / 67.0)::int end
  end;
$$;

create function public._promo_people(p_salon uuid, p_audience text) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.clients c
  where c.salon_id = p_salon and c.archived_at is null and c.texts_ok and coalesce(c.phone, '') <> ''
    and (p_audience = 'all' or (
      select max(t.paid_at) from public.tickets t where t.client_id = c.id and t.status = 'paid') < now() - interval '60 days');
$$;

-- Counts for the picker. Null for anyone who isn't owner/manager.
create function public.promo_audience(p_salon uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then return null; end if;
  return jsonb_build_object(
    'all', public._promo_people(p_salon, 'all'),
    'lapsed', public._promo_people(p_salon, 'lapsed'),
    'saidNo', (select count(*) from public.clients where salon_id = p_salon and archived_at is null and coalesce(phone, '') <> '' and not texts_ok));
end $$;

-- p: { id, message, audience }. Returns { people, parts, texts, cents, balanceCents }.
create function public.promo_send(p_salon uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := (p->>'id')::uuid; msg text := btrim(coalesce(p->>'message', '')); aud text := coalesce(p->>'audience', 'all');
  ppl int; parts int; bal bigint; r public.promo_sends;
begin
  if not public.is_admin(p_salon) then raise exception 'owner or manager only'; end if;
  select * into r from public.promo_sends where id = sid;
  if found then
    return jsonb_build_object('people', r.people, 'parts', r.parts, 'texts', r.texts, 'cents', r.cents, 'balanceCents', public._text_credit_balance(p_salon));
  end if;
  if msg = '' then raise exception 'write a message first'; end if;
  if char_length(msg) > 480 then raise exception 'message is too long (480 letters max)'; end if;
  if aud not in ('all', 'lapsed') then raise exception 'pick who gets it'; end if;
  ppl := public._promo_people(p_salon, aud);
  if ppl = 0 then raise exception 'no clients to send to'; end if;
  parts := public._text_parts(msg);
  bal := public._text_credit_spend(p_salon, ppl * parts, left(msg, 40), public.my_person_id(), 'promo:' || sid::text);
  insert into public.promo_sends (id, salon_id, message, audience, people, parts, texts, cents, person_id)
  values (sid, p_salon, msg, aud, ppl, parts, ppl * parts, ppl * parts * 2, public.my_person_id());
  return jsonb_build_object('people', ppl, 'parts', parts, 'texts', ppl * parts, 'cents', ppl * parts * 2, 'balanceCents', bal);
end $$;

revoke execute on function public._promo_people(uuid, text) from public, anon, authenticated;
revoke execute on function public.promo_audience(uuid) from public, anon;
revoke execute on function public.promo_send(uuid, jsonb) from public, anon;
grant execute on function public.promo_audience(uuid) to authenticated;
grant execute on function public.promo_send(uuid, jsonb) to authenticated;
