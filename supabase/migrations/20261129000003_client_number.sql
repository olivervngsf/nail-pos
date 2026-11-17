-- Client number (Oliver, Nov 17): a short number per salon staff can say out loud ("client #412"), for clients with
-- no phone or the same name. 1, 2, 3… in the order clients were added; never reused. Search "#412" (or just 412).

alter table public.clients add column number int;

-- Existing clients: number them by when they were added, per salon.
update public.clients c set number = n.rn
from (select id, row_number() over (partition by salon_id order by created_at, id) as rn from public.clients) n
where n.id = c.id;

create table public.client_counters (salon_id uuid primary key references public.salons(id), last int not null default 0);
alter table public.client_counters enable row level security;  -- server-only (written by the trigger below)
insert into public.client_counters (salon_id, last)
select salon_id, max(number) from public.clients group by salon_id;

create function public._client_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_counters (salon_id, last) values (new.salon_id, 1)
  on conflict (salon_id) do update set last = public.client_counters.last + 1
  returning last into new.number;
  return new;
end $$;
revoke execute on function public._client_number() from public, anon, authenticated;
create trigger client_number before insert on public.clients for each row when (new.number is null) execute function public._client_number();

alter table public.clients alter column number set not null;
alter table public.clients add constraint clients_salon_number unique (salon_id, number);

-- ---------- list: + number; "#412" or a short number finds that client ----------
create or replace function public.client_list(p_salon uuid, p_filter text default 'all', p_q text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ms timestamptz; q text := lower(trim(coalesce(p_q, ''))); digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  num int := case when trim(coalesce(p_q, '')) ~ '^#?\d{1,6}$' then regexp_replace(p_q, '\D', '', 'g')::int end; out jsonb;
begin
  if not public.is_member(p_salon) then raise exception 'not allowed'; end if;
  select date_trunc('month', now() at time zone time_zone) at time zone time_zone into ms from public.salons where id = p_salon;
  with f as (
    select c.id, c.number, c.name, c.phone, c.birthday, c.created_at, c.care, x.*,
      public._client_tag(x.visits, x.last_visit, x.gap_days, x.first_visit, c.created_at, ms) as tag
    from public.clients c join public._client_facts(p_salon) x on x.client_id = c.id
  ), s as (
    select * from f where (q = '' or lower(name) like '%' || q || '%' or number = num
      or (left(trim(p_q), 1) <> '#' and length(digits) >= 3 and regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || digits || '%'))
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'all', (select count(*) from f), 'regular', (select count(*) from f where tag in ('regular', 'lost')), 'lost', (select count(*) from f where tag = 'lost'),
      'new', (select count(*) from f where tag = 'new'),
      'bday', (select count(*) from f where extract(month from birthday) = extract(month from now() at time zone 'UTC')),
      'gift', (select count(*) from f where gift_cents > 0)),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'name', name, 'phone', phone, 'tag', tag, 'visits', visits, 'last_visit', last_visit,
        'usual_service', usual_service, 'usual_staff', usual_staff_name, 'gap_days', gap_days, 'care', care <> '', 'gift_cents', gift_cents)
        order by case when number = num then 0 else 1 end, case when p_filter = 'lost' then extract(epoch from now() - last_visit) end desc nulls last, last_visit desc nulls last, name)
      from (select * from s where case p_filter
          when 'regular' then tag in ('regular', 'lost') when 'lost' then tag = 'lost' when 'new' then tag = 'new'
          when 'bday' then extract(month from birthday) = extract(month from now() at time zone 'UTC')
          when 'gift' then gift_cents > 0 else true end
        order by last_visit desc nulls last limit 300) r), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- ---------- profile: + number ----------
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
    'id', c.id, 'number', c.number, 'name', c.name, 'phone', c.phone, 'email', c.email, 'language', c.language, 'texts_ok', c.texts_ok,
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
