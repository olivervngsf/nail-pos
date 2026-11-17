-- Session 3 extras on top of card payments:
-- 1) Daily card money per salon (owner/manager): what we recorded vs Stripe's payout = "zero surprises".
-- 2) Fee filled in later when Stripe's balance transaction wasn't ready at payment time.
-- 3) Refunds done in the Stripe dashboard (not from our app) are recorded too (full or part).
-- 4) $1 setup test log is just audit_log ('setup.test_dollar'); no table needed.

create function public.card_day_totals(p_salon uuid, p_day date)
returns table (payments int, gross_cents bigint, tips_cents bigint, fees_cents bigint, refunded_cents bigint, net_cents bigint)
language sql stable security definer set search_path = '' as $$
  select count(*)::int, coalesce(sum(p.amount_cents), 0)::bigint, coalesce(sum(p.tip_cents), 0)::bigint, coalesce(sum(p.fee_cents), 0)::bigint,
    coalesce(sum(p.refunded_cents), 0)::bigint, coalesce(sum(p.amount_cents - p.fee_cents - p.refunded_cents), 0)::bigint
  from public.payments p join public.salons s on s.id = p.salon_id
  where p.salon_id = p_salon and p.method in ('card_reader', 'pay_link')
    and (p.at at time zone s.time_zone)::date = p_day and public.is_admin(p_salon);
$$;

create function public.stripe_set_fee(p_intent text, p_fee bigint) returns void
language sql security definer set search_path = '' as $$
  update public.payments set fee_cents = p_fee where stripe_payment_intent = p_intent and fee_cents = 0 and p_fee > 0;
$$;

-- Stripe says this payment intent now has p_refunded cents refunded in total. Never lowers; full = ticket refunded.
create function public.stripe_refund_seen(p_intent text, p_refund text, p_refunded bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pay public.payments; add bigint;
begin
  select * into pay from public.payments where stripe_payment_intent = p_intent for update;
  if pay.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  add := least(p_refunded, pay.amount_cents) - pay.refunded_cents;
  if add <= 0 then return jsonb_build_object('ok', true, 'already', true); end if;
  insert into public.refunds (salon_id, ticket_id, payment_id, amount_cents, reason, stripe_refund_id)
  values (pay.salon_id, pay.ticket_id, pay.id, add, 'Refunded in Stripe', p_refund)
  on conflict (stripe_refund_id) do nothing;
  update public.payments set refunded_cents = refunded_cents + add,
    status = case when refunded_cents + add >= amount_cents then 'refunded' else status end where id = pay.id;
  if pay.refunded_cents + add >= pay.amount_cents then
    update public.tickets set status = 'refunded', updated_at = now() where id = pay.ticket_id and status = 'paid';
  end if;
  insert into public.audit_log (salon_id, action, detail)
  values (pay.salon_id, 'ticket.refunded', jsonb_build_object('ticket', pay.ticket_id, 'amount_cents', add, 'source', 'stripe'));
  return jsonb_build_object('ok', true, 'refunded_cents', pay.refunded_cents + add);
end $$;

revoke execute on function public.stripe_set_fee(text, bigint), public.stripe_refund_seen(text, text, bigint) from public, anon, authenticated;
grant execute on function public.stripe_set_fee(text, bigint), public.stripe_refund_seen(text, text, bigint) to service_role;
revoke execute on function public.card_day_totals(uuid, date) from public, anon;
grant execute on function public.card_day_totals(uuid, date) to authenticated;
