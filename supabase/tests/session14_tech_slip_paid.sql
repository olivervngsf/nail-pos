-- Tech slip page after the visit: while open it shows no tip; once paid it shows when it was paid and only THIS tech's
-- own tip (Kim's $5, not Tuyet's $3); a paid ticket takes no more services from a phone. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fb01', '14085553001', 'authenticated', 'authenticated'),   -- owner at the desk
  ('00000000-0000-0000-0000-00000000fb02', '14085553002', 'authenticated', 'authenticated');   -- Kim, tech
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
create function pg_temp.desk(pay boolean) returns jsonb language sql as $$
  select public.save_ticket(jsonb_build_object('id', '00000000-0000-0000-0000-0000000070c1', 'salonId', '00000000-0000-0000-0000-0000000070a1',
    'lines', jsonb_build_array(
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000071a1', 'kind', 'service', 'staffId', '00000000-0000-0000-0000-00000000707a', 'name', 'Gel manicure', 'minutes', 45, 'cents', 4500),
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000071a2', 'kind', 'service', 'staffId', '00000000-0000-0000-0000-00000000707b', 'name', 'Spa pedicure', 'minutes', 45, 'cents', 3800),
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000071a3', 'kind', 'tip', 'staffId', '00000000-0000-0000-0000-00000000707a', 'name', 'Cash tip', 'cents', 500),
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000071a4', 'kind', 'tip', 'staffId', '00000000-0000-0000-0000-00000000707b', 'name', 'Cash tip', 'cents', 300)))
    || case when pay then jsonb_build_object('payment', jsonb_build_object('id', '00000000-0000-0000-0000-0000000072a1', 'method', 'cash', 'givenCents', 10000)) else '{}'::jsonb end) $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000070a1', 'ownerName', 'Mai', 'salonName', 'Paid Slip Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000707a', 'name', 'Kim', 'phone', '+14085553002', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000707b', 'name', 'Tuyet', 'phone', '+14085553003', 'role', 'tech'))));
select pg_temp.desk(false);
-- Kim scans the slip while the ticket is open
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('open', public.tech_ticket('00000000-0000-0000-0000-0000000070c1'));
-- desk takes cash; Kim's page now shows the paid view
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
select pg_temp.desk(true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fb02","role":"authenticated"}', true);
insert into t_out values ('paid', public.tech_ticket('00000000-0000-0000-0000-0000000070c1'));
do $$ begin perform public.tech_add_service('00000000-0000-0000-0000-0000000070c1', gen_random_uuid(), gen_random_uuid());
  raise exception 'FAIL: added to a paid ticket'; exception when others then if sqlerrm not like '%already paid%' then raise; end if; end $$;
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'open'->>'status' <> 'open' or o->'open'->'my_tip' <> 'null'::jsonb or o->'open'->'paid_at' <> 'null'::jsonb then raise exception 'FAIL open: %', o->'open'; end if;
  if o->'paid'->>'status' <> 'paid' or o->'paid'->>'paid_at' is null then raise exception 'FAIL paid status: %', o->'paid'; end if;
  if (o->'paid'->'my_tip'->>'cash_cents')::int <> 500 or (o->'paid'->'my_tip'->>'card_cents')::int <> 0 or (o->'paid'->'my_tip'->>'fee_cents')::int <> 0
    then raise exception 'FAIL my tip (only Kim''s $5): %', o->'paid'->'my_tip'; end if;
  if jsonb_array_length(o->'paid'->'lines') <> 2 then raise exception 'FAIL lines: %', o->'paid'->'lines'; end if;
  raise notice 'PASS session14_tech_slip_paid';
end $$;
rollback;
