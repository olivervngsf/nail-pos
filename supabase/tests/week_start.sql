-- Week starts on: default Monday; owner switches to Sunday (logged once); a tech reads but can't change; bad day refused. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000ae01', '14085550861', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ae02', '14085550862', 'authenticated', 'authenticated');
create temp table t_out (k text primary key, v text);
grant all on t_out to authenticated, anon;
create function pg_temp.try(k text, q text) returns void language plpgsql as $$
declare r text;
begin
  execute q into r;
  insert into t_out values (k, coalesce(r, 'ok'));
exception when others then
  insert into t_out values (k, 'ERR ' || sqlerrm);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.platform_admins (auth_user_id) select id from auth.users where id = '00000000-0000-0000-0000-00000000ae01' on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000075a1', 'ownerName', 'Mai', 'salonName', 'Week Nails', 'state', 'TX', 'step', 9,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000757f', 'name', 'Kim', 'phone', '+14085550862', 'role', 'tech'))));

select pg_temp.try('default', $q$select public.week_start_get('00000000-0000-0000-0000-0000000075a1')::text$q$);
select pg_temp.try('sunday', $q$select public.week_start_save('00000000-0000-0000-0000-0000000075a1', 0)::text$q$);
select pg_temp.try('again', $q$select public.week_start_save('00000000-0000-0000-0000-0000000075a1', 0)::text$q$);
select pg_temp.try('bad', $q$select public.week_start_save('00000000-0000-0000-0000-0000000075a1', 3)::text$q$);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ae02","role":"authenticated"}', true);
select public.claim_memberships();
select pg_temp.try('tech_read', $q$select public.week_start_get('00000000-0000-0000-0000-0000000075a1')::text$q$);
select pg_temp.try('tech_save', $q$select public.week_start_save('00000000-0000-0000-0000-0000000075a1', 1)::text$q$);
reset role;

do $$
declare v text; n int;
begin
  select t.v into v from t_out t where k = 'default'; if v <> '1' then raise exception 'default should be Monday, got %', v; end if;
  select t.v into v from t_out t where k = 'sunday'; if v <> '0' then raise exception 'owner save failed: %', v; end if;
  select t.v into v from t_out t where k = 'bad'; if v not like 'ERR%' then raise exception 'bad day saved'; end if;
  select t.v into v from t_out t where k = 'tech_read'; if v <> '0' then raise exception 'tech read: %', v; end if;
  select t.v into v from t_out t where k = 'tech_save'; if v not like 'ERR%not allowed%' then raise exception 'tech could save: %', v; end if;
  select count(*) into n from public.audit_log where salon_id = '00000000-0000-0000-0000-0000000075a1' and action = 'salon.week_start';
  if n <> 1 then raise exception 'expected 1 log row, got %', n; end if;
  raise notice 'week_start: all checks passed';
end $$;
rollback;
