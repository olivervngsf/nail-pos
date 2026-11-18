-- Data-wall test: salon A's owner can't see salon B, and logged-out visitors see nothing.
-- Runs inside one transaction and rolls back, so it leaves no data. Run: npm run test:rls (needs DATABASE_URL).
begin;

insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', '14085550001', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', '14085550002', 'authenticated', 'authenticated');

create temp table wall_ids (who text primary key, salon uuid);
grant all on wall_ids to authenticated, anon;

insert into public.platform_admins (auth_user_id) select id from auth.users on conflict do nothing;  -- salons are invite-only: test owners set up salons as platform admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into wall_ids values ('a', public.create_salon('Salon A', 'CA', 'Owner A', '+14085550001'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into wall_ids values ('b', public.create_salon('Salon B', 'TX', 'Owner B', '+14085550002'));

do $$
declare n int; a uuid := (select salon from wall_ids where who = 'a'); b uuid := (select salon from wall_ids where who = 'b');
begin
  -- signed in as owner B
  select count(*) into n from public.salons where id = a;            if n <> 0 then raise exception 'FAIL: B sees salon A'; end if;
  select count(*) into n from public.salons where id = b;            if n <> 1 then raise exception 'FAIL: B cannot see own salon'; end if;
  select count(*) into n from public.memberships where salon_id = a; if n <> 0 then raise exception 'FAIL: B sees A staff'; end if;
  select count(*) into n from public.people where name = 'Owner A'; if n <> 0 then raise exception 'FAIL: B sees person A'; end if;
  select count(*) into n from public.audit_log where salon_id = a;   if n <> 0 then raise exception 'FAIL: B sees A audit log'; end if;
  begin
    insert into public.services (salon_id, category, name, minutes, price_cents) values (a, 'Hack', 'x', 10, 100);
    raise exception 'FAIL: B wrote into salon A';
  exception when insufficient_privilege then null; -- refused by RLS: good
  end;
  begin
    insert into public.audit_log (salon_id, action) values (b, 'forged');
    raise exception 'FAIL: device wrote audit log directly';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.salons;  if n <> 0 then raise exception 'FAIL: logged-out visitor sees salons'; end if;
  select count(*) into n from public.people;  if n <> 0 then raise exception 'FAIL: logged-out visitor sees people'; end if;
end $$;

reset role;
select 'PASS: salon wall holds' as result;
rollback;
