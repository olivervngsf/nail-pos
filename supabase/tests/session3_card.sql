-- Session 3 card payments in SQL: Stripe results only from the server, same payment twice = one payment,
-- card tip lines per staff, refund in Stripe (part, then full), fee filled later, daily card totals,
-- another salon sees nothing. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000cc01', '14085550301', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000cc03', '14085550303', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object(
  'salonId', '00000000-0000-0000-0000-0000000007a1', 'ownerName', 'Mai', 'salonName', 'Card Nails', 'state', 'CA', 'step', 9,
  'services', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007e1', 'cat', 'Gel', 'name', 'Gel mani', 'minutes', 45, 'priceCents', 3500, 'on', true),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007e2', 'cat', 'Pedi', 'name', 'Deluxe pedi', 'minutes', 60, 'priceCents', 5500, 'on', true)),
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000077f', 'name', 'Kim', 'phone', '+14085550302', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000078f', 'name', 'Anh', 'phone', '+14085550304', 'role', 'tech'))));
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000007b1', 'salonId', '00000000-0000-0000-0000-0000000007a1',
  'lines', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007c1', 'kind', 'service', 'serviceId', '00000000-0000-0000-0000-0000000007e1', 'staffId', '00000000-0000-0000-0000-00000000077f', 'name', 'Gel mani', 'minutes', 45, 'cents', 3500),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007c2', 'kind', 'service', 'serviceId', '00000000-0000-0000-0000-0000000007e2', 'staffId', '00000000-0000-0000-0000-00000000078f', 'name', 'Deluxe pedi', 'minutes', 60, 'cents', 5500))));
insert into t_out values ('info_no_stripe', (select to_jsonb(i) from public.pay_info('00000000-0000-0000-0000-0000000007b1') i));

-- desk can't fake Stripe
do $$ begin perform public.settle_card('{}'::jsonb); raise exception 'FAIL: desk settled a card'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.stripe_refund_seen('pi_x', 're_x', 1); raise exception 'FAIL: desk recorded a refund'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into public.stripe_accounts (salon_id, account_id, charges_enabled) values ('00000000-0000-0000-0000-0000000007a1', 'acct_fake', true);
  raise exception 'FAIL: desk wrote stripe_accounts'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end $$;

-- server: Stripe connected, reader, pay request; Stripe says paid $100 ($90 + $10 tip split 6.11/3.89), fee not ready yet
reset role;
insert into public.stripe_accounts (salon_id, account_id, charges_enabled) values ('00000000-0000-0000-0000-0000000007a1', 'acct_test1', true);
insert into public.card_readers (id, salon_id, label, simulated) values ('tmr_1', '00000000-0000-0000-0000-0000000007a1', 'Front desk', true);
insert into public.pay_requests (id, salon_id, ticket_id, method, amount_cents, reader_id)
  values ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', 'card_reader', 9000, 'tmr_1');
create temp table t_p as select jsonb_build_object('payRequestId', '00000000-0000-0000-0000-0000000007d1', 'paymentIntent', 'pi_2', 'amountCents', 10000, 'tipCents', 1000,
  'feeCents', 0, 'brand', 'visa', 'last4', '4242', 'tips', jsonb_build_array(
    jsonb_build_object('staffId', '00000000-0000-0000-0000-00000000078f', 'cents', 611), jsonb_build_object('staffId', '00000000-0000-0000-0000-00000000077f', 'cents', 389))) as p;
insert into t_out select 'paid', public.settle_card(p) from t_p;
insert into t_out select 'paid_again', public.settle_card(p) from t_p;   -- webhook + status check both arrive
select public.stripe_set_fee('pi_2', 275);
select public.stripe_set_fee('pi_2', 999);                                -- already set: unchanged
insert into t_out values ('ticket', (select to_jsonb(t) from public.tickets t where id = '00000000-0000-0000-0000-0000000007b1'));
insert into t_out values ('tips', (select jsonb_object_agg(m.display_name, l.amount_cents) from public.ticket_lines l join public.memberships m on m.id = l.staff_id
  where l.ticket_id = '00000000-0000-0000-0000-0000000007b1' and l.kind = 'tip'));
insert into t_out values ('pays', (select to_jsonb(count(*)) from public.payments where ticket_id = '00000000-0000-0000-0000-0000000007b1'));

-- owner: daily card totals, sees events; stranger sees nothing
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc01","role":"authenticated"}', true);
insert into t_out values ('day', (select to_jsonb(d) from public.card_day_totals('00000000-0000-0000-0000-0000000007a1',
  (now() at time zone (select time_zone from public.salons where id = '00000000-0000-0000-0000-0000000007a1'))::date) d));
insert into t_out values ('setup', public.salon_pay_setup('00000000-0000-0000-0000-0000000007a1'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc03","role":"authenticated"}', true);
insert into t_out values ('stranger', (select to_jsonb((select count(*) from public.stripe_accounts) + (select count(*) from public.card_readers) + (select count(*) from public.pay_requests))));
insert into t_out values ('stranger_day', (select to_jsonb(count(*)) from public.card_day_totals('00000000-0000-0000-0000-0000000007a1', current_date) d where d.payments > 0));

-- refunds made in the Stripe dashboard: $40, same again (replay), then the rest
reset role;
insert into t_out values ('r1', public.stripe_refund_seen('pi_2', 're_1', 4000));
insert into t_out values ('r1_again', public.stripe_refund_seen('pi_2', 're_1', 4000));
insert into t_out values ('after_part', (select to_jsonb(status) from public.tickets where id = '00000000-0000-0000-0000-0000000007b1'));
insert into t_out values ('r2', public.stripe_refund_seen('pi_2', 're_2', 10000));
insert into t_out values ('after_full', (select jsonb_build_object('t', t.status, 'p', p.status, 'r', p.refunded_cents, 'n', (select count(*) from public.refunds where ticket_id = t.id))
  from public.tickets t join public.payments p on p.ticket_id = t.id where t.id = '00000000-0000-0000-0000-0000000007b1'));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if (o->'info_no_stripe'->>'charges_enabled')::boolean is not false or (o->'info_no_stripe'->>'due_cents')::int <> 9000 then raise exception 'FAIL pay_info: %', o->'info_no_stripe'; end if;
  if o->'paid'->>'status' <> 'paid' or (o->'paid_again'->>'already')::boolean is not true then raise exception 'FAIL settle: % %', o->'paid', o->'paid_again'; end if;
  if (o->>'pays')::int <> 1 then raise exception 'FAIL one payment: %', o->'pays'; end if;
  if o->'ticket'->>'status' <> 'paid' or (o->'ticket'->>'tip_cents')::int <> 1000 or (o->'ticket'->>'total_cents')::int <> 10000 then raise exception 'FAIL ticket: %', o->'ticket'; end if;
  if (o->'tips'->>'Anh')::int <> 611 or (o->'tips'->>'Kim')::int <> 389 then raise exception 'FAIL tips: %', o->'tips'; end if;
  if (o->'day'->>'payments')::int <> 1 or (o->'day'->>'fees_cents')::int <> 275 or (o->'day'->>'net_cents')::int <> 9725 then raise exception 'FAIL day: %', o->'day'; end if;
  if (o->'setup'->>'charges_enabled')::boolean is not true or jsonb_array_length(o->'setup'->'readers') <> 1 then raise exception 'FAIL setup: %', o->'setup'; end if;
  if (o->>'stranger')::int <> 0 or (o->>'stranger_day')::int <> 0 then raise exception 'FAIL salon wall'; end if;
  if (o->'r1_again'->>'already')::boolean is not true or o->>'after_part' <> 'paid' and o->'after_part' <> '"paid"'::jsonb then raise exception 'FAIL part refund: % %', o->'r1_again', o->'after_part'; end if;
  if o->'after_full'->>'t' <> 'refunded' or o->'after_full'->>'p' <> 'refunded' or (o->'after_full'->>'r')::int <> 10000 or (o->'after_full'->>'n')::int <> 2 then raise exception 'FAIL full refund: %', o->'after_full'; end if;
  raise notice 'PASS session3_card';
end $$;
rollback;
