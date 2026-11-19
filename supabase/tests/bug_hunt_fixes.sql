-- Bug hunt fixes (Nov 18): a card payment on a ticket with a loyalty reward is marked paid for the right amount
-- (and a card tip with no tech on the ticket still shows in the total); a ticket that sold a gift card can't be
-- refunded once part of the card was spent; no cash "change" from an over-paying gift card; an invite can't point
-- at another salon's staff; the same clock in twice = one. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000bb01', '14085557001', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000bb02', '14085557002', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000060a1', 'ownerName', 'Mai', 'salonName', 'Fix Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000607a', 'name', 'Kim', 'phone', '+14085557003', 'role', 'tech'))));
select public.loyalty_settings_save('00000000-0000-0000-0000-0000000060a1', '{"on": true, "kind": "points", "pointsPerDollar": 1, "rewardPoints": 100, "rewardCents": 1000}');
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000060b0', 'salonId', '00000000-0000-0000-0000-0000000060a1',
  'client', jsonb_build_object('phone', '+14085557142', 'name', 'Lan Tran'), 'lines', '[]'::jsonb));
reset role;
insert into public.loyalty_ledger (salon_id, client_id, change, reason)
  select salon_id, id, 100, 'adjust' from public.clients where phone = '+14085557142' and salon_id = '00000000-0000-0000-0000-0000000060a1';
update public.salons set gift_settings = coalesce(gift_settings, '{}') || '{"on": true}' where id = '00000000-0000-0000-0000-0000000060a1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb01","role":"authenticated"}', true);

-- 1. $50 service − $10 reward, no tech on a gift-only style tip: card charges $40 + $5 tip
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000060b1', 'salonId', '00000000-0000-0000-0000-0000000060a1',
  'client', jsonb_build_object('phone', '+14085557142', 'name', 'Lan Tran'), 'lines', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000060c1', 'kind', 'service', 'staffId', '00000000-0000-0000-0000-00000000607a', 'name', 'Gel', 'minutes', 45, 'cents', 5000),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000060c2', 'kind', 'loyalty_reward', 'name', 'Reward', 'cents', -1000))));
insert into t_out values ('due', (select to_jsonb(i.due_cents) from public.pay_info('00000000-0000-0000-0000-0000000060b1') i));
reset role;
insert into public.pay_requests (id, salon_id, ticket_id, method, amount_cents)
  values ('00000000-0000-0000-0000-0000000060d1', '00000000-0000-0000-0000-0000000060a1', '00000000-0000-0000-0000-0000000060b1', 'pay_link', 4000);
insert into t_out values ('paid', public.settle_card(jsonb_build_object('payRequestId', '00000000-0000-0000-0000-0000000060d1', 'paymentIntent', 'pi_fix1',
  'amountCents', 4500, 'tipCents', 500, 'feeCents', 0, 'tips', jsonb_build_array(jsonb_build_object('staffId', null, 'cents', 500)))));
insert into t_out values ('t1', (select to_jsonb(t) from public.tickets t where id = '00000000-0000-0000-0000-0000000060b1'));
insert into t_out values ('pts', to_jsonb((select sum(change) from public.loyalty_ledger where ticket_id = '00000000-0000-0000-0000-0000000060b1')));

-- 2. gift card sold for $50 (cash), $30 of it spent: the sale can't be refunded in full any more
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb01","role":"authenticated"}', true);
insert into t_out values ('card', public.gift_prepare_digital('00000000-0000-0000-0000-0000000060a1', '+14085559999', 'Mai', 'Enjoy'));
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000060b2', 'salonId', '00000000-0000-0000-0000-0000000060a1',
  'lines', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'gift_sale', 'name', 'Gift card', 'cents', 5000, 'giftCardId', (select v->>'id' from t_out where k = 'card'))),
  'payment', jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'givenCents', 5000)));
reset role;
insert into t_out values ('block_before', to_jsonb(public.refund_block('00000000-0000-0000-0000-0000000060b2')));
insert into public.gift_card_ledger (salon_id, card_id, change_cents, reason) values ('00000000-0000-0000-0000-0000000060a1', (select (v->>'id')::uuid from t_out where k = 'card'), -3000, 'used');
do $$ begin perform public.settle_refund('00000000-0000-0000-0000-0000000060b2', null, 'test', null);
  raise exception 'FAIL: refunded a spent gift card in full'; exception when others then if sqlerrm not like '%already used%' then raise; end if; end $$;

-- 3. an invite for another salon's staff member is refused; redeem checks the salon too
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb02","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000061a1', 'ownerName', 'Eve', 'salonName', 'Other Nails', 'state', 'CA', 'step', 9));
do $$ begin insert into public.invites (code, salon_id, membership_id) values ('EVILCODE1', '00000000-0000-0000-0000-0000000061a1', '00000000-0000-0000-0000-00000000607a');
  raise exception 'FAIL: invite for another salon''s staff'; exception when others then if sqlerrm like 'FAIL%' then raise; end if; end $$;

-- 4. clock in twice (phone + stale desk) = one event; out with nothing open = none
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb01","role":"authenticated"}', true);
-- clock_self is server-only since clock_rules (phones go through /api/clock/phone); same person, run as the server.
set local role service_role;
select public.clock_self('00000000-0000-0000-0000-0000000060a1', 'out');
select public.clock_self('00000000-0000-0000-0000-0000000060a1', 'in');
select public.clock_self('00000000-0000-0000-0000-0000000060a1', 'in');
reset role;
insert into t_out values ('clock', to_jsonb((select count(*) from public.clock_events where salon_id = '00000000-0000-0000-0000-0000000060a1')));

do $$ declare o jsonb := (select jsonb_object_agg(k, v) from t_out); begin
  if (o->>'due')::int <> 4000 then raise exception 'FAIL card due with reward: %', o->'due'; end if;
  if o->'paid'->>'status' <> 'paid' or (o->'paid'->>'extra')::boolean then raise exception 'FAIL reward ticket not paid by card: %', o->'paid'; end if;
  if o->'t1'->>'status' <> 'paid' or (o->'t1'->>'discount_cents')::int <> 1000 or (o->'t1'->>'tip_cents')::int <> 500 or (o->'t1'->>'total_cents')::int <> 4500 then raise exception 'FAIL totals: %', o->'t1'; end if;
  if (o->>'pts')::int <> -60 then raise exception 'FAIL points (−100 reward + 40 earned): %', o->'pts'; end if;
  if o->'block_before' <> 'null' then raise exception 'FAIL unused gift card sale should be refundable: %', o->'block_before'; end if;
  if (o->>'clock')::int <> 1 then raise exception 'FAIL clock events: %', o->'clock'; end if;
  raise notice 'PASS bug_hunt_fixes';
end $$;
rollback;
