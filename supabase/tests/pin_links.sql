-- Personal PIN links: only the owner/manager makes one; only the person it is for (signed in with their own phone)
-- can use it; one use; a new link ends the older one; the anon page sees name, salon, last 4 and status only. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-00000000fd01', '14085550911', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fd02', '14085550912', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000fd03', '14085550913', 'authenticated', 'authenticated');
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-00000000fd01') on conflict do nothing;  -- salons are invite-only
create temp table l (n int, code text) on commit drop;
grant all on l to public;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-0000000081a1', 'ownerName', 'Mai', 'salonName', 'Pin Nails', 'state', 'CA', 'step', 2,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000817f', 'name', 'Kim', 'phone', '+14085550912', 'role', 'tech'))));
-- Kim signs in once (joins)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd02","role":"authenticated"}', true);
select public.claim_memberships();
-- Kim can't make links
do $$ begin perform public.pin_link_make('00000000-0000-0000-0000-00000000817f'); raise exception 'FAIL tech made a PIN link';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; end $$;
-- owner makes two links: the first one ends
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd01","role":"authenticated"}', true);
insert into l select 1, public.pin_link_make('00000000-0000-0000-0000-00000000817f');
insert into l select 2, public.pin_link_make('00000000-0000-0000-0000-00000000817f');
-- anon sees only the facts
reset role; set local role anon;
do $$ declare r record; begin
  select * into r from public.pin_link_get((select code from l where n = 2));
  if r.display_name <> 'Kim' or r.phone_last4 <> '0912' or r.status <> 'open' then raise exception 'FAIL pin_link_get %', row_to_json(r); end if;
  if (select status from public.pin_link_get((select code from l where n = 1))) <> 'expired' then raise exception 'FAIL older link should end'; end if;
end $$;
-- a stranger signed in can't use Kim's link
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd03","role":"authenticated"}', true);
do $$ begin perform public.pin_link_set((select code from l where n = 2), '258147'); raise exception 'FAIL stranger used the link';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; end $$;
-- Kim: old link refused, new link works once
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fd02","role":"authenticated"}', true);
do $$ begin perform public.pin_link_set((select code from l where n = 1), '258147'); raise exception 'FAIL ended link worked';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; end $$;
select public.pin_link_set((select code from l where n = 2), '258147');
do $$ begin perform public.pin_link_set((select code from l where n = 2), '369258'); raise exception 'FAIL link worked twice';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; end $$;
reset role;
do $$ begin
  if (select pin_hash from public.memberships where id = '00000000-0000-0000-0000-00000000817f') is distinct from
     extensions.crypt('258147', (select pin_hash from public.memberships where id = '00000000-0000-0000-0000-00000000817f')) then raise exception 'FAIL PIN not saved'; end if;
end $$;
select 'pin_links ok' as result;
rollback;
