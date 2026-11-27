-- My sign-ins: you see and end only YOUR sessions; this session can't be ended here; ends are logged.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-0000000051a1', '14085550951', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000051a2', '14085550952', 'authenticated', 'authenticated');
insert into auth.sessions (id, user_id, created_at, updated_at, user_agent, ip, aal) values
  ('00000000-0000-0000-0000-00000051a1a1', '00000000-0000-0000-0000-0000000051a1', now() - interval '1 hour', now(), 'Mac Chrome', '73.15.2.9', 'aal1'),
  ('00000000-0000-0000-0000-00000051a1a2', '00000000-0000-0000-0000-0000000051a1', now() - interval '3 days', now() - interval '2 hours', 'iPhone app', '172.56.1.1', 'aal1'),
  ('00000000-0000-0000-0000-00000051a1a3', '00000000-0000-0000-0000-0000000051a1', now() - interval '40 days', now() - interval '26 days', 'Old Android', '98.42.1.1', 'aal1'),
  ('00000000-0000-0000-0000-00000051a2a1', '00000000-0000-0000-0000-0000000051a2', now(), now(), 'Other person', '1.2.3.4', 'aal1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000051a1","role":"authenticated","session_id":"00000000-0000-0000-0000-00000051a1a1"}', true);
do $$ declare n int; r record; begin
  select count(*) into n from public.my_sessions();
  if n <> 3 then raise exception 'FAIL expected 3 own sessions, got %', n; end if;
  select * into r from public.my_sessions() limit 1;
  if not r.this then raise exception 'FAIL this device should be first'; end if;
  if r.ip <> '73.15.x.x' then raise exception 'FAIL ip not masked: %', r.ip; end if;
  if public.my_session_end('00000000-0000-0000-0000-00000051a2a1') then raise exception 'FAIL ended someone else''s session'; end if;
  begin
    perform public.my_session_end('00000000-0000-0000-0000-00000051a1a1');
    raise exception 'FAIL ended this session';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  if not public.my_session_end('00000000-0000-0000-0000-00000051a1a3') then raise exception 'FAIL could not end own old session'; end if;
  if public.my_sessions_end_others() <> 1 then raise exception 'FAIL end others count'; end if;
  select count(*) into n from public.my_sessions();
  if n <> 1 then raise exception 'FAIL expected only this session left, got %', n; end if;
  select count(*) into n from public.my_signin_history() where what like 'signed_out%';
  if n <> 2 then raise exception 'FAIL expected 2 sign-outs logged, got %', n; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-00000051a2a1') then raise exception 'FAIL other person''s session was removed'; end if;
end $$;
select 'my_signins ok';
rollback;
