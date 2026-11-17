-- Email sign-in: one person = one account. A person signed in by phone adds an email (Supabase emails a code to confirm it);
-- after that they can sign in with that email too and land in the same account + salons. This keeps people.email in step.
create function public.sync_my_email() returns text
language sql security definer set search_path = '' as $$
  update public.people p set email = lower(u.email)
  from auth.users u
  where u.id = (select auth.uid()) and p.auth_user_id = u.id and coalesce(u.email, '') <> ''
  returning p.email;
$$;
revoke execute on function public.sync_my_email() from public, anon;
grant execute on function public.sync_my_email() to authenticated;
