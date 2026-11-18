-- Review fixes (Nov 17) in SQL. Rolls back.
-- PIN hash hidden; manager can't touch the owner; phone can't be changed or taken over; tech on own phone can't try PINs;
-- discount OK can't be reused on another ticket; refund OK is single-use; techs can't read tickets/payments;
-- a ticket change cancels a waiting card try; card money for a cancelled try is recorded as 'extra', not lost.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000cc01', '14085550301', 'authenticated', 'authenticated'),  -- owner Mai
  ('00000000-0000-0000-0000-00000000cc02', '14085550302', 'authenticated', 'authenticated'),  -- manager Hoa
  ('00000000-0000-0000-0000-00000000cc03', '14085550303', 'authenticated', 'authenticated'),  -- tech Kim
  ('00000000-0000-0000-0000-00000000cc04', '14085550304', 'authenticated', 'authenticated'),  -- invited front desk (victim)
  ('00000000-0000-0000-0000-00000000cc05', '14085550305', 'authenticated', 'authenticated');  -- attacker
create temp table t_out (k text primary key, v jsonb);

-- Salons are invite-only (Nov 17): test users may create salons like a platform admin.
insert into public.platform_admins (auth_user_id) select id from auth.users where id::text like '00000000-0000-0000-0000-%' on conflict do nothing;
grant all on t_out to authenticated, anon, service_role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object(
  'salonId', '00000000-0000-0000-0000-0000000007a1', 'ownerName', 'Mai', 'salonName', 'Review Nails', 'state', 'CA', 'step', 9,
  'services', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007e1', 'cat', 'Gel', 'name', 'Gel mani', 'minutes', 45, 'priceCents', 4000, 'on', true)),
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007f2', 'name', 'Hoa', 'phone', '+14085550302', 'role', 'manager'),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007f3', 'name', 'Kim', 'phone', '+14085550303', 'role', 'tech'),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007f4', 'name', 'Lan', 'phone', '+14085550304', 'role', 'front_desk'))));
select public.set_my_pin('00000000-0000-0000-0000-0000000007a1', '258013');
insert into t_out values ('device', to_jsonb(public.register_device('00000000-0000-0000-0000-0000000007a1', 'Front desk iPad')));
insert into t_out values ('owner_ms', to_jsonb((select id from public.memberships where salon_id = '00000000-0000-0000-0000-0000000007a1' and role = 'owner')));

-- manager + tech join
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc02","role":"authenticated"}', true);
select public.claim_memberships();
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc03","role":"authenticated"}', true);
select public.claim_memberships();

-- 1. tech: can read names, not PIN hashes; can't try PINs from own phone; can't read tickets or clients
do $$ declare n int; begin
  select count(*) into n from public.memberships where salon_id = '00000000-0000-0000-0000-0000000007a1';
  if n <> 4 then raise exception 'FAIL: tech should see the team (got %)', n; end if;
  begin perform pin_hash from public.memberships limit 1; raise exception 'FAIL: tech read pin_hash';
  exception when insufficient_privilege then null; end;
  begin perform pin_fails from public.memberships limit 1; raise exception 'FAIL: tech read pin_fails';
  exception when insufficient_privilege then null; end;
  if (public.pin_unlock((select (v #>> '{}')::uuid from t_out where k = 'device'), (select (v #>> '{}')::uuid from t_out where k = 'owner_ms'), '258013'))->>'reason' <> 'device'
  then raise exception 'FAIL: tech tried a PIN from own phone'; end if;
end $$;

-- 2. manager can't edit, archive or create an owner
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc02","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.memberships set archived_at = now() where role = 'owner' and salon_id = '00000000-0000-0000-0000-0000000007a1';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: manager archived the owner'; end if;
  begin update public.memberships set role = 'owner' where id = '00000000-0000-0000-0000-0000000007f3'; raise exception 'FAIL: manager made an owner';
  exception when insufficient_privilege or check_violation then null; end;
  begin insert into public.memberships (salon_id, display_name, phone, role) values ('00000000-0000-0000-0000-0000000007a1', 'X', '+14085550399', 'owner');
    raise exception 'FAIL: manager added an owner'; exception when insufficient_privilege then null; end;
  begin update public.memberships set pin_hash = 'x' where id = '00000000-0000-0000-0000-0000000007f3'; raise exception 'FAIL: wrote pin_hash directly';
  exception when insufficient_privilege then null; end;
  -- normal edit still works
  update public.memberships set display_name = 'Kim T' where id = '00000000-0000-0000-0000-0000000007f3';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL: manager can''t edit a tech'; end if;
end $$;

-- 3. phone can't be changed by the person; an account can't take over another's phone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc05","role":"authenticated"}', true);
select public.create_salon('Attacker Nails', 'CA', 'Bad', '+14085550304');  -- tries to claim the invited front desk's phone
insert into t_out values ('attacker_phone', to_jsonb((select phone from public.people where auth_user_id = '00000000-0000-0000-0000-00000000cc05')));
do $$ begin
  update public.people set phone = '+14085550304' where auth_user_id = '00000000-0000-0000-0000-00000000cc05';
  raise exception 'FAIL: changed own phone';
exception when insufficient_privilege then null; end $$;
reset role;
-- even if a row somehow held the phone, the real owner of the phone is refused, not merged into it
update public.people set phone = '+14085550304' where auth_user_id = '00000000-0000-0000-0000-00000000cc05';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc04","role":"authenticated"}', true);
do $$ begin perform public.claim_memberships(); raise exception 'FAIL: took over another account';
exception when others then if sqlerrm not like '%belongs to another account%' then raise; end if; end $$;
reset role;
insert into t_out values ('front_desk_claimed', to_jsonb((select person_id is not null from public.memberships where id = '00000000-0000-0000-0000-0000000007f4')));
update public.people set phone = '+14085550305' where auth_user_id = '00000000-0000-0000-0000-00000000cc05';
set local role authenticated;

-- 4. owner on the desk: discount OK binds to one ticket
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc01","role":"authenticated"}', true);
insert into t_out values ('ok1', public.approve_discount('00000000-0000-0000-0000-0000000007a1'));
create temp table t_tk as select jsonb_build_object('id', '00000000-0000-0000-0000-0000000007b1', 'salonId', '00000000-0000-0000-0000-0000000007a1',
  'client', jsonb_build_object('phone', '+14085559998', 'name', 'Vy'),
  'lines', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007c1', 'kind', 'service', 'serviceId', '00000000-0000-0000-0000-0000000007e1', 'staffId', '00000000-0000-0000-0000-0000000007f3', 'name', 'Gel mani', 'minutes', 45, 'cents', 4000),
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000007c2', 'kind', 'discount', 'name', 'Regular', 'cents', -500,
      'approvalId', (select v->>'approval_id' from t_out where k = 'ok1')))) as p;
grant all on t_tk to authenticated, service_role;
select public.save_ticket(p) from t_tk;
select public.save_ticket(p) from t_tk;  -- same ticket again: fine
do $$ begin
  perform public.save_ticket(jsonb_set((select p from t_tk), '{id}', '"00000000-0000-0000-0000-0000000007b2"')
    #- '{lines,0}' || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'kind', 'discount', 'name', 'Reuse', 'cents', -500,
      'approvalId', (select v->>'approval_id' from t_out where k = 'ok1')))));
  raise exception 'FAIL: discount OK reused on another ticket';
exception when others then if sqlerrm not like '%manager PIN%' then raise; end if; end $$;

-- 5. card try for $35 waiting; desk adds $5 more → try cancelled
reset role;
insert into public.pay_requests (id, salon_id, ticket_id, method, amount_cents, status) values
  ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', 'pay_link', 3500, 'pending');
set local role authenticated;
select public.save_ticket(jsonb_set(p, '{lines,0,cents}', '4500')) from t_tk;
reset role;
insert into t_out values ('pr_after_change', to_jsonb((select status from public.pay_requests where id = '00000000-0000-0000-0000-0000000007d1')));
-- client pays the old $35 link anyway → recorded as extra, ticket stays open
set local role service_role;
insert into t_out values ('late', public.settle_card(jsonb_build_object('payRequestId', '00000000-0000-0000-0000-0000000007d1', 'paymentIntent', 'pi_late', 'amountCents', 3500, 'tipCents', 0)));
insert into t_out values ('late_again', public.settle_card(jsonb_build_object('payRequestId', '00000000-0000-0000-0000-0000000007d1', 'paymentIntent', 'pi_late', 'amountCents', 3500, 'tipCents', 0)));
reset role;
insert into t_out values ('late_payments', (select jsonb_agg(jsonb_build_object('status', status, 'amount', amount_cents)) from public.payments where ticket_id = '00000000-0000-0000-0000-0000000007b1'));
insert into t_out values ('ticket_after_late', to_jsonb((select status from public.tickets where id = '00000000-0000-0000-0000-0000000007b1')));
-- new try for the right amount ($40) → paid, with a stray cash tip line replaced by the card tip
insert into public.pay_requests (id, salon_id, ticket_id, method, amount_cents, status, created_by) values
  ('00000000-0000-0000-0000-0000000007d2', '00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', 'card_reader', 4000, 'pending', null);
insert into public.ticket_lines (id, salon_id, ticket_id, kind, staff_id, name, amount_cents) values
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', 'tip', '00000000-0000-0000-0000-0000000007f3', 'Cash tip', 700);
set local role service_role;
insert into t_out values ('paid', public.settle_card(jsonb_build_object('payRequestId', '00000000-0000-0000-0000-0000000007d2', 'paymentIntent', 'pi_ok', 'amountCents', 4800, 'tipCents', 800,
  'tips', jsonb_build_array(jsonb_build_object('staffId', '00000000-0000-0000-0000-0000000007f3', 'cents', 800)))));
reset role;
insert into t_out values ('ticket_paid', (select to_jsonb(t) from public.tickets t where id = '00000000-0000-0000-0000-0000000007b1'));

-- 6. refund OK: tied to the ticket, used once
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc01","role":"authenticated"}', true);
insert into t_out values ('rok', public.approve_discount('00000000-0000-0000-0000-0000000007a1', null, null, null, 'refund', '00000000-0000-0000-0000-0000000007b1'));
do $$ begin perform public.use_refund_ok((select (v->>'approval_id')::uuid from t_out where k = 'rok'), '00000000-0000-0000-0000-0000000007b1');
  raise exception 'FAIL: signed-in user used a refund OK directly'; exception when insufficient_privilege then null; end $$;
reset role;
set local role service_role;
insert into t_out values ('use1', to_jsonb(public.use_refund_ok((select (v->>'approval_id')::uuid from t_out where k = 'rok'), '00000000-0000-0000-0000-0000000007b1')));
insert into t_out values ('use2', to_jsonb(public.use_refund_ok((select (v->>'approval_id')::uuid from t_out where k = 'rok'), '00000000-0000-0000-0000-0000000007b1')));
insert into t_out values ('use_discount_ok', to_jsonb(public.use_refund_ok((select (v->>'approval_id')::uuid from t_out where k = 'ok1'), '00000000-0000-0000-0000-0000000007b1')));
reset role;

-- 7. tech reads no money data (client profiles stay readable through the client functions, by M6 design); owner does
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc03","role":"authenticated"}', true);
insert into t_out values ('tech_reads', jsonb_build_array(
  (select count(*) from public.tickets), (select count(*) from public.payments), (select count(*) from public.ticket_lines),
  (select count(*) from public.pay_requests), (select count(*) from public.discount_approvals), (select count(*) from public.services)));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cc01","role":"authenticated"}', true);
insert into t_out values ('owner_reads', jsonb_build_array((select count(*) from public.tickets), (select count(*) from public.clients)));
reset role;

do $$
declare o jsonb := (select jsonb_object_agg(k, v) from t_out);
begin
  if o->>'attacker_phone' <> '+14085550305' then raise exception 'FAIL: salon owner phone not from sign-in: %', o->'attacker_phone'; end if;
  if (o->>'front_desk_claimed')::boolean then raise exception 'FAIL: seat claimed during takeover attempt'; end if;
  if o->>'pr_after_change' <> 'canceled' then raise exception 'FAIL: try not cancelled after ticket change: %', o->'pr_after_change'; end if;
  if not (o->'late'->>'extra')::boolean or not (o->'late_again'->>'already')::boolean then raise exception 'FAIL late: % %', o->'late', o->'late_again'; end if;
  if o->>'ticket_after_late' <> 'open' then raise exception 'FAIL: late money paid the changed ticket'; end if;
  if o->'late_payments' <> '[{"amount": 3500, "status": "extra"}]'::jsonb then raise exception 'FAIL late payments: %', o->'late_payments'; end if;
  if o->'paid'->>'status' <> 'paid' or o->'ticket_paid'->>'status' <> 'paid' or (o->'ticket_paid'->>'tip_cents')::int <> 800
     or (o->'ticket_paid'->>'total_cents')::int <> 4800 then raise exception 'FAIL card paid: % %', o->'paid', o->'ticket_paid'; end if;
  if o->>'use1' is null or o->'use1' = 'null'::jsonb or o->'use2' <> 'null'::jsonb or o->'use_discount_ok' <> 'null'::jsonb
  then raise exception 'FAIL refund OK: % % %', o->'use1', o->'use2', o->'use_discount_ok'; end if;
  if o->'tech_reads' <> '[0,0,0,0,0,1]'::jsonb then raise exception 'FAIL tech reads: %', o->'tech_reads'; end if;
  if o->'owner_reads' <> '[1,1]'::jsonb then raise exception 'FAIL owner reads: %', o->'owner_reads'; end if;
  raise notice 'PASS review_fixes';
end $$;
rollback;
