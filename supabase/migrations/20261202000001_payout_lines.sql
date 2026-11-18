-- Earnings slips can list every ticket (Nov 17): per person, each paid ticket in the period with its services and tips.
-- payout_sheet / my_earnings / pin_earnings now add `lines` to each person's row; same walls as before.

create or replace function public._payout_lines(p_salon uuid, p_from date, p_to date, p_only uuid)
returns table (membership_id uuid, lines jsonb)
language sql stable set search_path = '' as $$
  with b as (select public._day_lo(p_salon, p_from) lo, public._day_lo(p_salon, p_to + 1) hi),
  l as (
    select l.staff_id, t.id tid, t.number, t.paid_at,
      string_agg(l.name, ' + ' order by l.sort) filter (where l.kind = 'service') svc,
      coalesce(sum(l.amount_cents) filter (where l.kind = 'service'), 0)::bigint svc_cents,
      coalesce(sum(l.amount_cents) filter (where l.kind = 'tip' and l.name = 'Card tip'), 0)::bigint tip_card,
      coalesce(sum(l.amount_cents) filter (where l.kind = 'tip' and l.name <> 'Card tip'), 0)::bigint tip_cash
    from public.ticket_lines l join public.tickets t on t.id = l.ticket_id, b
    where t.salon_id = p_salon and t.status = 'paid' and t.paid_at >= b.lo and t.paid_at < b.hi
      and l.kind in ('service', 'tip') and l.removed_at is null and l.staff_id is not null
      and (p_only is null or l.staff_id = p_only)
    group by l.staff_id, t.id, t.number, t.paid_at)
  select staff_id, jsonb_agg(jsonb_build_object('number', number, 'at', paid_at, 'services', coalesce(svc, ''),
    'services_cents', svc_cents, 'tip_card_cents', tip_card, 'tip_cash_cents', tip_cash) order by paid_at)
  from l group by staff_id $$;

create or replace function public.payout_sheet(p_salon uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'pick up to 2 months'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('lines', coalesce(pl.lines, '[]')))
    from public._payout(p_salon, p_from, p_to, null) x
    left join public._payout_lines(p_salon, p_from, p_to, null) pl on pl.membership_id = x.membership_id), '[]');
end $$;

create or replace function public.my_earnings(p_salon uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare mid uuid;
begin
  select m.id into mid from public.memberships m where m.salon_id = p_salon and m.person_id = public.my_person_id() and m.archived_at is null;
  if mid is null then raise exception 'not a member'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'pick up to 2 months'; end if;
  return (select to_jsonb(x) || jsonb_build_object('lines', coalesce((select pl.lines from public._payout_lines(p_salon, p_from, p_to, mid) pl), '[]'))
    from public._payout(p_salon, p_from, p_to, mid) x);
end $$;

create or replace function public.pin_earnings(p_device uuid, p_membership uuid, p_pin text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := public._check_pin(p_device, p_membership, p_pin); sid uuid;
begin
  if not (r->>'ok')::boolean then return r; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'pick up to 2 months'; end if;
  sid := (r->>'salon_id')::uuid;
  return r || jsonb_build_object('earnings', (select to_jsonb(x) || jsonb_build_object('lines',
    coalesce((select pl.lines from public._payout_lines(sid, p_from, p_to, p_membership) pl), '[]'))
    from public._payout(sid, p_from, p_to, p_membership) x));
end $$;

revoke execute on function public._payout_lines(uuid, date, date, uuid) from public, anon, authenticated;
