-- My sign-ins (Settings → Me → My sign-ins; board "Settings, Activity log + Timesheet" → SignIns.dc.html).
-- Every place YOUR login is signed in (Supabase auth sessions), sign one out, or all but this one.
-- Supabase's own auth history is off on our projects, so sign-outs done here are kept in signin_log (server only).
create table if not exists public.signin_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now(),
  what text not null check (what in ('signed_out', 'signed_out_others')),
  agent text,
  started timestamptz
);
alter table public.signin_log enable row level security; -- no policies: only the functions below read or write it
create index if not exists signin_log_user_at on public.signin_log (user_id, at desc);

create or replace function public._my_session_id() returns uuid
language sql stable set search_path = public as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid
$$;

-- IP shown as its first two parts only (enough to spot "that's not my wifi", no full address on screen).
create or replace function public._ip_hint(p inet) returns text
language sql immutable set search_path = public as $$
  select case when p is null then null
              when family(p) = 4 then split_part(host(p), '.', 1) || '.' || split_part(host(p), '.', 2) || '.x.x'
              else split_part(host(p), ':', 1) || ':' || split_part(host(p), ':', 2) || ':…' end
$$;

create or replace function public.my_sessions()
returns table (id uuid, started timestamptz, last_active timestamptz, agent text, ip text, two_step boolean, this boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at), s.user_agent,
         public._ip_hint(s.ip), s.aal::text = 'aal2', s.id = public._my_session_id()
    from auth.sessions s
   where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
   order by (s.id = public._my_session_id()) desc, coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc
$$;

-- Sign-ins in the last 30 days (still open ones from auth.sessions) + sign-outs done from this page.
create or replace function public.my_signin_history()
returns table (at timestamptz, what text, agent text)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.created_at, 'signed_in'::text, s.user_agent from auth.sessions s
     where s.user_id = auth.uid() and s.created_at > now() - interval '30 days'
    union all
    select l.at, l.what, l.agent from public.signin_log l
     where l.user_id = auth.uid() and l.at > now() - interval '30 days'
  ) x order by 1 desc limit 50
$$;

-- Sign out one of MY other sign-ins (not this one: use the normal Sign out for that).
create or replace function public.my_session_end(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare a text; st timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_id = public._my_session_id() then raise exception 'this device: use Sign out'; end if;
  delete from auth.sessions where id = p_id and user_id = auth.uid() returning user_agent, created_at into a, st;
  if not found then return false; end if;
  insert into public.signin_log (user_id, what, agent, started) values (auth.uid(), 'signed_out', a, st);
  return true;
end $$;

-- Sign out every other place this login is signed in. Returns how many.
create or replace function public.my_sessions_end_others() returns int
language plpgsql security definer set search_path = public as $$
declare n int; me uuid := public._my_session_id();
begin
  if auth.uid() is null or me is null then raise exception 'not signed in'; end if;
  delete from auth.sessions where user_id = auth.uid() and id <> me;
  get diagnostics n = row_count;
  if n > 0 then insert into public.signin_log (user_id, what, agent) values (auth.uid(), 'signed_out_others', n || ' devices'); end if;
  return n;
end $$;

revoke all on function public.my_sessions(), public.my_signin_history(), public.my_session_end(uuid), public.my_sessions_end_others(), public._my_session_id(), public._ip_hint(inet) from public, anon;
grant execute on function public.my_sessions(), public.my_signin_history(), public.my_session_end(uuid), public.my_sessions_end_others() to authenticated;
