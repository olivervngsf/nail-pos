-- Invite-only salons (Nov 17). Rolls back.
-- Non-admins can't make salons or see the admin list; admin makes salon + owner invite; owner who signs in with a matching
-- verified email (Google) gets the salon without a code; a different login can join with the code; codes are single-use.
begin;
insert into auth.users (id, phone, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', '14085550901', null, null, 'authenticated', 'authenticated'),                     -- platform admin
  ('00000000-0000-0000-0000-0000000000b1', null, 'mai@example.com', now(), 'authenticated', 'authenticated'),                -- owner, Google
  ('00000000-0000-0000-0000-0000000000b2', null, 'kim@example.com', now(), 'authenticated', 'authenticated'),                -- owner 2, other Gmail + code
  ('00000000-0000-0000-0000-0000000000b3', '14085550904', null, null, 'authenticated', 'authenticated'),                     -- stranger
  ('00000000-0000-0000-0000-0000000000b4', null, 'lan@example.com', null, 'authenticated', 'authenticated');                -- unverified email
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-0000000000a1');
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to authenticated;

set local role authenticated;
-- 1. stranger: no salon making, no admin list
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
do $$ begin
  begin perform public.admin_create_salon('X', 'CA', 'X', '+14085550999'); raise exception 'FAIL: stranger made a salon';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.save_setup(jsonb_build_object('salonId', gen_random_uuid(), 'ownerName', 'X', 'salonName', 'Self Serve'));
    raise exception 'FAIL: self-serve salon';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  if (select count(*) from public.admin_salons()) <> 0 then raise exception 'FAIL: stranger sees admin list'; end if;
end $$;

-- 2. admin makes two salons
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into t_out values ('s1', public.admin_create_salon('Mai Nails', 'CA', 'Mai', '+14085550911', 'Mai@Example.com'));
insert into t_out values ('s2', public.admin_create_salon('Kim Nails', 'TX', 'Kim', '+14085550912', 'kim-owner@example.com'));
do $$ begin
  if (select count(*) from public.admin_salons() where salon_name in ('Mai Nails', 'Kim Nails') and not owner_joined and code is not null) <> 2
  then raise exception 'FAIL: admin list'; end if;
  if length((select v->>'code' from t_out where k = 's1')) <> 8 then raise exception 'FAIL: code length'; end if;
end $$;

-- 3. owner signs in with Google (matching verified email): salon attaches, no code
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  if public.claim_memberships() <> 1 then raise exception 'FAIL: email claim'; end if;
  if (select count(*) from public.my_memberships() where salon_name = 'Mai Nails' and role = 'owner') <> 1 then raise exception 'FAIL: owner sees salon'; end if;
  if (select status from public.get_invite((select v->>'code' from t_out where k = 's1'))) <> 'used' then raise exception 'FAIL: invite not used'; end if;
end $$;

-- 4. unverified email never matches
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
do $$ begin if public.claim_memberships() <> 0 then raise exception 'FAIL: unverified email claimed'; end if; end $$;

-- 5. owner 2 signed in with a different Gmail: typed code (with a dash) works once
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ declare c text := (select v->>'code' from t_out where k = 's2'); begin
  if public.claim_memberships() <> 0 then raise exception 'FAIL: wrong email claimed'; end if;
  if public.redeem_invite(left(c, 4) || '-' || lower(right(c, 4))) is null then raise exception 'FAIL: redeem'; end if;
  if (select count(*) from public.my_memberships() where salon_name = 'Kim Nails') <> 1 then raise exception 'FAIL: owner 2 sees salon'; end if;
end $$;
-- the same code can't be used by someone else
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
do $$ begin
  begin perform public.redeem_invite((select v->>'code' from t_out where k = 's2')); raise exception 'FAIL: code reused';
  exception when raise_exception then if sqlerrm not like 'invite used%' then raise; end if; end;
  if (select count(*) from public.my_memberships()) <> 0 then raise exception 'FAIL: stranger got a salon'; end if;
  raise notice 'PASS session11_invites';
end $$;
rollback;
