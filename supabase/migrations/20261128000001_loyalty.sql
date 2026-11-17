-- Session 10 (M12): loyalty points + client page. V1 = points (or punch card) tied to the phone number; packages, perks and
-- referrals come later. Points are written in one place only (_loyalty_on_ticket, when a ticket becomes paid) and reversed on
-- refund; nothing edits old rows. A reward is its own ticket line (loyalty_reward), used only when the client says yes, and it
-- comes off the salon's share (techs are paid on the full service price). Client page = one-time text code, no app.
-- save_ticket is re-made here with the loyalty_reward line, and it brings back the ticket-slip "seen" rule that got lost.

create table public.loyalty_settings (
  salon_id uuid primary key references public.salons(id),
  on_ boolean not null default false,
  kind text not null default 'points' check (kind in ('points', 'visits')),   -- points per $1, or a punch card (per visit)
  points_per_dollar int not null default 1 check (points_per_dollar between 1 and 10),
  reward_points int not null default 100 check (reward_points between 1 and 10000),  -- visits: every Nth visit
  reward_cents bigint not null default 1000 check (reward_cents between 100 and 50000),
  updated_at timestamptz not null default now()
);
create table public.loyalty_ledger (
  id bigserial primary key,
  salon_id uuid not null references public.salons(id),
  client_id uuid not null references public.clients(id),
  ticket_id uuid references public.tickets(id),
  change int not null,
  reason text not null check (reason in ('earn', 'redeem', 'refund', 'adjust')),
  at timestamptz not null default now()
);
create index on public.loyalty_ledger (client_id);
create index on public.loyalty_ledger (ticket_id);
alter table public.loyalty_settings enable row level security;
alter table public.loyalty_ledger enable row level security;
create policy "members read" on public.loyalty_settings for select to authenticated using (public.is_member(salon_id));
create policy "members read" on public.loyalty_ledger for select to authenticated using (public.is_member(salon_id));
-- Ledger: only the functions below write it.

alter table public.ticket_lines drop constraint ticket_lines_kind_check;
alter table public.ticket_lines add constraint ticket_lines_kind_check check (kind in ('service', 'discount', 'tip', 'gift_sale', 'loyalty_reward'));

create function public._client_points(p_client uuid) returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum(change), 0)::int from public.loyalty_ledger where client_id = p_client;
$$;

-- The one writer: paid → earn (+ redeem a reward line); paid → refunded → reverse that ticket's rows.
create function public._loyalty_on_ticket() returns trigger language plpgsql security definer set search_path = '' as $$
declare ly public.loyalty_settings; base bigint; pts int; used int;
begin
  if new.client_id is null then return new; end if;
  if old.status = 'open' and new.status = 'paid' then
    if exists (select 1 from public.loyalty_ledger where ticket_id = new.id) then return new; end if;
    select * into ly from public.loyalty_settings where salon_id = new.salon_id;
    used := (select count(*) from public.ticket_lines where ticket_id = new.id and removed_at is null and kind = 'loyalty_reward');
    if used > 0 then
      insert into public.loyalty_ledger (salon_id, client_id, ticket_id, change, reason) values (new.salon_id, new.client_id, new.id, -ly.reward_points, 'redeem');
    end if;
    if ly.salon_id is null or not ly.on_ then return new; end if;
    -- Earn on what the client paid for services (after discounts + reward). Never on tips or gift card sales.
    select coalesce(sum(amount_cents), 0) into base from public.ticket_lines
      where ticket_id = new.id and removed_at is null and kind in ('service', 'discount', 'loyalty_reward');
    pts := case when ly.kind = 'visits' then 1 else greatest(0, floor(base / 100.0 * ly.points_per_dollar))::int end;
    if pts > 0 then
      insert into public.loyalty_ledger (salon_id, client_id, ticket_id, change, reason) values (new.salon_id, new.client_id, new.id, pts, 'earn');
    end if;
  elsif old.status = 'paid' and new.status = 'refunded' then
    if exists (select 1 from public.loyalty_ledger where ticket_id = new.id and reason = 'refund') then return new; end if;
    insert into public.loyalty_ledger (salon_id, client_id, ticket_id, change, reason)
    select new.salon_id, new.client_id, new.id, -sum(change), 'refund' from public.loyalty_ledger
    where ticket_id = new.id and reason in ('earn', 'redeem') having sum(change) <> 0;
  end if;
  return new;
end $$;
create trigger loyalty_on_ticket after update of status on public.tickets for each row execute function public._loyalty_on_ticket();

create or replace function public.save_ticket(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid := (p->>'id')::uuid;
  sid uuid := (p->>'salonId')::uuid;
  t public.tickets;
  cid uuid;
  ln jsonb; i int := 0; keep uuid[] := '{}';
  sub bigint; disc bigint; tip bigint; gift bigint; total bigint; given bigint; left_due bigint;
  gc public.gift_cards; gs jsonb; ly public.loyalty_settings; rewards int := 0;
begin
  if tid is null or sid is null then raise exception 'ticket id and salon required'; end if;
  if not public._is_desk(sid) then raise exception 'not allowed'; end if;

  select * into t from public.tickets where id = tid for update;
  if t.id is not null and t.salon_id <> sid then raise exception 'not allowed'; end if;
  if t.id is not null and t.status <> 'open' then
    return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status);
  end if;
  select gift_settings into gs from public.salons where id = sid;
  select * into ly from public.loyalty_settings where salon_id = sid;

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
    if ln->>'kind' not in ('service', 'discount', 'tip', 'gift_sale', 'loyalty_reward') then raise exception 'bad line'; end if;
    if ln->>'kind' = 'loyalty_reward' then
      -- A loyalty reward: the client asked to use it. Exactly the salon's reward, once per ticket, only with enough points.
      rewards := rewards + 1;
      if ly.salon_id is null or not ly.on_ then raise exception 'loyalty is off'; end if;
      if cid is null then raise exception 'a reward needs the client''s phone'; end if;
      if rewards > 1 then raise exception 'one reward per visit'; end if;
      if (ln->>'cents')::bigint <> -ly.reward_cents then raise exception 'reward amount changed'; end if;
      if public._client_points(cid) < ly.reward_points then raise exception 'not enough points for a reward'; end if;
    end if;
    if ln->>'kind' = 'discount' then
      -- First use binds the OK to this ticket; later saves of the same ticket keep working (even after a long offline stretch).
      update public.discount_approvals set ticket_id = tid, used_at = coalesce(used_at, now())
      where id = (ln->>'approvalId')::uuid and salon_id = sid and purpose = 'discount'
        and (ticket_id = tid or (ticket_id is null and at > now() - interval '12 hours'));
      if not found then raise exception 'discount needs a manager PIN'; end if;
      if (ln->>'cents')::bigint > 0 then raise exception 'discount must take money off'; end if;
    elsif ln->>'kind' <> 'loyalty_reward' and (ln->>'cents')::bigint < 0 then raise exception 'amount can''t be below $0';
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
  -- Ticket slip: only remove lines this desk has seen (p.seen); lines a tech added from their phone since stay.
  -- (Brought back: the review-fixes version of save_ticket had dropped this rule.)
  update public.ticket_lines set removed_at = now() where ticket_id = tid and removed_at is null and not (id = any (keep)) and name <> 'Card tip'
    and (not (p ? 'seen') or id in (select (jsonb_array_elements_text(p->'seen'))::uuid));

  select coalesce(sum(amount_cents) filter (where kind = 'service'), 0),
         coalesce(-sum(amount_cents) filter (where kind in ('discount', 'loyalty_reward')), 0),
         coalesce(sum(amount_cents) filter (where kind = 'tip'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'gift_sale'), 0)
    into sub, disc, tip, gift from public.ticket_lines where ticket_id = tid and removed_at is null;
  disc := least(disc, sub);
  total := sub - disc + tip + gift;
  update public.tickets set subtotal_cents = sub, discount_cents = disc, tip_cents = tip, gift_cents = gift, total_cents = total where id = tid;

  -- What's owed changed while a card try waits: that try is no longer for this ticket.
  update public.pay_requests set status = 'canceled', error = 'ticket changed', updated_at = now()
  where ticket_id = tid and status = 'pending' and amount_cents <> public._card_due(tid);

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
    update public.pay_requests set status = 'canceled', error = 'paid another way', updated_at = now() where ticket_id = tid and status = 'pending';
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (sid, public.my_person_id(), 'ticket.paid', jsonb_build_object('ticket', tid, 'number', t.number, 'total_cents', total, 'method', 'cash'));
  end if;

  return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status, 'left_cents', public._ticket_left(tid));
end $$;

-- Owner numbers: a reward lowers sales like a discount.
create or replace function public.numbers_facts(p_salon uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tz text; ms timestamptz;
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_to <= p_from or p_to - p_from > interval '100 days' then raise exception 'range too long'; end if;
  select time_zone into tz from public.salons where id = p_salon;
  ms := date_trunc('month', now() at time zone tz) at time zone tz;
  return jsonb_build_object(
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name) order by m.display_name)
      from public.memberships m where m.salon_id = p_salon and m.archived_at is null), '[]'),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'paidAt', t.paid_at, 'client', t.client_id,
        'newClient', t.client_id is not null and not exists (select 1 from public.tickets o where o.client_id = t.client_id and o.status = 'paid' and o.paid_at < t.paid_at),
        'source', (select a.source from public.appointments a where a.client_id = t.client_id order by a.created_at limit 1),
        'sales', coalesce((select sum(l.amount_cents) from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind in ('service', 'discount', 'loyalty_reward')), 0),
        'tips', coalesce((select sum(l.amount_cents) from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind = 'tip'), 0),
        'giftSold', coalesce((select sum(l.amount_cents) from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind = 'gift_sale'), 0),
        'fees', coalesce((select sum(p.fee_cents) from public.payments p where p.ticket_id = t.id and p.status = 'paid'), 0),
        -- Booked their next visit the same day (before leaving).
        'rebooked', t.client_id is not null and exists (select 1 from public.appointments a where a.client_id = t.client_id and a.start_at > t.paid_at
          and a.status not in ('canceled', 'no_show', 'walked_out') and (a.created_at at time zone tz)::date = (t.paid_at at time zone tz)::date),
        'lines', coalesce((select jsonb_agg(jsonb_build_object('staff', l.staff_id, 'cents', l.amount_cents, 'kind', l.kind))
          from public.ticket_lines l where l.ticket_id = t.id and l.removed_at is null and l.kind in ('service', 'tip')), '[]')) order by t.paid_at)
      from public.tickets t where t.salon_id = p_salon and t.status = 'paid' and t.paid_at >= p_from and t.paid_at < p_to), '[]'),
    'walkins', coalesce((select jsonb_agg(jsonb_build_object('came', coalesce(a.arrived_at, a.start_at),
        'seatedAt', case when a.status in ('arrived', 'done') then a.start_at end, 'walkedOut', a.status = 'walked_out'))
      from public.appointments a where a.salon_id = p_salon and a.source in ('kiosk', 'walk_in')
        and coalesce(a.arrived_at, a.start_at) >= p_from and coalesce(a.arrived_at, a.start_at) < p_to), '[]'),
    -- Clock-in → next clock event (an open shift runs to now, at most 12 hours).
    'shifts', coalesce((select jsonb_agg(jsonb_build_object('staff', s.membership_id, 'from', s.at, 'to', s.until))
      from (select e.membership_id, e.at, e.kind,
              coalesce(case when lead(e.kind) over w = 'out' then lead(e.at) over w end,
                       least(now(), e.at + interval '12 hours', coalesce(lead(e.at) over w, 'infinity'))) as until
            from public.clock_events e where e.salon_id = p_salon and e.at >= p_from - interval '1 day' and e.at < p_to
            window w as (partition by e.membership_id order by e.at)) s
      where s.kind = 'in' and s.until > p_from), '[]'),
    'noShows', coalesce((select jsonb_agg(jsonb_build_object('at', a.start_at,
        'cents', coalesce((select sum((x->>'cents')::bigint) from jsonb_array_elements(a.services) x), 0)))
      from public.appointments a where a.salon_id = p_salon and a.status = 'no_show' and a.start_at >= p_from and a.start_at < p_to), '[]'),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('client', t.client_id, 'at', t.paid_at))
      from public.tickets t where t.salon_id = p_salon and t.status = 'paid' and t.client_id is not null
        and t.paid_at >= p_from - interval '84 days' and t.paid_at < p_to), '[]'),
    'giftUsed', coalesce((select jsonb_agg(jsonb_build_object('at', p.at, 'cents', p.amount_cents))
      from public.payments p where p.salon_id = p_salon and p.method = 'gift_card' and p.status = 'paid' and p.at >= p_from and p.at < p_to), '[]'),
    'lost', coalesce((select jsonb_agg(jsonb_build_object('name', c.name) order by f.last_visit)
      from public.clients c join public._client_facts(p_salon) f on f.client_id = c.id
      where c.archived_at is null and public._client_tag(f.visits, f.last_visit, f.gap_days, f.first_visit, c.created_at, ms) = 'lost'), '[]'));
end $$;

-- ---------- owner settings ----------
create function public.loyalty_settings_get(p_salon uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_member(p_salon) then jsonb_build_object(
    'on', coalesce(l.on_, false), 'kind', coalesce(l.kind, 'points'), 'pointsPerDollar', coalesce(l.points_per_dollar, 1),
    'rewardPoints', coalesce(l.reward_points, 100), 'rewardCents', coalesce(l.reward_cents, 1000),
    'members', (select count(distinct client_id) from public.loyalty_ledger where salon_id = p_salon and reason = 'earn' and at > now() - interval '30 days'),
    'ready', (select count(*) from (select client_id from public.loyalty_ledger where salon_id = p_salon group by client_id
                having sum(change) >= coalesce(l.reward_points, 100)) z),
    'redeemed30', (select count(*) from public.loyalty_ledger where salon_id = p_salon and reason = 'redeem' and at > now() - interval '30 days'))
  end from (select 1) one left join public.loyalty_settings l on l.salon_id = p_salon;
$$;

-- p: { on, kind, pointsPerDollar, rewardPoints, rewardCents }
create function public.loyalty_settings_save(p_salon uuid, p jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  insert into public.loyalty_settings (salon_id, on_, kind, points_per_dollar, reward_points, reward_cents)
  values (p_salon, coalesce((p->>'on')::boolean, false), coalesce(p->>'kind', 'points'), coalesce((p->>'pointsPerDollar')::int, 1),
          coalesce((p->>'rewardPoints')::int, 100), coalesce((p->>'rewardCents')::bigint, 1000))
  on conflict (salon_id) do update set on_ = excluded.on_, kind = excluded.kind, points_per_dollar = excluded.points_per_dollar,
    reward_points = excluded.reward_points, reward_cents = excluded.reward_cents, updated_at = now();
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, public.my_person_id(), 'loyalty.settings', p);
end $$;

-- ---------- checkout: client's points (desk) ----------
create function public.loyalty_for_client(p_salon uuid, p_phone text) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public._is_desk(p_salon) and l.on_ then jsonb_build_object(
    'clientId', c.id, 'points', public._client_points(c.id), 'kind', l.kind, 'pointsPerDollar', l.points_per_dollar, 'rewardPoints', l.reward_points, 'rewardCents', l.reward_cents,
    'ready', public._client_points(c.id) >= l.reward_points) end
  from public.loyalty_settings l join public.clients c on c.salon_id = l.salon_id and c.phone = p_phone
  where l.salon_id = p_salon;
$$;

-- Points on a receipt (server route + desk): what this ticket earned / used, and the balance after.
create function public.ticket_points(p_ticket uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('earned', coalesce(sum(change) filter (where reason = 'earn'), 0), 'used', coalesce(-sum(change) filter (where reason = 'redeem'), 0),
    'balance', public._client_points(t.client_id), 'kind', (select kind from public.loyalty_settings where salon_id = t.salon_id),
    'rewardPoints', (select reward_points from public.loyalty_settings where salon_id = t.salon_id),
    'rewardCents', (select reward_cents from public.loyalty_settings where salon_id = t.salon_id))
  from public.tickets t left join public.loyalty_ledger g on g.ticket_id = t.id
  where t.id = p_ticket and t.client_id is not null and (public._is_desk(t.salon_id) or coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb->>'role' = 'service_role')
  group by t.id, t.client_id, t.salon_id;
$$;

-- ---------- client page (/c/<salon>): the client signs in with a text code; their phone finds them ----------
create function public.client_page(p_slug text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.salons; ph text := public._auth_phone(); c public.clients; l public.loyalty_settings;
begin
  if ph is null then raise exception 'sign in with a phone number'; end if;
  select * into s from public.salons where slug = lower(p_slug) and archived_at is null;
  if s.id is null then return null; end if;
  select * into c from public.clients where salon_id = s.id and phone = ph and archived_at is null;
  select * into l from public.loyalty_settings where salon_id = s.id;
  return jsonb_build_object(
    'salon', jsonb_build_object('name', s.name, 'slug', s.slug, 'phone', s.phone),
    'first', split_part(coalesce(c.name, ''), ' ', 1), 'phoneLast4', right(ph, 4),
    'loyalty', case when coalesce(l.on_, false) then jsonb_build_object('kind', l.kind, 'points', coalesce(public._client_points(c.id), 0),
      'rewardPoints', l.reward_points, 'rewardCents', l.reward_cents,
      'today', coalesce((select sum(change) from public.loyalty_ledger where client_id = c.id and reason = 'earn' and at > now() - interval '18 hours'), 0)) end,
    'history', coalesce((select jsonb_agg(h order by (h->>'at') desc) from (
        select jsonb_build_object('at', g.at, 'change', g.change, 'reason', g.reason,
          'what', (select string_agg(x.name, ' + ' order by x.sort) from public.ticket_lines x where x.ticket_id = g.ticket_id and x.kind = 'service' and x.removed_at is null)) h
        from public.loyalty_ledger g where g.client_id = c.id order by g.at desc limit 20) z), '[]'),
    'cards', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'last4', g.last4, 'kind', g.kind, 'from', g.from_name,
        'mine', g.client_id = c.id, 'balance', public._gift_balance(g.id)) order by g.sold_at desc nulls last)
      from public.gift_cards g where g.salon_id = s.id and g.status in ('active', 'used_up') and (g.client_id = c.id or g.sent_to = ph)), '[]'));
end $$;

-- Add a gift card to my phone (plastic card or a code someone forwarded). 5 wrong codes = 15 min pause.
create function public.client_add_card(p_slug text, p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.salons; ph text := public._auth_phone(); me uuid; cid uuid; g public.gift_cards; fails int; r text;
begin
  if ph is null then raise exception 'sign in with a phone number'; end if;
  select * into s from public.salons where slug = lower(p_slug) and archived_at is null;
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  me := public._ensure_person(null);
  select count(*) into fails from public.gift_attempts where salon_id = s.id and person_id = me and not ok and at > now() - interval '15 minutes';
  if fails >= 5 then return jsonb_build_object('ok', false, 'reason', 'locked_out', 'triesLeft', 0); end if;
  if not public._gift_wellformed(p_code) then r := 'typo';
  else
    select * into g from public.gift_cards where code_hash = public._gift_hash(p_code);
    r := case when g.id is null then 'not_found' when g.salon_id <> s.id then 'other_salon' when g.status = 'in_stock' then 'not_sold'
      when g.status in ('locked', 'replaced', 'voided') then 'locked' end;
  end if;
  if r is null then
    insert into public.clients (salon_id, phone, name) values (s.id, ph, '') on conflict (salon_id, phone) do update set phone = excluded.phone returning id into cid;
    if g.client_id is not null and g.client_id <> cid then r := 'linked_other'; end if;
  end if;
  insert into public.gift_attempts (salon_id, person_id, ok) values (s.id, me, r is null);
  if r is not null then return jsonb_build_object('ok', false, 'reason', r, 'triesLeft', greatest(0, 4 - fails)); end if;
  update public.gift_cards set client_id = cid where id = g.id;
  insert into public.audit_log (salon_id, person_id, action, detail) values (s.id, me, 'gift.linked_by_client', jsonb_build_object('card', g.id, 'last4', g.last4));
  return jsonb_build_object('ok', true, 'card', jsonb_build_object('id', g.id, 'last4', g.last4, 'kind', g.kind, 'balance', public._gift_balance(g.id), 'mine', true));
end $$;

revoke execute on function public._client_points(uuid), public._loyalty_on_ticket() from public, anon, authenticated;
revoke execute on function public.loyalty_settings_get(uuid), public.loyalty_settings_save(uuid, jsonb), public.loyalty_for_client(uuid, text),
  public.ticket_points(uuid), public.client_page(text), public.client_add_card(text, text) from public, anon;
grant execute on function public.loyalty_settings_get(uuid), public.loyalty_settings_save(uuid, jsonb), public.loyalty_for_client(uuid, text),
  public.ticket_points(uuid), public.client_page(text), public.client_add_card(text, text) to authenticated;
grant execute on function public.ticket_points(uuid) to service_role;

-- New top-level pages can't be a salon's booking link.
create or replace function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $$
  select array['book', 'kiosk', 'setup', 'login', 'today', 'checkout', 'clients', 'calendar', 'settings', 'pay', 'join', 'api', 'admin', 'gift-cards', 'kit', 'paid',
    't', 'r', 'c', 'me', 'close-day', 'salon', 'demo', 'numbers', 'loyalty', 'payouts', 'help'];
$$;
