-- Session 10 (M12) loyalty in SQL: points only when a ticket is paid (service price, not tips/gift cards); a reward needs enough
-- points, the exact amount, one per visit, the client's phone; points shown = ledger sum; refund reverses; techs can't change
-- settings; the client page (signed in by phone) shows points + gift cards and can add a card by code. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fb01', '14085551001', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fb02', '14085551002', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fb03', '14085550142', 'authenticated', 'authenticated');   -- Lan, the client
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
create function pg_temp.tk(id text, lines jsonb, pay boolean default false) returns jsonb language sql as $$
  select public.save_ticket(jsonb_build_object('id', ('00000000-0000-0000-0000-0000000050' || id)::uuid, 'salonId', '00000000-0000-0000-0000-0000000050a1',
    'client', jsonb_build_object('phone', '+14085550142', 'name', 'Lan Tran'), 'lines', lines)
    || case when pay then jsonb_build_object('payment', jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'givenCents', 20000)) else '{}' end) $$;
create function pg_temp.svc(id text, cents int) returns jsonb language sql as $$
  select jsonb_build_object('id', ('00000000-0000-0000-0000-0000000051' || id)::uuid, 'kind', 'service', 'staffId', '00000000-0000-0000-0000-00000000507a', 'name', 'Gel manicure', 'minutes', 45, 'cents', cents) $$;
create function pg_temp.line(id text, kind text, cents int, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', ('00000000-0000-0000-0000-0000000051' || id)::uuid, 'kind', kind, 'staffId', '00000000-0000-0000-0000-00000000507a', 'name', kind, 'cents', cents) || extra $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000050a1', 'ownerName', 'Mai', 'salonName', 'Points Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000507a', 'name', 'Kim', 'phone', '+14085551002', 'role', 'tech'))));
-- loyalty off: paying earns nothing
select pg_temp.tk('b0', jsonb_build_array(pg_temp.svc('c0', 3000)), true);
select public.loyalty_settings_save('00000000-0000-0000-0000-0000000050a1', '{"on": true, "kind": "points", "pointsPerDollar": 1, "rewardPoints": 100, "rewardCents": 1000}');
-- ticket 1: $45 service + $9 tip (cash) → +45 points (not on the tip)
select pg_temp.tk('b1', jsonb_build_array(pg_temp.svc('c1', 4500), pg_temp.line('d1', 'tip', 900)), true);
reset role;
insert into public.loyalty_ledger (salon_id, client_id, change, reason)
  select '00000000-0000-0000-0000-0000000050a1', id, 60, 'adjust' from public.clients where phone = '+14085550142' and salon_id = '00000000-0000-0000-0000-0000000050a1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
insert into t_out values ('ready', public.loyalty_for_client('00000000-0000-0000-0000-0000000050a1', '+14085550142'));
-- wrong reward amount, two rewards: refused
do $$ begin perform pg_temp.tk('b2', jsonb_build_array(pg_temp.svc('c2', 5200), pg_temp.line('e2', 'loyalty_reward', -500)));
  raise exception 'FAIL: wrong reward amount'; exception when others then if sqlerrm not like '%reward amount changed%' then raise; end if; end $$;
do $$ begin perform pg_temp.tk('b2', jsonb_build_array(pg_temp.svc('c2', 5200), pg_temp.line('e2', 'loyalty_reward', -1000), pg_temp.line('e3', 'loyalty_reward', -1000)));
  raise exception 'FAIL: two rewards'; exception when others then if sqlerrm not like '%one reward per visit%' then raise; end if; end $$;
-- ticket 2: $52 service − $10 reward → paid $42 → −100 + 42
insert into t_out values ('t2', pg_temp.tk('b2', jsonb_build_array(pg_temp.svc('c2', 5200), pg_temp.line('e2', 'loyalty_reward', -1000)), true));
insert into t_out values ('after2', public.loyalty_for_client('00000000-0000-0000-0000-0000000050a1', '+14085550142'));
insert into t_out values ('pts2', public.ticket_points('00000000-0000-0000-0000-0000000050b2'));
-- not enough points now (47): refused
do $$ begin perform pg_temp.tk('b3', jsonb_build_array(pg_temp.svc('c3', 3000), pg_temp.line('e4', 'loyalty_reward', -1000)));
  raise exception 'FAIL: reward without points'; exception when others then if sqlerrm not like '%not enough points%' then raise; end if; end $$;
-- a gift card sold to someone else (for the client page test)
insert into t_out values ('card', public.gift_prepare_digital('00000000-0000-0000-0000-0000000050a1', '+14085559999', 'Mai', 'Enjoy'));
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000050b9', 'salonId', '00000000-0000-0000-0000-0000000050a1',
  'lines', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'gift_sale', 'name', 'Gift card', 'cents', 2500, 'giftCardId', (select v->>'id' from t_out where k = 'card'))),
  'payment', jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'givenCents', 2500)));
reset role;
-- refund ticket 2 → its points come back the other way
update public.tickets set status = 'refunded' where id = '00000000-0000-0000-0000-0000000050b2';
update public.tickets set status = 'refunded' where id = '00000000-0000-0000-0000-0000000050b2';   -- twice: still once
insert into t_out values ('ledger_sum', to_jsonb((select sum(change) from public.loyalty_ledger l join public.clients c on c.id = l.client_id where c.phone = '+14085550142')));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
insert into t_out values ('after_refund', public.loyalty_for_client('00000000-0000-0000-0000-0000000050a1', '+14085550142'));
insert into t_out values ('settings', public.loyalty_settings_get('00000000-0000-0000-0000-0000000050a1'));

-- tech: can't change settings
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb02","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin perform public.loyalty_settings_save('00000000-0000-0000-0000-0000000050a1', '{"on": false}');
  raise exception 'FAIL: tech changed loyalty'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;

reset role;
insert into t_out values ('slug', to_jsonb((select slug from public.salons where id = '00000000-0000-0000-0000-0000000050a1')));
set local role authenticated;
-- ticket slip rule: a line the desk hasn't seen (tech added it on their phone) stays when the desk saves
reset role;
insert into public.tickets (id, salon_id, number) values ('00000000-0000-0000-0000-0000000050c1', '00000000-0000-0000-0000-0000000050a1', 9001);
insert into public.ticket_lines (id, salon_id, ticket_id, kind, name, amount_cents) values
  ('00000000-0000-0000-0000-0000000052a1', '00000000-0000-0000-0000-0000000050a1', '00000000-0000-0000-0000-0000000050c1', 'service', 'Desk line', 3000),
  ('00000000-0000-0000-0000-0000000052a2', '00000000-0000-0000-0000-0000000050a1', '00000000-0000-0000-0000-0000000050c1', 'service', 'Phone line', 2000);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000050c1', 'salonId', '00000000-0000-0000-0000-0000000050a1',
  'lines', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000052a1', 'kind', 'service', 'name', 'Desk line', 'cents', 3000)),
  'seen', jsonb_build_array('00000000-0000-0000-0000-0000000052a1')));
insert into t_out values ('slip', to_jsonb((select count(*) from public.ticket_lines where ticket_id = '00000000-0000-0000-0000-0000000050c1' and removed_at is null)));
-- Lan on her own phone: client page + add the card by its code
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb03","role":"authenticated"}', true);
insert into t_out values ('page', public.client_page((select v #>> '{}' from t_out where k = 'slug')));
insert into t_out values ('typo', public.client_add_card((select v #>> '{}' from t_out where k = 'slug'), 'NOPE-1234'));
insert into t_out values ('add', public.client_add_card((select v #>> '{}' from t_out where k = 'slug'), (select v->>'code' from t_out where k = 'card')));
insert into t_out values ('page2', public.client_page((select v #>> '{}' from t_out where k = 'slug')));
-- Lan can't read the desk view
do $$ begin if public.loyalty_for_client('00000000-0000-0000-0000-0000000050a1', '+14085550142') is not null then raise exception 'FAIL: client read desk view'; end if; end $$;
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if (o->'ready'->>'points')::int <> 105 or (o->'ready'->>'ready')::boolean is not true then raise exception 'FAIL earn (45 + 60 adjust, not on tip, nothing while off): %', o->'ready'; end if;
  if (o->'after2'->>'points')::int <> 47 or (o->'after2'->>'ready')::boolean then raise exception 'FAIL redeem + earn on $42: %', o->'after2'; end if;
  if (o->'pts2'->>'earned')::int <> 42 or (o->'pts2'->>'used')::int <> 100 or (o->'pts2'->>'balance')::int <> 47 then raise exception 'FAIL receipt points: %', o->'pts2'; end if;
  if (o->>'ledger_sum')::int <> 105 or (o->'after_refund'->>'points')::int <> 105 then raise exception 'FAIL refund reverses (shown = ledger sum): % %', o->'ledger_sum', o->'after_refund'; end if;
  if (o->'settings'->>'on')::boolean is not true or (o->'settings'->>'redeemed30')::int <> 1 then raise exception 'FAIL settings: %', o->'settings'; end if;
  if o->'page'->>'first' <> 'Lan' or (o->'page'->'loyalty'->>'points')::int <> 105 or jsonb_array_length(o->'page'->'history') < 3 or jsonb_array_length(o->'page'->'cards') <> 0 then raise exception 'FAIL client page: %', o->'page'; end if;
  if o->'typo'->>'reason' <> 'typo' or (o->'add'->>'ok')::boolean is not true or (o->'add'->'card'->>'balance')::int <> 2500 then raise exception 'FAIL add card: % %', o->'typo', o->'add'; end if;
  if jsonb_array_length(o->'page2'->'cards') <> 1 then raise exception 'FAIL card on page: %', o->'page2'; end if;
  if (o->>'slip')::int <> 2 then raise exception 'FAIL ticket-slip seen rule: %', o->'slip'; end if;
  raise notice 'PASS session10_loyalty';
end $$;
rollback;
