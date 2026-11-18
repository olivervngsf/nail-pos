-- Founder Admin health + salon page (migrations admin_health, admin_salon, admin_notes_private, admin_plan_texting): admins see totals, handle alerts, write call notes;
-- non-admins (incl. the salon's own owner) can't call the admin functions, and owners never see our call notes. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ae01', '14085550911', 'authenticated', 'authenticated'),  -- platform admin
  ('00000000-0000-0000-0000-00000000ae02', '14085550912', 'authenticated', 'authenticated');  -- salon owner
insert into public.platform_admins (auth_user_id, note) values ('00000000-0000-0000-0000-00000000ae01', 'test admin');
insert into public.people (auth_user_id, phone, name) values ('00000000-0000-0000-0000-00000000ae01', '+14085550911', 'Admin Test');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated, anon;

set local role authenticated;

-- admin adds a salon, then the owner claims it
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
insert into t_out select 'made', public.admin_create_salon('Health Nails', 'CA', 'Hana Owner', '+14085550912');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated","phone":"14085550912"}', true);
select public.claim_memberships();

-- owner: admin functions refused
do $$ declare sid uuid := ((select v from t_out where k = 'made')->>'salon_id')::uuid; begin
  begin perform public.admin_health(); raise exception 'FAIL: admin_health for owner';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_salon(sid); raise exception 'FAIL: admin_salon for owner';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_note(sid, 'x'); raise exception 'FAIL: admin_note for owner';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_handle(sid, 'setup_stuck'); raise exception 'FAIL: admin_handle for owner';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_set_texting(sid, 'approved'); raise exception 'FAIL: admin_set_texting for owner';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.admin_salon_status) then raise exception 'FAIL: owner reads admin_salon_status'; end if;
end $$;

-- admin: sees the salon, handles an alert (once a day), writes a note that shows in the salon's activity
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
do $$ declare sid uuid := ((select v from t_out where k = 'made')->>'salon_id')::uuid; h jsonb; d jsonb; begin
  h := public.admin_health();
  if not exists (select 1 from jsonb_array_elements(h->'salons') x where (x->>'salon_id')::uuid = sid and (x->>'owner_joined')::boolean)
    then raise exception 'FAIL: salon missing or owner not joined in admin_health'; end if;
  perform public.admin_handle(sid, 'setup_stuck');
  perform public.admin_handle(sid, 'setup_stuck');
  h := public.admin_health();
  if (select count(*) from jsonb_array_elements(h->'handled') x where (x->>'salon_id')::uuid = sid) <> 1 then raise exception 'FAIL: handled not once'; end if;
  -- plan + texting (migration 20261219000001_admin_plan_texting): no plan yet, texting set by an admin, date kept when the status stays the same
  if not exists (select 1 from jsonb_array_elements(h->'salons') x where (x->>'salon_id')::uuid = sid and x->>'plan_status' = 'none' and x->>'texting' = 'not_started')
    then raise exception 'FAIL: plan/texting defaults'; end if;
  perform public.admin_set_texting(sid, 'waiting');
end $$;
-- backdate as the database owner (the app can't touch admin_salon_status), then the same status again must keep the date
reset role;
update public.admin_salon_status set texting_at = now() - interval '9 days';
set local role authenticated;
do $$ declare sid uuid := ((select v from t_out where k = 'made')->>'salon_id')::uuid; h jsonb; d jsonb; begin
  perform public.admin_set_texting(sid, 'waiting');
  h := public.admin_health();
  if not exists (select 1 from jsonb_array_elements(h->'salons') x where (x->>'salon_id')::uuid = sid and x->>'texting' = 'waiting'
    and (x->>'texting_at')::timestamptz < now() - interval '8 days') then raise exception 'FAIL: texting waiting / date reset'; end if;
  begin perform public.admin_set_texting(sid, 'maybe'); raise exception 'FAIL: bad texting status';
  exception when invalid_parameter_value then null; end;
  perform public.admin_note(sid, 'Called Hana, all good');
  d := public.admin_salon(sid);
  if not exists (select 1 from jsonb_array_elements(d->'activity') x where x->>'action' = 'admin.note' and x->>'note' = 'Called Hana, all good' and x->>'who' = 'Admin Test')
    then raise exception 'FAIL: note not in activity: %', d->'activity'; end if;
  if not exists (select 1 from jsonb_array_elements(d->'activity') x where x->>'action' = 'admin.alert_handled') then raise exception 'FAIL: handled not in activity'; end if;
end $$;

-- owner: sees "alert handled" in their own log, never our note text
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated","phone":"14085550912"}', true);
do $$ declare sid uuid := ((select v from t_out where k = 'made')->>'salon_id')::uuid; begin
  if not exists (select 1 from public.audit_log where salon_id = sid and action = 'admin.alert_handled') then raise exception 'FAIL: owner cannot see handled'; end if;
  if exists (select 1 from public.audit_log where salon_id = sid and detail::text like '%Called Hana%') then raise exception 'FAIL: note leaked to audit_log'; end if;
  if exists (select 1 from public.admin_notes) then raise exception 'FAIL: owner reads admin_notes'; end if;
end $$;

select 'PASS: admin health + salon page' as result;
rollback;
