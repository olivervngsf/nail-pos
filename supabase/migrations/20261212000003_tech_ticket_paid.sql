-- Tech slip page after the visit (Oliver, Nov 18): when the ticket is paid / refunded / voided the page is a read-only
-- view, so tech_ticket also returns when it was paid and THIS tech's own tip on it (cash, card, and the card fee on the
-- card tip when the salon passes it on, same math as _tips). Other techs' tips are never shown.
create or replace function public.tech_ticket(p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tickets; mid uuid; pass boolean; tip jsonb;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null or not public.is_member(t.salon_id) then raise exception 'not allowed'; end if;
  select m.id into mid from public.memberships m where m.salon_id = t.salon_id and m.person_id = public.my_person_id() and m.archived_at is null;
  select tip_fee_passthrough into pass from public.salons where id = t.salon_id;
  select jsonb_build_object(
      'cash_cents', coalesce(sum(l.amount_cents) filter (where l.name <> 'Card tip'), 0),
      'card_cents', coalesce(sum(l.amount_cents) filter (where l.name = 'Card tip'), 0),
      'fee_cents', coalesce(sum(case when l.name = 'Card tip' and pass then
        coalesce((select round(p.fee_cents::numeric * l.amount_cents / nullif(p.amount_cents, 0))::bigint from public.payments p
                  where p.ticket_id = t.id and p.method in ('card_reader', 'pay_link') and p.status = 'paid' order by p.at desc limit 1), 0)
        else 0 end), 0))
    into tip
  from public.ticket_lines l where l.ticket_id = t.id and l.kind = 'tip' and l.removed_at is null and l.staff_id = mid;
  return jsonb_build_object(
    'id', t.id, 'number', t.number, 'status', t.status, 'salon_id', t.salon_id, 'me', mid, 'paid_at', t.paid_at,
    'salon', (select name from public.salons where id = t.salon_id),
    'client', (select split_part(c.name, ' ', 1) from public.clients c where c.id = t.client_id),
    'my_tip', case when t.status = 'open' then null else tip end,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'cents', l.amount_cents, 'staff_id', l.staff_id,
        'staff', (select display_name from public.memberships where id = l.staff_id)) order by l.sort)
      from public.ticket_lines l where l.ticket_id = t.id and l.kind = 'service' and l.removed_at is null), '[]'::jsonb));
end $$;
