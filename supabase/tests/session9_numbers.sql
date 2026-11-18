-- Session 9 (M11) owner numbers in SQL: the facts come straight from the rows (paid ticket lines, tips, card fee, gift sold,
-- walk-in wait, clock-in shift, no-show, rebooked same day), owner/manager only — techs and strangers can't read them. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fc01', '14085550901', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fc02', '14085550902', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fc03', '14085550903', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000040a1', 'ownerName', 'Mai', 'salonName', 'Number Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000407a', 'name', 'Kim', 'phone', '+14085550902', 'role', 'tech'))));
reset role;

-- Rows (as the app would have saved them): one paid ticket with a service, a discount, a tip, a gift card sold, card fee.
insert into public.clients (id, salon_id, phone, name) values ('00000000-0000-0000-0000-0000000040c1', '00000000-0000-0000-0000-0000000040a1', '+14085550142', 'Lan Tran');
insert into public.tickets (id, salon_id, number, status, client_id, paid_at) values
  ('00000000-0000-0000-0000-0000000040b1', '00000000-0000-0000-0000-0000000040a1', 1001, 'paid', '00000000-0000-0000-0000-0000000040c1', now() - interval '2 hours');
insert into public.ticket_lines (id, salon_id, ticket_id, kind, staff_id, name, amount_cents) values
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040b1', 'service', '00000000-0000-0000-0000-00000000407a', 'Gel manicure', 4500),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040b1', 'discount', null, 'Discount', -500),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040b1', 'tip', '00000000-0000-0000-0000-00000000407a', 'Tip', 900);
insert into public.payments (id, salon_id, ticket_id, method, amount_cents, fee_cents, status) values
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040b1', 'card_reader', 4900, 137, 'paid');
-- She booked her next visit before leaving; a walk-in waited 15 min; Kim clocked in 4 h ago; a no-show.
insert into public.appointments (id, salon_id, client_id, staff_id, start_at, end_at, services, status, source, created_at) values
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040c1', '00000000-0000-0000-0000-00000000407a',
   now() + interval '21 days', now() + interval '21 days 45 minutes', '[]', 'booked', 'desk', now() - interval '90 minutes'),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000040a1', null, '00000000-0000-0000-0000-00000000407a',
   now() - interval '3 hours', now() - interval '2 hours 15 minutes', '[]', 'arrived', 'kiosk', now() - interval '3 hours'),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000040a1', null, null,
   now() - interval '1 hour', now() - interval '15 minutes', '[{"name": "Pedicure", "minutes": 45, "cents": 3500}]', 'no_show', 'phone', now() - interval '1 day');
update public.appointments set arrived_at = start_at - interval '15 minutes' where source = 'kiosk' and salon_id = '00000000-0000-0000-0000-0000000040a1';
insert into public.clock_events (salon_id, membership_id, kind, source, at) values
  ('00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-00000000407a', 'in', 'pin', now() - interval '4 hours');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
insert into t_out values ('f', public.numbers_facts('00000000-0000-0000-0000-0000000040a1', now() - interval '1 day', now() + interval '1 hour'));
insert into t_out values ('att', public.today_attention('00000000-0000-0000-0000-0000000040a1'));
do $$ begin perform public.numbers_facts('00000000-0000-0000-0000-0000000040a1', now() - interval '200 days', now());
  raise exception 'FAIL: range too long allowed'; exception when others then if sqlerrm not like '%range too long%' then raise; end if; end $$;
-- tech: not allowed
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc02","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin perform public.numbers_facts('00000000-0000-0000-0000-0000000040a1', now() - interval '1 day', now());
  raise exception 'FAIL: tech read numbers'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
-- stranger: not allowed
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc03","role":"authenticated"}', true);
do $$ begin perform public.numbers_facts('00000000-0000-0000-0000-0000000040a1', now() - interval '1 day', now());
  raise exception 'FAIL: stranger read numbers'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;
reset role;

do $$
declare f jsonb := (select v from t_out where k = 'f'); tk jsonb;
begin
  tk := f->'tickets'->0;
  if jsonb_array_length(f->'tickets') <> 1 or (tk->>'sales')::int <> 4000 or (tk->>'tips')::int <> 900 or (tk->>'fees')::int <> 137
     or (tk->>'rebooked')::boolean is not true or (tk->>'newClient')::boolean is not true or jsonb_array_length(tk->'lines') <> 2 then
    raise exception 'FAIL ticket: %', tk; end if;
  if jsonb_array_length(f->'walkins') <> 1 or (f->'walkins'->0->>'seatedAt') is null
     or abs(extract(epoch from (f->'walkins'->0->>'seatedAt')::timestamptz - (f->'walkins'->0->>'came')::timestamptz) - 900) > 1 then raise exception 'FAIL walk-in: %', f->'walkins'; end if;
  if jsonb_array_length(f->'shifts') <> 1 or abs(extract(epoch from (f->'shifts'->0->>'to')::timestamptz - (f->'shifts'->0->>'from')::timestamptz) - 14400) > 5 then
    raise exception 'FAIL shift: %', f->'shifts'; end if;
  if jsonb_array_length(f->'noShows') <> 1 or (f->'noShows'->0->>'cents')::int <> 3500 then raise exception 'FAIL no-show: %', f->'noShows'; end if;
  if jsonb_array_length(f->'visits') <> 1 or jsonb_array_length(f->'staff') < 2 then raise exception 'FAIL visits/staff'; end if;
  raise notice 'PASS session9_numbers';
end $$;
rollback;
