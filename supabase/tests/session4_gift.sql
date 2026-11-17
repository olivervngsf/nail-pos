-- Session 4 (M5) gift cards in SQL: a card is $0 until its sale is paid; use with checks in order; split with cash;
-- reload; undo; refunds put money back; lost card replaced; 5 wrong codes lock lookups; salon wall. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000dd01', '14085550401', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000dd02', '14085550402', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000dd03', '14085550403', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
create function pg_temp.tk(tid text, lines jsonb, pay jsonb default null) returns jsonb language sql as $$
  select public.save_ticket(jsonb_build_object('id', ('00000000-0000-0000-0000-0000000008' || tid)::uuid, 'salonId', '00000000-0000-0000-0000-0000000008a1',
    'lines', lines) || case when pay is null then '{}'::jsonb else jsonb_build_object('payment', pay) end) $$;
create function pg_temp.svc(lid text, cents int) returns jsonb language sql as $$
  select jsonb_build_object('id', ('00000000-0000-0000-0000-0000000008' || lid)::uuid, 'kind', 'service', 'staffId', '00000000-0000-0000-0000-00000000087f', 'name', 'Gel', 'minutes', 45, 'cents', cents) $$;
create function pg_temp.gift(lid text, card uuid, cents int) returns jsonb language sql as $$
  select jsonb_build_object('id', ('00000000-0000-0000-0000-0000000008' || lid)::uuid, 'kind', 'gift_sale', 'giftCardId', card, 'name', 'Gift card', 'cents', cents) $$;
create function pg_temp.cash(pid text, cents int) returns jsonb language sql as $$
  select jsonb_build_object('id', ('00000000-0000-0000-0000-0000000008' || pid)::uuid, 'method', 'cash', 'givenCents', cents) $$;
create function pg_temp.use(pid text, tid text, card uuid, cents int) returns jsonb language sql as $$
  select public.gift_use(jsonb_build_object('paymentId', ('00000000-0000-0000-0000-0000000008' || pid)::uuid, 'salonId', '00000000-0000-0000-0000-0000000008a1',
    'ticketId', ('00000000-0000-0000-0000-0000000008' || tid)::uuid, 'cardId', card, 'cents', cents)) $$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000008a1', 'ownerName', 'Mai', 'salonName', 'Card Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000087f', 'name', 'Kim', 'phone', '+14085550402', 'role', 'tech'))));
reset role;
update public.salons set gift_prefix = 'CARD' where id = '00000000-0000-0000-0000-0000000008a1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd01","role":"authenticated"}', true);

-- 1. digital card made for a sale: $0, "not sold" until paid
insert into t_out values ('dig', public.gift_prepare_digital('00000000-0000-0000-0000-0000000008a1', '+14085550199', 'Lan', 'Happy birthday!'));
create temp table t_c as select (v->>'id')::uuid as id, v->>'code' as code from t_out where k = 'dig';
grant all on t_c to authenticated;
insert into t_out select 'before_paid', public.gift_lookup('00000000-0000-0000-0000-0000000008a1', code) from t_c;
-- 2. ticket A: $45 service + $50 gift card = $95, cash $100 → paid; card active $50
insert into t_out select 'a', pg_temp.tk('b1', jsonb_build_array(pg_temp.svc('c1', 4500), pg_temp.gift('c2', id, 5000))) from t_c;
insert into t_out select 'a_paid', pg_temp.tk('b1', jsonb_build_array(pg_temp.svc('c1', 4500), pg_temp.gift('c2', id, 5000)), pg_temp.cash('d1', 10000)) from t_c;
insert into t_out select 'after_paid', public.gift_lookup('00000000-0000-0000-0000-0000000008a1', code) from t_c;
-- too big a card: refused
do $$ begin perform pg_temp.tk('b9', jsonb_build_array(pg_temp.gift('c9', (select id from t_c), 60000)));
  raise exception 'FAIL: $600 card'; exception when others then if sqlerrm not like '%too big%' then raise; end if; end $$;

-- 3. ticket B: $83, gift card pays $50 (all it has), $33 left in cash ($40 given, $7 change)
select pg_temp.tk('b2', jsonb_build_array(pg_temp.svc('c3', 8300)));
insert into t_out select 'use', pg_temp.use('d2', 'b2', id, 99999) from t_c;
insert into t_out select 'use_again', pg_temp.use('d2', 'b2', id, 99999) from t_c;
do $$ begin perform pg_temp.tk('b2', jsonb_build_array(pg_temp.svc('c3', 8300)), pg_temp.cash('d3', 3000));
  raise exception 'FAIL: short cash'; exception when others then if sqlerrm not like '%less than%' then raise; end if; end $$;
insert into t_out values ('b_paid', pg_temp.tk('b2', jsonb_build_array(pg_temp.svc('c3', 8300)), pg_temp.cash('d3', 4000)));
insert into t_out values ('b_cash', (select to_jsonb(p) from public.payments p where id = '00000000-0000-0000-0000-0000000008d3'));
-- 4. used up: refused
select pg_temp.tk('b3', jsonb_build_array(pg_temp.svc('c4', 2000)));
insert into t_out select 'used_up', pg_temp.use('d4', 'b3', id, 1000) from t_c;
-- 5. reload $30 on ticket D (with a $20 service), cash → card active $30
insert into t_out select 'reload', pg_temp.tk('b4', jsonb_build_array(pg_temp.svc('c5', 2000), pg_temp.gift('c6', id, 3000)), pg_temp.cash('d5', 5000)) from t_c;
-- 6. ticket F $10 paid fully by the card → paid by gift card alone
select pg_temp.tk('b5', jsonb_build_array(pg_temp.svc('c7', 1000)));
insert into t_out select 'full', pg_temp.use('d6', 'b5', id, 5000) from t_c;
-- 7. ticket G: use $5, then undo → back on the card
select pg_temp.tk('b6', jsonb_build_array(pg_temp.svc('c8', 2500)));
insert into t_out select 'part', pg_temp.use('d7', 'b6', id, 500) from t_c;
insert into t_out values ('undo', public.gift_undo('00000000-0000-0000-0000-0000000008d7'));
insert into t_out select 'bal_after_undo', public.gift_lookup('00000000-0000-0000-0000-0000000008a1', code) from t_c;

-- 8. owner: plastic cards, sell one; totals; list; history
insert into t_out values ('plastic', public.gift_make_plastic('00000000-0000-0000-0000-0000000008a1', 3));
insert into t_out values ('pl_find', public.gift_lookup('00000000-0000-0000-0000-0000000008a1', (select v->>0 from t_out where k = 'plastic')));
insert into t_out values ('pl_sold', pg_temp.tk('b7', jsonb_build_array(pg_temp.gift('ca', (select (v->'card'->>'id')::uuid from t_out where k = 'pl_find'), 2500)), pg_temp.cash('d8', 2500)));
insert into t_out values ('summary', public.gift_summary('00000000-0000-0000-0000-0000000008a1'));
insert into t_out values ('list', to_jsonb(jsonb_array_length(public.gift_list('00000000-0000-0000-0000-0000000008a1'))));
insert into t_out select 'history', public.gift_history(id) from t_c;

-- 9. refunds (server, after Stripe/cash refund): ticket B → $50 back on the card; ticket A (sold the card) → card loses $50
reset role;
select public.settle_refund('00000000-0000-0000-0000-0000000008b2', null, 'test', null);
insert into t_out select 'after_refund_b', to_jsonb(public._gift_balance(id)) from t_c;
select public.settle_refund('00000000-0000-0000-0000-0000000008b1', null, 'test', null);
insert into t_out select 'after_refund_a', to_jsonb(public._gift_balance(id)) from t_c;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd01","role":"authenticated"}', true);

-- 10. lost card: replaced by a new digital code, money moves; old code now says "replaced"
insert into t_out select 'replace', public.gift_replace(id) from t_c;
insert into t_out select 'old_code', public.gift_lookup('00000000-0000-0000-0000-0000000008a1', code) from t_c;
insert into t_out values ('new_code', public.gift_lookup('00000000-0000-0000-0000-0000000008a1', (select v->>'code' from t_out where k = 'replace')));
insert into t_out values ('by_phone', public.gift_find('00000000-0000-0000-0000-0000000008a1', '+14085550199'));

-- 11. tech can't use cards; stranger sees nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd02","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin perform public.gift_lookup('00000000-0000-0000-0000-0000000008a1', 'CARD-2222-2222-2222');
  raise exception 'FAIL: tech looked up a card'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd03","role":"authenticated"}', true);
insert into t_out values ('stranger', jsonb_build_object('list', public.gift_list('00000000-0000-0000-0000-0000000008a1'), 'sum', public.gift_summary('00000000-0000-0000-0000-0000000008a1'),
  'ledger', (select count(*) from public.gift_card_ledger), 'cards', (select count(*) from public.gift_cards)));

-- 12. 5 wrong codes → locked out (owner)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dd01","role":"authenticated"}', true);
select public.gift_lookup('00000000-0000-0000-0000-0000000008a1', 'CARD-AAAA-BBBB-CCC' || n) from generate_series(1, 5) n;
insert into t_out select 'locked_out', public.gift_lookup('00000000-0000-0000-0000-0000000008a1', code) from t_c;
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'dig'->>'code' !~ '^CARD-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$' then raise exception 'FAIL code shape: %', o->'dig'; end if;
  if (o->'before_paid'->>'ok')::boolean is not false or o->'before_paid'->>'reason' <> 'not_sold' or (o->'before_paid'->'card'->>'balance_cents')::int <> 0 then raise exception 'FAIL before paid: %', o->'before_paid'; end if;
  if o->'a_paid'->>'status' <> 'paid' or (o->'after_paid'->'card'->>'balance_cents')::int <> 5000 or o->'after_paid'->'card'->>'status' <> 'active' then raise exception 'FAIL sale: % %', o->'a_paid', o->'after_paid'; end if;
  if (o->'use'->>'used_cents')::int <> 5000 or (o->'use'->>'left_cents')::int <> 3300 or (o->'use_again'->>'repeat')::boolean is not true then raise exception 'FAIL use: % %', o->'use', o->'use_again'; end if;
  if o->'b_paid'->>'status' <> 'paid' or (o->'b_cash'->>'amount_cents')::int <> 3300 or (o->'b_cash'->>'change_cents')::int <> 700 then raise exception 'FAIL split: % %', o->'b_paid', o->'b_cash'; end if;
  if o->'used_up'->>'reason' <> 'used_up' then raise exception 'FAIL used up: %', o->'used_up'; end if;
  if o->'reload'->>'status' <> 'paid' then raise exception 'FAIL reload: %', o->'reload'; end if;
  if o->'full'->>'status' <> 'paid' or (o->'full'->>'balance_after')::int <> 2000 then raise exception 'FAIL full: %', o->'full'; end if;
  if (o->'part'->>'left_cents')::int <> 2000 or (o->'bal_after_undo'->'card'->>'balance_cents')::int <> 2000 then raise exception 'FAIL undo: % %', o->'part', o->'bal_after_undo'; end if;
  if jsonb_array_length(o->'plastic') <> 3 or o->'plastic'->>0 !~ '^[0-9]{4} [0-9]{4} [0-9]{4} [0-9]{4}$' or o->'pl_find'->>'reason' <> 'not_sold' or o->'pl_sold'->>'status' <> 'paid' then raise exception 'FAIL plastic: % % %', o->'plastic', o->'pl_find', o->'pl_sold'; end if;
  if (o->'summary'->>'owed_cents')::int <> 4500 or (o->'summary'->>'active')::int <> 2 or (o->'summary'->>'in_stock_plastic')::int <> 2 then raise exception 'FAIL summary: %', o->'summary'; end if;
  if (o->>'list')::int <> 4 or jsonb_array_length(o->'history') <> 6 or o->'history'->0->>'reason' <> 'sold' then raise exception 'FAIL list/history: % %', o->'list', o->'history'; end if;
  if (o->>'after_refund_b')::int <> 7000 or (o->>'after_refund_a')::int <> 2000 then raise exception 'FAIL refunds: % %', o->'after_refund_b', o->'after_refund_a'; end if;
  if (o->'replace'->>'moved_cents')::int <> 2000 or o->'old_code'->>'reason' <> 'replaced' or o->'old_code'->'card'->>'replaced_by_last4' <> o->'replace'->>'last4'
     or (o->'new_code'->'card'->>'balance_cents')::int <> 2000 then raise exception 'FAIL replace: % % %', o->'replace', o->'old_code', o->'new_code'; end if;
  if jsonb_array_length(o->'by_phone') <> 2 then raise exception 'FAIL by phone: %', o->'by_phone'; end if;
  if jsonb_array_length(o->'stranger'->'list') <> 0 or o->'stranger'->>'sum' is not null or (o->'stranger'->>'ledger')::int <> 0 or (o->'stranger'->>'cards')::int <> 0 then raise exception 'FAIL wall: %', o->'stranger'; end if;
  if o->'locked_out'->>'reason' <> 'locked_out' then raise exception 'FAIL lockout: %', o->'locked_out'; end if;
  raise notice 'PASS session4_gift';
end $$;
rollback;
