-- Split payment: part cash + rest by card; part cash + rest in cash; take a part back; refund gives back every part;
-- the day still adds up ($0 unmatched); a tech can't take money. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fa01', '14085550601', 'authenticated', 'authenticated'),  -- owner
  ('00000000-0000-0000-0000-00000000fa02', '14085550602', 'authenticated', 'authenticated');  -- tech
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon, service_role;
create function pg_temp.id(x text) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-00000000a' || x)::uuid $$;
create function pg_temp.tk(tid text, cents int, pay jsonb default null) returns jsonb language sql as $$
  select public.save_ticket(jsonb_build_object('id', pg_temp.id(tid), 'salonId', pg_temp.id('a01'),
    'lines', jsonb_build_array(jsonb_build_object('id', pg_temp.id('c' || right(tid, 2)), 'kind', 'service', 'staffId', pg_temp.id('f01'), 'name', 'Gel', 'minutes', 45, 'cents', cents)))
    || case when pay is null then '{}'::jsonb else jsonb_build_object('payment', pay) end) $$;
create function pg_temp.part(pid text, tid text, cents int) returns jsonb language sql as $$
  select public.cash_part(jsonb_build_object('paymentId', pg_temp.id(pid), 'salonId', pg_temp.id('a01'), 'ticketId', pg_temp.id(tid), 'cents', cents, 'givenCents', cents)) $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fa01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', pg_temp.id('a01'), 'ownerName', 'Mai', 'salonName', 'Split Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', pg_temp.id('f01'), 'name', 'Kim', 'phone', '+14085550602', 'role', 'tech', 'payType', 'commission', 'commissionPct', 60))));
reset role;
update public.salons set time_zone = 'UTC' where id = pg_temp.id('a01');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fa01","role":"authenticated"}', true);

-- T1 $60: $20 cash now, rest by card
select pg_temp.tk('b01', 6000);
insert into t_out values ('p1', pg_temp.part('d01', 'b01', 2000));
insert into t_out values ('p1_again', pg_temp.part('d01', 'b01', 2000));
do $$ begin perform pg_temp.part('d02', 'b01', 4000); raise exception 'FAIL: part that pays it all';
  exception when others then if sqlerrm not like '%pays it all%' then raise; end if; end $$;
insert into t_out values ('due', (select to_jsonb(due_cents) from public.pay_info(pg_temp.id('b01'))));
reset role;
insert into public.pay_requests (id, salon_id, ticket_id, method, amount_cents, status) values (pg_temp.id('e01'), pg_temp.id('a01'), pg_temp.id('b01'), 'pay_link', 4000, 'pending');
set local role service_role;
insert into t_out values ('card', public.settle_card(jsonb_build_object('payRequestId', pg_temp.id('e01'), 'paymentIntent', 'pi_split', 'amountCents', 4500, 'tipCents', 500,
  'tips', jsonb_build_array(jsonb_build_object('staffId', pg_temp.id('f01'), 'cents', 500)))));
reset role;

-- T2 $50: $10 cash part, taken back, then all $50 in cash
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fa01","role":"authenticated"}', true);
select pg_temp.tk('b02', 5000);
select pg_temp.part('d03', 'b02', 1000);
insert into t_out values ('undo', public.cash_part_undo(pg_temp.id('d03')));
insert into t_out values ('t2', pg_temp.tk('b02', 5000, jsonb_build_object('id', pg_temp.id('d04'), 'method', 'cash', 'givenCents', 5000)));

-- T3 $45: $15 cash part + $30 cash to finish
select pg_temp.tk('b03', 4500);
select pg_temp.part('d05', 'b03', 1500);
do $$ begin perform pg_temp.tk('b03', 4500, jsonb_build_object('id', pg_temp.id('d06'), 'method', 'cash', 'givenCents', 2000));
  raise exception 'FAIL: short finish accepted'; exception when others then if sqlerrm not like '%less than the total%' then raise; end if; end $$;
insert into t_out values ('t3', pg_temp.tk('b03', 4500, jsonb_build_object('id', pg_temp.id('d07'), 'method', 'cash', 'givenCents', 3000)));
insert into t_out values ('sum', public.day_summary(pg_temp.id('a01'), current_date));

-- tech on own phone can't take money
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fa02","role":"authenticated"}', true);
select public.claim_memberships();
select pg_temp.tk('b04', 3000) where false;
do $$ begin perform pg_temp.part('d08', 'b03', 100); raise exception 'FAIL: tech took cash';
  exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
reset role;

-- refund T1: both parts come back
set local role service_role;
insert into t_out values ('refund', public.settle_refund(pg_temp.id('b01'), 're_split', 'unhappy', null));
reset role;
insert into t_out values ('refund_rows', (select jsonb_agg(jsonb_build_object('cents', r.amount_cents, 'stripe', r.stripe_refund_id) order by r.amount_cents)
  from public.refunds r where r.ticket_id = pg_temp.id('b01')));
insert into t_out values ('t1_pays', (select jsonb_agg(status order by amount_cents) from public.payments where ticket_id = pg_temp.id('b01')));

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out); s jsonb := o->'sum';
begin
  if o->'p1'->>'left_cents' <> '4000' or not (o->'p1_again'->>'repeat')::boolean then raise exception 'FAIL part: % %', o->'p1', o->'p1_again'; end if;
  if o->>'due' <> '4000' then raise exception 'FAIL card due: %', o->'due'; end if;
  if o->'card'->>'status' <> 'paid' then raise exception 'FAIL card after cash part: %', o->'card'; end if;
  if o->'undo'->>'left_cents' <> '5000' or o->'t2'->>'status' <> 'paid' then raise exception 'FAIL undo: % %', o->'undo', o->'t2'; end if;
  if o->'t3'->>'status' <> 'paid' then raise exception 'FAIL cash + cash: %', o->'t3'; end if;
  if (s->>'unmatched_cents')::int <> 0 then raise exception 'FAIL unmatched: %', s->'unmatched_cents'; end if;
  if s->'paid'->>'cash_cents' <> '11500' or s->'paid'->>'card_cents' <> '4500' then raise exception 'FAIL paid: %', s->'paid'; end if;
  if o->'refund'->>'amount_cents' <> '6500' then raise exception 'FAIL refund total: %', o->'refund'; end if;
  if o->'refund_rows' <> '[{"cents": 2000, "stripe": null}, {"cents": 4500, "stripe": "re_split"}]'::jsonb then raise exception 'FAIL refund rows: %', o->'refund_rows'; end if;
  if o->'t1_pays' <> '["refunded", "refunded"]'::jsonb then raise exception 'FAIL t1 payments: %', o->'t1_pays'; end if;
  raise notice 'PASS split_cash';
end $$;
rollback;
