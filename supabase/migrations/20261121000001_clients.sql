-- Session 5 (M6): clients + client history (Main Screens · Clients C1–C2, Client History H1–H2).
-- Find by phone or name; filters (regular, lost, new, birthday, gift card); profile with notes (allergy/care first),
-- gift cards, visits newest first with nail photos, the tech's note and how it was paid.
-- Staff (incl. techs on their phone) read the same profile; photos come from any staff phone.

-- ---------- client details ----------
alter table public.clients
  add column birthday date,                                   -- year may be 2000 when unknown; only month/day used
  add column usual_staff uuid references public.memberships(id),
  add column shape text not null default '',                  -- "Almond · short"
  add column colors text not null default '',                 -- "OPI Bubble Bath, nudes"
  add column care text not null default '',                   -- allergy / care: shown in red everywhere
  add column updated_at timestamptz not null default now();

-- Notes on a visit (the tech's note) or on the client. Never edited; a new note is a new row.
create table public.client_notes (
  id uuid primary key,
  salon_id uuid not null references public.salons(id),
  client_id uuid not null references public.clients(id),
  ticket_id uuid references public.tickets(id),
  author uuid references public.memberships(id),
  body text not null check (length(body) between 1 and 1000),
  at timestamptz not null default now()
);
create index on public.client_notes (client_id, at desc);

-- Nail photos (files in Storage bucket "client-photos" under <salon_id>/<client_id>/<id>.jpg).
create table public.client_photos (
  id uuid primary key,
  salon_id uuid not null references public.salons(id),
  client_id uuid not null references public.clients(id),
  ticket_id uuid references public.tickets(id),
  path text not null,
  taken_by uuid references public.memberships(id),
  at timestamptz not null default now(),
  removed_at timestamptz
);
create index on public.client_photos (client_id, at desc);

alter table public.client_notes enable row level security;
alter table public.client_photos enable row level security;
create policy "members read" on public.client_notes for select to authenticated using (public.is_member(salon_id));
create policy "members read" on public.client_photos for select to authenticated using (public.is_member(salon_id));

-- My membership in a salon (author of notes / photos).
create function public._me_in(p_salon uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.memberships m join public.people p on p.id = m.person_id
  where m.salon_id = p_salon and p.auth_user_id = (select auth.uid()) and m.archived_at is null limit 1;
$$;

-- ---------- facts per client (visits, spend, how often) ----------
create function public._client_facts(p_salon uuid)
returns table (client_id uuid, visits int, spent bigint, tips bigint, first_visit timestamptz, last_visit timestamptz, gap_days numeric,
               usual_service text, usual_staff_name text, gift_cents bigint)
language sql stable security definer set search_path = '' as $$
  with t as (
    select t.id, t.client_id, t.paid_at, t.subtotal_cents - t.discount_cents as svc, t.tip_cents
    from public.tickets t where t.salon_id = p_salon and t.status = 'paid' and t.client_id is not null
  ), agg as (
    select client_id, count(*)::int as visits, sum(svc)::bigint as spent, sum(tip_cents)::bigint as tips,
           min(paid_at) as first_visit, max(paid_at) as last_visit,
           case when count(*) > 1 then extract(epoch from max(paid_at) - min(paid_at)) / 86400 / (count(*) - 1) end as gap_days
    from t group by client_id
  )
  select c.id, coalesce(a.visits, 0), coalesce(a.spent, 0), coalesce(a.tips, 0), a.first_visit, a.last_visit, round(a.gap_days, 1),
    (select l.name from public.ticket_lines l join t on t.id = l.ticket_id
       where t.client_id = c.id and l.kind = 'service' and l.removed_at is null group by l.name order by count(*) desc, max(t.paid_at) desc limit 1),
    coalesce((select m.display_name from public.memberships m where m.id = c.usual_staff),
      (select m.display_name from public.ticket_lines l join t on t.id = l.ticket_id join public.memberships m on m.id = l.staff_id
         where t.client_id = c.id and l.kind = 'service' and l.removed_at is null group by m.display_name order by count(*) desc limit 1)),
    (select coalesce(sum(x.change_cents), 0)::bigint from public.gift_card_ledger x join public.gift_cards g on g.id = x.card_id
       where g.client_id = c.id and g.status = 'active')
  from public.clients c left join agg a on a.client_id = c.id
  where c.salon_id = p_salon and c.archived_at is null;
$$;

-- Regular = 3+ visits. Lost = a regular not seen for 45+ days and 1.5× their usual gap. New = first visit (or added) this month.
create function public._client_tag(visits int, last_visit timestamptz, gap_days numeric, first_visit timestamptz, created timestamptz, month_start timestamptz)
returns text language sql immutable set search_path = '' as $$
  select case
    when visits >= 3 and last_visit < now() - make_interval(days => greatest(45, ceil(coalesce(gap_days, 30) * 1.5)::int)) then 'lost'
    when visits >= 3 then 'regular'
    when coalesce(first_visit, created) >= month_start then 'new'
    else null end;
$$;

-- ---------- list (desk, owner; techs search by phone) ----------
-- p_filter: all | regular | lost | new | bday | gift. p_q: phone digits or name. Returns {counts, rows}.
create function public.client_list(p_salon uuid, p_filter text default 'all', p_q text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ms timestamptz; q text := lower(trim(coalesce(p_q, ''))); digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g'); out jsonb;
begin
  if not public.is_member(p_salon) then raise exception 'not allowed'; end if;
  select date_trunc('month', now() at time zone time_zone) at time zone time_zone into ms from public.salons where id = p_salon;
  with f as (
    select c.id, c.name, c.phone, c.birthday, c.created_at, c.care, x.*,
      public._client_tag(x.visits, x.last_visit, x.gap_days, x.first_visit, c.created_at, ms) as tag
    from public.clients c join public._client_facts(p_salon) x on x.client_id = c.id
  ), s as (
    select * from f where (q = '' or lower(name) like '%' || q || '%' or (length(digits) >= 3 and regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || digits || '%'))
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'all', (select count(*) from f), 'regular', (select count(*) from f where tag in ('regular', 'lost')), 'lost', (select count(*) from f where tag = 'lost'),
      'new', (select count(*) from f where tag = 'new'),
      'bday', (select count(*) from f where extract(month from birthday) = extract(month from now() at time zone 'UTC')),
      'gift', (select count(*) from f where gift_cents > 0)),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'tag', tag, 'visits', visits, 'last_visit', last_visit,
        'usual_service', usual_service, 'usual_staff', usual_staff_name, 'gap_days', gap_days, 'care', care <> '', 'gift_cents', gift_cents)
        order by case when p_filter = 'lost' then extract(epoch from now() - last_visit) end desc nulls last, last_visit desc nulls last, name)
      from (select * from s where case p_filter
          when 'regular' then tag in ('regular', 'lost') when 'lost' then tag = 'lost' when 'new' then tag = 'new'
          when 'bday' then extract(month from birthday) = extract(month from now() at time zone 'UTC')
          when 'gift' then gift_cents > 0 else true end
        order by last_visit desc nulls last limit 300) r), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- ---------- one client: profile + visits ----------
create function public.client_profile(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.clients; x record; ms timestamptz;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null or not public.is_member(c.salon_id) then raise exception 'not allowed'; end if;
  select date_trunc('month', now() at time zone time_zone) at time zone time_zone into ms from public.salons where id = c.salon_id;
  select * into x from public._client_facts(c.salon_id) f where f.client_id = c.id;
  return jsonb_build_object(
    'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email, 'language', c.language, 'texts_ok', c.texts_ok,
    'birthday', c.birthday, 'since', coalesce(x.first_visit, c.created_at), 'notes', c.notes, 'care', c.care, 'shape', c.shape, 'colors', c.colors,
    'usual_staff_id', c.usual_staff, 'usual_staff', x.usual_staff_name, 'usual_service', x.usual_service,
    'tag', public._client_tag(x.visits, x.last_visit, x.gap_days, x.first_visit, c.created_at, ms),
    'stats', jsonb_build_object('visits', x.visits, 'spent', x.spent, 'avg', case when x.visits > 0 then x.spent / x.visits else 0 end,
      'avg_tip', case when x.visits > 0 then x.tips / x.visits else 0 end, 'gap_days', x.gap_days, 'last_visit', x.last_visit),
    'gift_cards', coalesce((select jsonb_agg(jsonb_build_object('last4', g.last4, 'balance_cents', public._gift_balance(g.id), 'sold_at', g.sold_at) order by g.sold_at desc)
      from public.gift_cards g where g.client_id = c.id and g.status = 'active'), '[]'::jsonb),
    'notes_log', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'ticket_id', n.ticket_id, 'by', m.display_name, 'at', n.at) order by n.at desc)
      from public.client_notes n left join public.memberships m on m.id = n.author where n.client_id = c.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'ticket_id', p.ticket_id, 'at', p.at, 'by', m.display_name) order by p.at desc)
      from public.client_photos p left join public.memberships m on m.id = p.taken_by where p.client_id = c.id and p.removed_at is null), '[]'::jsonb),
    'visits', coalesce((select jsonb_agg(v order by v->>'at' desc) from (
      select jsonb_build_object('ticket_id', t.id, 'number', t.number, 'at', t.paid_at, 'status', t.status,
        'services', (select jsonb_agg(jsonb_build_object('name', l.name, 'cents', l.amount_cents, 'minutes', l.minutes, 'staff', m.display_name) order by l.sort)
                     from public.ticket_lines l left join public.memberships m on m.id = l.staff_id where l.ticket_id = t.id and l.kind = 'service' and l.removed_at is null),
        'subtotal', t.subtotal_cents, 'discount', t.discount_cents, 'tip', t.tip_cents, 'total', t.total_cents,
        'payments', (select jsonb_agg(jsonb_build_object('method', p.method, 'cents', p.amount_cents, 'fee', p.fee_cents, 'brand', p.card_brand, 'last4', p.card_last4))
                     from public.payments p where p.ticket_id = t.id and p.status in ('paid', 'refunded'))) as v
      from public.tickets t where t.client_id = c.id and t.status in ('paid', 'refunded') order by t.paid_at desc limit 100) z), '[]'::jsonb)
  );
end $$;

-- ---------- save / add ----------
-- p: {id?, salonId, name, phone, email?, birthday? (YYYY-MM-DD), shape?, colors?, care?, notes?, usualStaff?, textsOk?, language?}
create function public.client_save(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid := (p->>'salonId')::uuid; cid uuid := (p->>'id')::uuid;
begin
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;
  if cid is null then
    if coalesce(trim(p->>'name'), '') = '' and coalesce(p->>'phone', '') = '' then raise exception 'name or phone needed'; end if;
    insert into public.clients (salon_id, phone, name) values (sid, nullif(p->>'phone', ''), coalesce(trim(p->>'name'), ''))
    on conflict (salon_id, phone) do update set name = coalesce(nullif(excluded.name, ''), public.clients.name)
    returning id into cid;
  elsif not exists (select 1 from public.clients where id = cid and salon_id = sid) then raise exception 'not allowed';
  end if;
  update public.clients set
    name = coalesce(nullif(trim(p->>'name'), ''), name), phone = coalesce(nullif(p->>'phone', ''), phone), email = nullif(coalesce(p->>'email', email), ''),
    birthday = case when p ? 'birthday' then nullif(p->>'birthday', '')::date else birthday end,
    shape = coalesce(p->>'shape', shape), colors = coalesce(p->>'colors', colors), care = coalesce(p->>'care', care), notes = coalesce(p->>'notes', notes),
    usual_staff = case when p ? 'usualStaff' then public._salon_member(sid, nullif(p->>'usualStaff', '')::uuid) else usual_staff end,
    texts_ok = coalesce((p->>'textsOk')::boolean, texts_ok), language = coalesce(nullif(p->>'language', ''), language), updated_at = now()
  where id = cid;
  return cid;
end $$;

-- Any staff member (techs too) adds a note, on a visit or the client. Same id twice = once (offline retry).
create function public.client_add_note(p_id uuid, p_client uuid, p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clients;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null or not public.is_member(c.salon_id) then raise exception 'not allowed'; end if;
  insert into public.client_notes (id, salon_id, client_id, ticket_id, author, body)
  values (p_id, c.salon_id, c.id, (select id from public.tickets where id = p_ticket and client_id = c.id), public._me_in(c.salon_id), trim(p_body))
  on conflict (id) do nothing;
end $$;

-- A photo was uploaded to Storage at <salon>/<client>/<id>.jpg: record it.
create function public.client_add_photo(p_id uuid, p_client uuid, p_ticket uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clients;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null or not public.is_member(c.salon_id) then raise exception 'not allowed'; end if;
  if p_path not like c.salon_id::text || '/' || c.id::text || '/%' then raise exception 'bad photo path'; end if;
  insert into public.client_photos (id, salon_id, client_id, ticket_id, path, taken_by)
  values (p_id, c.salon_id, c.id, (select id from public.tickets where id = p_ticket and client_id = c.id), p_path, public._me_in(c.salon_id))
  on conflict (id) do nothing;
end $$;

-- Desk / owner removes a photo (kept in history, hidden).
create function public.client_remove_photo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ph public.client_photos;
begin
  select * into ph from public.client_photos where id = p_id;
  if ph.id is null or not public._is_desk(ph.salon_id) then raise exception 'not allowed'; end if;
  update public.client_photos set removed_at = now() where id = p_id;
end $$;

revoke execute on function public._me_in(uuid), public._client_facts(uuid) from public, anon, authenticated;
revoke execute on function public.client_list(uuid, text, text), public.client_profile(uuid), public.client_save(jsonb),
  public.client_add_note(uuid, uuid, uuid, text), public.client_add_photo(uuid, uuid, uuid, text), public.client_remove_photo(uuid) from public, anon;
grant execute on function public.client_list(uuid, text, text), public.client_profile(uuid), public.client_save(jsonb),
  public.client_add_note(uuid, uuid, uuid, text), public.client_add_photo(uuid, uuid, uuid, text), public.client_remove_photo(uuid) to authenticated;

-- ---------- photo files (Supabase Storage; skipped where Storage isn't installed, e.g. local test DB) ----------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('client-photos', 'client-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy "salon staff upload client photos" on storage.objects for insert to authenticated
      with check (bucket_id = 'client-photos' and public.is_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "salon staff see client photos" on storage.objects for select to authenticated
      using (bucket_id = 'client-photos' and public.is_member(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;
