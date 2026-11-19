-- Founder Admin · System tab (migration admin_system): admins only; checks can be ticked; monthly costs set + removed;
-- Stripe messages counted (matched to a ticket or not); admins listed with 2-step. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000af01', '14085550931', 'authenticated', 'authenticated'),  -- platform admin
  ('00000000-0000-0000-0000-00000000af02', '14085550932', 'authenticated', 'authenticated');  -- someone else
insert into public.platform_admins (auth_user_id, note) values ('00000000-0000-0000-0000-00000000af01', 'Oliver');
insert into public.stripe_events (id, type, payload, received_at) values
  ('evt_t1', 'payment_intent.succeeded', '{}', now() - interval '2 hours'),
  ('evt_t2', 'account.updated', '{}', now() - interval '3 days');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;
set local role authenticated;

-- someone else: nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000af02","role":"authenticated"}', true);
do $$ begin
  begin perform public.admin_system(); raise exception 'FAIL: non-admin read System';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_check_set('backups', 'ok', ''); raise exception 'FAIL: non-admin ticked a check';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_cost_set(current_date, 'Vercel', 2000); raise exception 'FAIL: non-admin set a cost';
  exception when insufficient_privilege then null; end;
end $$;

-- admin: tick a check, set costs (one removed), read it all
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000af01","role":"authenticated"}', true);
select public.admin_check_set('restore_test', 'ok', 'restore test done, 2 min');
select public.admin_cost_set(current_date, 'Supabase', 2500);
select public.admin_cost_set(current_date, 'Vercel', 2000);
select public.admin_cost_set(current_date, 'Old tool', 900);
select public.admin_cost_set(current_date, 'Old tool', null);
select public.admin_cost_set(current_date, 'Supabase', 2600);   -- edit = same line
insert into t_out values ('sys', public.admin_system());
do $$ begin
  begin perform public.admin_check_set('nope', 'ok', ''); raise exception 'FAIL: unknown check accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;

do $$
declare o jsonb := (select v from t_out where k = 'sys'); c jsonb;
begin
  if (o->'stripe'->>'day')::int <> 1 or (o->'stripe'->>'week')::int <> 2 or (o->'stripe'->>'payWeek')::int <> 1 or (o->'stripe'->>'payMatched')::int <> 0
    then raise exception 'FAIL stripe counts: %', o->'stripe'; end if;
  if jsonb_array_length(o->'costs') <> 2 or (o->'costs'->0->>'cents')::int <> 2600 or o->'costs'->0->>'name' <> 'Supabase'
    then raise exception 'FAIL costs: %', o->'costs'; end if;
  select x into c from jsonb_array_elements(o->'checks') x where x->>'key' = 'restore_test';
  if c->>'status' <> 'ok' or c->>'note' <> 'restore test done, 2 min' or c->>'at' is null then raise exception 'FAIL check: %', c; end if;
  if not exists (select 1 from jsonb_array_elements(o->'admins') a where a->>'name' = 'Oliver' and a ? 'twoStep') then raise exception 'FAIL admins: %', o->'admins'; end if;
  raise notice 'PASS session16_admin_system';
end $$;
rollback;
