-- Client pay page layout: every salon starts on 'receipt'; the owner can switch to 'quick' (logged); a tech can read it
-- but not change it; a made-up layout is refused; pay_requests.tip_split only takes 'service' or 'even'. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fc01', '14085550811', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fc02', '14085550812', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v text);
grant all on t_out to authenticated, anon;
create function pg_temp.try_save(k text, p_layout text) returns void language plpgsql as $$
begin
  insert into t_out values (k, public.pay_layout_save('00000000-0000-0000-0000-0000000071a1', p_layout));
exception when others then
  insert into t_out values (k, 'ERR ' || sqlerrm);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) select id from auth.users where id = '00000000-0000-0000-0000-00000000fc01' on conflict do nothing;  -- salons are invite-only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000071a1', 'ownerName', 'Mai', 'salonName', 'Layout Nails', 'state', 'CA', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000717f', 'name', 'Kim', 'phone', '+14085550812', 'role', 'tech'))));

insert into t_out values ('start', public.pay_layout_get('00000000-0000-0000-0000-0000000071a1'));
select pg_temp.try_save('bad', 'fancy');
select pg_temp.try_save('quick', 'quick');
insert into t_out values ('after', public.pay_layout_get('00000000-0000-0000-0000-0000000071a1'));

-- Kim (tech, own login): reads it, can't change it
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fc02","role":"authenticated"}', true);
select public.claim_memberships();
insert into t_out values ('tech_reads', public.pay_layout_get('00000000-0000-0000-0000-0000000071a1'));
select pg_temp.try_save('tech_save', 'receipt');
reset role;

do $$
declare ok boolean;
begin
  if (select v from t_out where k = 'start') <> 'receipt' then raise exception 'FAIL a new salon should start on receipt: %', (select v from t_out where k = 'start'); end if;
  if (select v from t_out where k = 'bad') not like 'ERR%bad layout%' then raise exception 'FAIL a made-up layout was accepted: %', (select v from t_out where k = 'bad'); end if;
  if (select v from t_out where k = 'quick') <> 'quick' or (select v from t_out where k = 'after') <> 'quick' then raise exception 'FAIL owner could not switch to quick'; end if;
  if (select v from t_out where k = 'tech_reads') <> 'quick' then raise exception 'FAIL a tech should be able to read the layout'; end if;
  if (select v from t_out where k = 'tech_save') not like 'ERR%not allowed%' then raise exception 'FAIL a tech changed the layout: %', (select v from t_out where k = 'tech_save'); end if;
  if (select pay_layout from public.salons where id = '00000000-0000-0000-0000-0000000071a1') <> 'quick' then raise exception 'FAIL the tech''s try changed the salon'; end if;
  if (select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000071a1' and action = 'pay_layout.saved') <> 1 then raise exception 'FAIL the change should be logged once'; end if;
  ok := exists (select 1 from pg_constraint where conrelid = 'public.pay_requests'::regclass and pg_get_constraintdef(oid) like '%tip_split%even%');
  if not ok then raise exception 'FAIL pay_requests.tip_split has no check'; end if;
  raise notice 'OK pay_layout';
end $$;
rollback;
