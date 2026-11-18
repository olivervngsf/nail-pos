-- Text credit in SQL: balance = ledger sum; owner adds (once per request id), manager sees but can't add, tech sees nothing,
-- another salon sees nothing; a promo send takes people × parts × 2¢ all-or-nothing; settings save. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fc01', '14085552001', 'authenticated', 'authenticated'),   -- owner
  ('00000000-0000-0000-0000-00000000fc02', '14085552002', 'authenticated', 'authenticated'),   -- manager
  ('00000000-0000-0000-0000-00000000fc03', '14085552003', 'authenticated', 'authenticated'),   -- tech
  ('00000000-0000-0000-0000-00000000fc04', '14085552004', 'authenticated', 'authenticated');   -- other salon's owner
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
-- Salons are made by invite on the test project: let this test make its own (rolled back).
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'no_self_serve_salon') then alter table public.salons disable trigger no_self_serve_salon; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000060a1', 'ownerName', 'Mai', 'salonName', 'Credit Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000607a', 'name', 'Linh', 'phone', '+14085552002', 'role', 'manager'),
    jsonb_build_object('id', '00000000-0000-0000-0000-00000000607b', 'name', 'Kim', 'phone', '+14085552003', 'role', 'tech'))));
insert into t_out values ('empty', public.text_credit_get('00000000-0000-0000-0000-0000000060a1'));
select public.text_credit_add('00000000-0000-0000-0000-0000000060a1', 2500, 'req-0000-1');
insert into t_out values ('twice', public.text_credit_add('00000000-0000-0000-0000-0000000060a1', 2500, 'req-0000-1'));   -- same request: once
do $$ begin perform public.text_credit_add('00000000-0000-0000-0000-0000000060a1', 100, 'req-0000-2');
  raise exception 'FAIL: under $5'; exception when others then if sqlerrm not like '%$5 to $500%' then raise; end if; end $$;
insert into t_out values ('saved', public.text_credit_settings_save('00000000-0000-0000-0000-0000000060a1', '{"warnPct": 30, "autoAddOn": false}'));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('mgr', public.text_credit_get('00000000-0000-0000-0000-0000000060a1'));
do $$ begin perform public.text_credit_add('00000000-0000-0000-0000-0000000060a1', 1000, 'req-0000-3');
  raise exception 'FAIL: manager added'; exception when others then if sqlerrm not like '%only the owner%' then raise; end if; end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc03","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('tech', coalesce(public.text_credit_get('00000000-0000-0000-0000-0000000060a1'), 'null'::jsonb));
insert into t_out values ('tech_rows', to_jsonb((select count(*) from public.text_credit_ledger)));
do $$ begin perform public._text_credit_spend('00000000-0000-0000-0000-0000000060a1', 1, 'x', null, 'req-0000-4');
  raise exception 'FAIL: app can spend'; exception when insufficient_privilege then null; end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc04","role":"authenticated"}', true);
insert into t_out values ('other', coalesce(public.text_credit_get('00000000-0000-0000-0000-0000000060a1'), 'null'::jsonb));
insert into t_out values ('other_rows', to_jsonb((select count(*) from public.text_credit_ledger)));
reset role;

-- server: promo send to 212 people × 2 parts = 424 texts = $8.48; then one that is too big is refused whole
insert into t_out values ('after_send', to_jsonb(public._text_credit_spend('00000000-0000-0000-0000-0000000060a1', 424, 'Holiday 15% off', null, 'send-0001')));
do $$ begin perform public._text_credit_spend('00000000-0000-0000-0000-0000000060a1', 1000, 'Too big', null, 'send-0002');
  raise exception 'FAIL: overspent'; exception when others then if sqlerrm not like '%not enough text credit%' then raise; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
insert into t_out values ('final', public.text_credit_get('00000000-0000-0000-0000-0000000060a1'));
reset role;

do $$ declare o jsonb := (select jsonb_object_agg(k, v) from t_out); begin
  if (o->'empty'->>'balanceCents')::int <> 0 or jsonb_array_length(o->'empty'->'rows') <> 0 then raise exception 'FAIL empty: %', o->'empty'; end if;
  if (o->'twice'->>'balanceCents')::int <> 2500 then raise exception 'FAIL add once per request: %', o->'twice'; end if;
  if (o->'saved'->>'warnPct')::int <> 30 then raise exception 'FAIL settings: %', o->'saved'; end if;
  if (o->'mgr'->>'balanceCents')::int <> 2500 then raise exception 'FAIL manager sees credit: %', o->'mgr'; end if;
  if o->'tech' <> 'null'::jsonb or (o->>'tech_rows')::int <> 0 then raise exception 'FAIL tech sees credit: % %', o->'tech', o->'tech_rows'; end if;
  if o->'other' <> 'null'::jsonb or (o->>'other_rows')::int <> 0 then raise exception 'FAIL salon wall: % %', o->'other', o->'other_rows'; end if;
  if (o->>'after_send')::int <> 1652 then raise exception 'FAIL send cost: %', o->'after_send'; end if;
  if (o->'final'->>'balanceCents')::int <> 1652 or (o->'final'->'lastSend'->>'cents')::int <> -848 or jsonb_array_length(o->'final'->'rows') <> 2
     or (o->'final'->'rows'->0->>'balanceCents')::int <> 1652 or (o->'final'->>'spentMonthCents')::int <> 848 then raise exception 'FAIL statement: %', o->'final'; end if;
  raise notice 'PASS text_credit';
end $$;
rollback;
