-- Session 7 (M10) close day + payout sheet in SQL. A day with cash, card, gift card and a cash refund closes to $0 difference;
-- open tickets block closing until left open with a reason; front desk needs a manager OK; payout math (commission + tips,
-- check/cash split); tech sees only their own earnings, by login or by PIN on the salon device. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ee01', '14085550501', 'authenticated', 'authenticated'),  -- owner Mai
  ('00000000-0000-0000-0000-00000000ee02', '14085550502', 'authenticated', 'authenticated'),  -- tech Kim
  ('00000000-0000-0000-0000-00000000ee03', '14085550503', 'authenticated', 'authenticated');  -- front desk Lan
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
create function pg_temp.id(x text) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-000000009' || x)::uuid $$;
create function pg_temp.tk(tid text, lines jsonb, pay jsonb default null) returns jsonb language sql as $$
  select public.save_ticket(jsonb_build_object('id', pg_temp.id(tid), 'salonId', pg_temp.id('a01'), 'lines', lines)
    || case when pay is null then '{}'::jsonb else jsonb_build_object('payment', pay) end) $$;
create function pg_temp.svc(lid text, cents int) returns jsonb language sql as $$
  select jsonb_build_object('id', pg_temp.id(lid), 'kind', 'service', 'staffId', pg_temp.id('f01'), 'name', 'Gel', 'minutes', 45, 'cents', cents) $$;
create function pg_temp.tip(lid text, cents int) returns jsonb language sql as $$
  select jsonb_build_object('id', pg_temp.id(lid), 'kind', 'tip', 'staffId', pg_temp.id('f01'), 'name', 'Cash tip', 'cents', cents) $$;
create function pg_temp.cash(pid text, cents int) returns jsonb language sql as $$
  select jsonb_build_object('id', pg_temp.id(pid), 'method', 'cash', 'givenCents', cents) $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', pg_temp.id('a01'), 'ownerName', 'Mai', 'salonName', 'Close Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('f01'), 'name', 'Kim', 'phone', '+14085550502', 'role', 'tech', 'payType', 'commission', 'commissionPct', 60),
    jsonb_build_object('id', pg_temp.id('f02'), 'name', 'Lan', 'phone', '+14085550503', 'role', 'front_desk'))));
select public.set_check_pct(pg_temp.id('f01'), 70);
insert into t_out values ('device', to_jsonb(public.register_device(pg_temp.id('a01'), 'Front desk')));
reset role;
update public.salons set time_zone = 'UTC' where id = pg_temp.id('a01');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee02","role":"authenticated"}', true);
select public.claim_memberships();
select public.set_my_pin(pg_temp.id('a01'), '258013');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee03","role":"authenticated"}', true);
select public.claim_memberships();
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee01","role":"authenticated"}', true);

-- T1 cash: $40 gel + $5 cash tip, $50 given
select pg_temp.tk('b01', jsonb_build_array(pg_temp.svc('c01', 4000), pg_temp.tip('c02', 500)), pg_temp.cash('d01', 5000));
-- T2 card: $40 gel, card pays $50 ($10 card tip)
select pg_temp.tk('b02', jsonb_build_array(pg_temp.svc('c03', 4000)));
reset role;
insert into public.pay_requests (id, salon_id, ticket_id, method, amount_cents, status) values (pg_temp.id('e01'), pg_temp.id('a01'), pg_temp.id('b02'), 'pay_link', 4000, 'pending');
set local role service_role;
select public.settle_card(jsonb_build_object('payRequestId', pg_temp.id('e01'), 'paymentIntent', 'pi_close', 'amountCents', 5000, 'tipCents', 1000, 'feeCents', 175,
  'tips', jsonb_build_array(jsonb_build_object('staffId', pg_temp.id('f01'), 'cents', 1000))));
reset role;
-- T3 gift card: sold for $30 cash on T3a, then pays all of T3b ($30 gel)
set local role authenticated;
insert into t_out values ('gift', public.gift_prepare_digital(pg_temp.id('a01'), '+14085550199', 'Vy', ''));
select pg_temp.tk('b03', jsonb_build_array(jsonb_build_object('id', pg_temp.id('c04'), 'kind', 'gift_sale', 'giftCardId', (select (v->>'id')::uuid from t_out where k = 'gift'), 'name', 'Gift card', 'cents', 3000)),
  pg_temp.cash('d03', 3000));
select pg_temp.tk('b04', jsonb_build_array(pg_temp.svc('c05', 3000)));
select public.gift_use(jsonb_build_object('paymentId', pg_temp.id('d04'), 'salonId', pg_temp.id('a01'), 'ticketId', pg_temp.id('b04'),
  'cardId', (select (v->>'id')::uuid from t_out where k = 'gift'), 'cents', 3000));
-- T4 cash $20, then refunded
select pg_temp.tk('b05', jsonb_build_array(pg_temp.svc('c06', 2000)), pg_temp.cash('d05', 2000));
reset role;
set local role service_role;
select public.settle_refund(pg_temp.id('b05'), null, 'client unhappy', pg_temp.id('f01'));
reset role;
-- T5 still open (a $25 gel nobody paid yet)
set local role authenticated;
select pg_temp.tk('b06', jsonb_build_array(pg_temp.svc('c07', 2500)));

insert into t_out values ('sum', public.day_summary(pg_temp.id('a01'), current_date));

-- open ticket blocks closing
do $$ begin perform public.close_day(jsonb_build_object('salonId', pg_temp.id('a01'), 'day', current_date, 'counts', '{}'::jsonb));
  raise exception 'FAIL: closed with an open ticket'; exception when others then if sqlerrm not like '%still open%' then raise; end if; end $$;

-- front desk can't close alone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee03","role":"authenticated"}', true);
do $$ begin perform public.close_day(jsonb_build_object('salonId', pg_temp.id('a01'), 'day', current_date,
    'leftOpen', jsonb_build_array(jsonb_build_object('id', pg_temp.id('b06'), 'reason', 'pays tomorrow'))));
  raise exception 'FAIL: front desk closed alone'; exception when others then if sqlerrm not like '%owner or manager OK%' then raise; end if; end $$;
-- tech can't read the payout sheet or the day
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee02","role":"authenticated"}', true);
do $$ begin perform public.payout_sheet(pg_temp.id('a01'), current_date, current_date); raise exception 'FAIL: tech read payout sheet';
  exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
do $$ begin perform public.day_summary(pg_temp.id('a01'), current_date); raise exception 'FAIL: tech read the day';
  exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
insert into t_out values ('mine', public.my_earnings(pg_temp.id('a01'), current_date, current_date));

-- owner's own login still needs an OK (one tap), never just the session
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee01","role":"authenticated"}', true);
do $$ begin perform public.close_day(jsonb_build_object('salonId', pg_temp.id('a01'), 'day', current_date,
    'leftOpen', jsonb_build_array(jsonb_build_object('id', pg_temp.id('b06'), 'reason', 'pays tomorrow'))));
  raise exception 'FAIL: closed with no OK'; exception when others then if sqlerrm not like '%owner or manager OK%' then raise; end if; end $$;
insert into t_out values ('ok', public.approve_discount(pg_temp.id('a01'), null, null, null, 'close', null));
-- owner closes: counted $225 = expected ($150 start + $45 + $30 + $20 cash − $20 refund), takes $100 to the bank
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee01","role":"authenticated"}', true);
insert into t_out values ('close', public.close_day(jsonb_build_object('salonId', pg_temp.id('a01'), 'day', current_date,
  'approvalId', (select v->>'approval_id' from t_out where k = 'ok'), 'counts', jsonb_build_object('100', 2, '20', 1, '5', 1), 'coinsCents', 0, 'cashRemovedCents', 10000,
  'leftOpen', jsonb_build_array(jsonb_build_object('id', pg_temp.id('b06'), 'reason', 'pays tomorrow')))));
-- the same OK can't close twice
do $$ begin perform public.close_day(jsonb_build_object('salonId', pg_temp.id('a01'), 'day', current_date, 'approvalId', (select v->>'approval_id' from t_out where k = 'ok'),
    'leftOpen', jsonb_build_array(jsonb_build_object('id', pg_temp.id('b06'), 'reason', 'pays tomorrow'))));
  raise exception 'FAIL: OK used twice'; exception when others then if sqlerrm not like '%owner or manager OK%' then raise; end if; end $$;
reset role;
insert into public.memberships (id, salon_id, display_name, phone, role, pay_type, hourly_cents, archived_at)
  values (pg_temp.id('f03'), pg_temp.id('a01'), 'Linh', '+14085550504', 'front_desk', 'hourly', 1800, now());
insert into public.clock_events (salon_id, membership_id, kind, source, at) values
  (pg_temp.id('a01'), pg_temp.id('f03'), 'in', 'pin', current_date - interval '1 hour'),
  (pg_temp.id('a01'), pg_temp.id('f03'), 'out', 'pin', current_date + interval '1 hour'),
  (pg_temp.id('a01'), pg_temp.id('f03'), 'in', 'pin', current_date + interval '10 hours'),
  (pg_temp.id('a01'), pg_temp.id('f03'), 'out', 'pin', current_date + interval '12 hours');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee01","role":"authenticated"}', true);
insert into t_out values ('tomorrow', public.day_summary(pg_temp.id('a01'), current_date + 1)->'cash');
insert into t_out values ('sheet', public.payout_sheet(pg_temp.id('a01'), current_date, current_date));
insert into t_out values ('yday', public.payout_sheet(pg_temp.id('a01'), current_date - 1, current_date - 1));
-- PIN on the salon device: Kim's own slip; wrong PIN shows nothing
insert into t_out values ('pin', public.pin_earnings((select (v #>> '{}')::uuid from t_out where k = 'device'), pg_temp.id('f01'), '258013', current_date, current_date));
insert into t_out values ('pin_bad', public.pin_earnings((select (v #>> '{}')::uuid from t_out where k = 'device'), pg_temp.id('f01'), '111111', current_date, current_date));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out); s jsonb := o->'sum'; kim jsonb;
begin
  if (s->>'unmatched_cents')::int <> 0 then raise exception 'FAIL unmatched: %', s->'unmatched_cents'; end if;
  if s->'sales'->>'total_cents' <> '17500' then raise exception 'FAIL sales: %', s->'sales'; end if;
  if s->'paid'->>'card_cents' <> '5000' or s->'paid'->>'cash_cents' <> '9500' or s->'paid'->>'gift_cents' <> '3000' or s->'paid'->>'fee_cents' <> '175'
  then raise exception 'FAIL paid: %', s->'paid'; end if;
  if s->'refunds'->>'cash_cents' <> '2000' then raise exception 'FAIL refunds: %', s->'refunds'; end if;
  if s->'cash'->>'expected_cents' <> '22500' then raise exception 'FAIL expected cash: %', s->'cash'; end if;
  if jsonb_array_length(s->'open') <> 1 then raise exception 'FAIL open: %', s->'open'; end if;
  if s->'tips' <> jsonb_build_array(jsonb_build_object('id', pg_temp.id('f01'), 'name', 'Kim', 'card_cents', 1000, 'cash_cents', 500, 'fee_cents', 0, 'total_cents', 1500))
  then raise exception 'FAIL tips: %', s->'tips'; end if;
  if o->'close'->>'diff_cents' <> '0' or o->'close'->>'tomorrow_start_cents' <> '12500' then raise exception 'FAIL close: %', o->'close'; end if;
  if o->'tomorrow'->>'start_cents' <> '12500' then raise exception 'FAIL tomorrow start: %', o->'tomorrow'; end if;
  -- Kim: services 40 + 40 + 30 (refunded $20 doesn't count) = $110 × 60% = $66 + tips $15 = $81; 70% check $56.70, cash $24.30
  select x into kim from jsonb_array_elements(o->'sheet') x where x->>'name' = 'Kim';
  if kim->>'services_cents' <> '11000' or kim->>'pay_cents' <> '6600' or kim->>'total_cents' <> '8100'
     or kim->>'check_cents' <> '5670' or kim->>'cash_cents' <> '2430' then raise exception 'FAIL Kim: %', kim; end if;
  if (select count(*) from jsonb_array_elements(o->'sheet') x where x->>'name' = 'Lan') <> 0 then raise exception 'FAIL: front desk with no work on the sheet'; end if;
  -- Linh (archived, hourly $18): 1 h of the overnight shift + 2 h today = 3 h = $54; yesterday gets the other hour
  if (select x->>'minutes' || '/' || (x->>'pay_cents') from jsonb_array_elements(o->'sheet') x where x->>'name' = 'Linh') is distinct from '180/5400'
  then raise exception 'FAIL Linh today: %', o->'sheet'; end if;
  if (select x->>'minutes' from jsonb_array_elements(o->'yday') x where x->>'name' = 'Linh') is distinct from '60' then raise exception 'FAIL Linh yesterday: %', o->'yday'; end if;
  if o->'mine'->>'total_cents' <> '8100' then raise exception 'FAIL my earnings: %', o->'mine'; end if;
  if o->'pin'->'earnings'->>'total_cents' <> '8100' then raise exception 'FAIL pin earnings: %', o->'pin'; end if;
  if (o->'pin_bad'->>'ok')::boolean or o->'pin_bad' ? 'earnings' then raise exception 'FAIL wrong PIN showed earnings'; end if;
  raise notice 'PASS session7_close_day';
end $$;
rollback;
