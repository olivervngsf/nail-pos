-- Clients v2 (design "Clients · 4 variations", version D, Nov 17).
-- Care note shows who wrote it + when, and any staff member (techs too) can set it.
-- Private note: owner + manager only (own table, so techs and front desk can't read it even through the API).
-- Editing a client's details stays as in 20261129000001_client_edit_ok (owner/manager OK). The care note now has its own
-- call so a tech can set it from their phone; the app sends care changes through client_set_care.
-- Owner / manager tapping "Show" on a phone number is written to the audit log.

alter table public.clients
  add column care_by uuid references public.memberships(id),
  add column care_at timestamptz;

create table public.client_private (
  client_id uuid primary key references public.clients(id),
  salon_id uuid not null references public.salons(id),
  body text not null default '' check (length(body) <= 1000),
  author uuid references public.memberships(id),
  at timestamptz not null default now()
);
create index on public.client_private (salon_id);
alter table public.client_private enable row level security;
create policy "admins read" on public.client_private for select to authenticated using (public.is_admin(salon_id));

-- ---------- care note: any staff member ----------
create function public.client_set_care(p_client uuid, p_care text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clients;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null or not public.is_member(c.salon_id) then raise exception 'not allowed'; end if;
  if length(coalesce(p_care, '')) > 500 then raise exception 'care note too long'; end if;
  update public.clients set care = trim(coalesce(p_care, '')), care_by = public._me_in(c.salon_id), care_at = now(), updated_at = now()
  where id = c.id;
end $$;

-- ---------- private note: owner + manager ----------
create function public.client_set_private(p_client uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clients;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null or not public.is_admin(c.salon_id) then raise exception 'not allowed'; end if;
  insert into public.client_private (client_id, salon_id, body, author, at)
  values (c.id, c.salon_id, trim(coalesce(p_body, '')), public._me_in(c.salon_id), now())
  on conflict (client_id) do update set body = excluded.body, author = excluded.author, at = excluded.at;
end $$;

-- ---------- owner / manager saw the full phone number ----------
create function public.client_phone_viewed(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clients;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null or not public.is_admin(c.salon_id) then raise exception 'not allowed'; end if;
  insert into public.audit_log (salon_id, person_id, action, detail)
  values (c.salon_id, public.my_person_id(), 'client.phone_viewed', jsonb_build_object('client', c.id));
end $$;

-- ---------- profile: + care author, points, private note (owner/manager only), can_edit ----------
create or replace function public.client_profile(p_client uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.clients; x record; ms timestamptz; adm boolean;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null or not public.is_member(c.salon_id) then raise exception 'not allowed'; end if;
  adm := public.is_admin(c.salon_id);
  select date_trunc('month', now() at time zone time_zone) at time zone time_zone into ms from public.salons where id = c.salon_id;
  select * into x from public._client_facts(c.salon_id) f where f.client_id = c.id;
  return jsonb_build_object(
    'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email, 'language', c.language, 'texts_ok', c.texts_ok,
    'birthday', c.birthday, 'since', coalesce(x.first_visit, c.created_at), 'notes', c.notes, 'care', c.care, 'shape', c.shape, 'colors', c.colors,
    'care_by', (select m.display_name from public.memberships m where m.id = c.care_by), 'care_at', c.care_at,
    'private_note', case when adm then coalesce((select jsonb_build_object('body', v.body, 'by', m.display_name, 'at', v.at)
        from public.client_private v left join public.memberships m on m.id = v.author where v.client_id = c.id and v.body <> ''), 'null'::jsonb) end,
    'can_edit', adm,
    'points', public._client_points(c.id),
    'usual_staff_id', c.usual_staff, 'usual_staff', x.usual_staff_name, 'usual_service', x.usual_service,
    'tag', public._client_tag(x.visits, x.last_visit, x.gap_days, x.first_visit, c.created_at, ms),
    'stats', jsonb_build_object('visits', x.visits, 'spent', x.spent, 'avg', case when x.visits > 0 then x.spent / x.visits else 0 end,
      'avg_tip', case when x.visits > 0 then x.tips / x.visits else 0 end, 'tips', x.tips, 'gap_days', x.gap_days, 'last_visit', x.last_visit),
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

revoke execute on function public.client_set_care(uuid, text), public.client_set_private(uuid, text), public.client_phone_viewed(uuid) from public, anon;
grant execute on function public.client_set_care(uuid, text), public.client_set_private(uuid, text), public.client_phone_viewed(uuid) to authenticated;
