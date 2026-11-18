-- Session 2 checkout in SQL: owner opens a ticket, adds services, saving twice is safe, discount needs a manager PIN,
-- cash short is refused, cash paid locks the ticket, totals worked out on the server, tech can't save tickets,
-- another salon can't read it, client lookup shows the visit. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000bb01', '14085550201', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000bb02', '14085550202', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000bb03', '14085550203', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object(
  'salonId', '00000000-0000-0000-0000-0000000006a1', 'ownerName', 'Mai', 'salonName', 'Checkout Nails', 'state', 'CA', 'step', 9,
  'services', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000006e1', 'cat', 'Gel', 'name', 'Gel mani', 'minutes', 45, 'priceCents', 3500, 'on', true),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000006e2', 'cat', 'Pedi', 'name', 'Deluxe pedi', 'minutes', 60, 'priceCents', 5500, 'on', true)),
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000067f', 'name', 'Kim', 'phone', '+14085550202', 'role', 'tech'))));

-- open ticket with two services (one without staff yet)
create temp table t_tk as select jsonb_build_object('id', '00000000-0000-0000-0000-0000000006b1', 'salonId', '00000000-0000-0000-0000-0000000006a1',
  'client', jsonb_build_object('phone', '+14085559999', 'name', 'Lan'),
  'lines', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000006c1', 'kind', 'service', 'serviceId', '00000000-0000-0000-0000-0000000006e1', 'staffId', '00000000-0000-0000-0000-00000000067f', 'name', 'Gel mani', 'minutes', 45, 'cents', 3500),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000006c2', 'kind', 'service', 'serviceId', '00000000-0000-0000-0000-0000000006e2', 'name', 'Deluxe pedi', 'minutes', 60, 'cents', 5500))) as p;
grant all on t_tk to authenticated;
insert into t_out select 'first', public.save_ticket(p) from t_tk;
insert into t_out select 'again', public.save_ticket(p) from t_tk;

-- cash before every service has staff: refused
do $$ begin perform public.save_ticket((select p from t_tk) || jsonb_build_object('payment', jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'givenCents', 10000)));
  raise exception 'FAIL: paid without staff'; exception when others then if sqlerrm not like '%needs a staff%' then raise; end if; end $$;
update t_tk set p = jsonb_set(p, '{lines,1,staffId}', '"00000000-0000-0000-0000-00000000067f"');

-- discount without approval: refused
do $$ begin perform public.save_ticket(jsonb_set((select p from t_tk), '{lines,2}', jsonb_build_object('id', gen_random_uuid(), 'kind', 'discount', 'name', 'Regular', 'cents', -500)));
  raise exception 'FAIL: discount without PIN'; exception when others then if sqlerrm not like '%manager PIN%' then raise; end if; end $$;
-- owner approves on own login → discount $5, tip $18 for Kim
insert into t_out values ('approval', public.approve_discount('00000000-0000-0000-0000-0000000006a1'));
update t_tk set p = jsonb_set(jsonb_set(p, '{lines,2}', jsonb_build_object('id', '00000000-0000-0000-0000-0000000006c3', 'kind', 'discount', 'name', 'Regular client', 'cents', -500,
  'approvalId', (select v->>'approval_id' from t_out where k = 'approval'))), '{lines,3}',
  jsonb_build_object('id', '00000000-0000-0000-0000-0000000006c4', 'kind', 'tip', 'staffId', '00000000-0000-0000-0000-00000000067f', 'name', 'Cash tip', 'cents', 1800));

-- short cash: refused
do $$ begin perform public.save_ticket((select p from t_tk) || jsonb_build_object('payment', jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'givenCents', 10000)));
  raise exception 'FAIL: short cash accepted'; exception when others then if sqlerrm not like '%less than the total%' then raise; end if; end $$;
-- pay $120 cash: total 90 - 5 + 18 = 103, change 17. Sent twice (offline retry) = one payment.
update t_tk set p = p || jsonb_build_object('payment', jsonb_build_object('id', '00000000-0000-0000-0000-0000000006d1', 'method', 'cash', 'givenCents', 12000));
insert into t_out select 'paid', public.save_ticket(p) from t_tk;
insert into t_out select 'paid_again', public.save_ticket(p) from t_tk;
-- edit after paid: ignored
insert into t_out select 'edit_after', public.save_ticket(jsonb_set(p, '{lines,0,cents}', '1')) from t_tk;
insert into t_out values ('ticket', (select to_jsonb(t) from public.tickets t where id = '00000000-0000-0000-0000-0000000006b1'));
insert into t_out values ('payments', (select jsonb_agg(to_jsonb(x)) from public.payments x where ticket_id = '00000000-0000-0000-0000-0000000006b1'));
insert into t_out values ('lines', (select to_jsonb(count(*)) from public.ticket_lines where ticket_id = '00000000-0000-0000-0000-0000000006b1' and removed_at is null));
insert into t_out values ('client', (select to_jsonb(c) from public.client_lookup('00000000-0000-0000-0000-0000000006a1', '+14085559999') c));
insert into t_out values ('staff', (select jsonb_agg(to_jsonb(s)) from public.desk_staff('00000000-0000-0000-0000-0000000006a1') s where s.role = 'tech'));
select public.log_receipt('00000000-0000-0000-0000-0000000006f1', '00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000006b1', 'text', '+14085559999');
select public.log_receipt('00000000-0000-0000-0000-0000000006f1', '00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000006b1', 'text', '+14085559999');
insert into t_out values ('receipts', (select to_jsonb(count(*)) from public.receipts where ticket_id = '00000000-0000-0000-0000-0000000006b1'));

-- tech signs in: can read but can't save tickets
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb02","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin perform public.save_ticket(jsonb_build_object('id', gen_random_uuid(), 'salonId', '00000000-0000-0000-0000-0000000006a1'));
  raise exception 'FAIL: tech saved a ticket'; exception when others then if sqlerrm not like '%not allowed%' then raise; end if; end $$;

-- stranger: sees nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bb03","role":"authenticated"}', true);
insert into t_out values ('stranger', (select to_jsonb(count(*)) from public.tickets where salon_id = '00000000-0000-0000-0000-0000000006a1'));
insert into t_out values ('stranger_lookup', (select to_jsonb(count(*)) from public.client_lookup('00000000-0000-0000-0000-0000000006a1', '+14085559999')));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->'first'->>'number' <> '1001' or o->'again'->>'number' <> '1001' then raise exception 'FAIL numbers: % %', o->'first', o->'again'; end if;
  if o->'paid'->>'status' <> 'paid' or o->'edit_after'->>'status' <> 'paid' then raise exception 'FAIL status: %', o->'paid'; end if;
  if (o->'ticket'->>'subtotal_cents')::int <> 9000 or (o->'ticket'->>'discount_cents')::int <> 500
     or (o->'ticket'->>'tip_cents')::int <> 1800 or (o->'ticket'->>'total_cents')::int <> 10300 then raise exception 'FAIL totals: %', o->'ticket'; end if;
  if jsonb_array_length(o->'payments') <> 1 or (o->'payments'->0->>'change_cents')::int <> 1700 then raise exception 'FAIL payment: %', o->'payments'; end if;
  if (o->>'lines')::int <> 4 then raise exception 'FAIL lines: %', o->'lines'; end if;
  if (o->'client'->>'visits')::int <> 1 or (o->'client'->>'avg_cents')::int <> 8500 or o->'client'->>'name' <> 'Lan' then raise exception 'FAIL client: %', o->'client'; end if;
  if (o->'staff'->0->>'turns_today')::int <> 1 or (o->'staff'->0->>'cents_today')::int <> 9000 then raise exception 'FAIL staff facts: %', o->'staff'; end if;
  if (o->>'receipts')::int <> 1 then raise exception 'FAIL receipts: %', o->'receipts'; end if;
  if (o->>'stranger')::int <> 0 or (o->>'stranger_lookup')::int <> 0 then raise exception 'FAIL salon wall'; end if;
  raise notice 'PASS session2_checkout';
end $$;
rollback;
