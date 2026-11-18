-- Add sign-in email by one tap: the person taps "Yes, this is my email" in the email (opens /auth/confirm, maybe on another
-- device), so the app can't be counted on to call sync_my_email. Keep people.email in step from auth.users itself.
-- (The test project ran this on Nov 17 as email_confirm_link + slug_reserved_auth; safe to run again.)
create or replace function public._sync_person_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.people set email = lower(new.email)
  where auth_user_id = new.id and coalesce(new.email, '') <> '';
  return new;
end $$;
revoke execute on function public._sync_person_email() from public, anon, authenticated;

drop trigger if exists on_auth_email_changed on auth.users;
create trigger on_auth_email_changed
  after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public._sync_person_email();

-- Catch up anyone who confirmed from the email before this trigger existed.
update public.people p set email = lower(u.email)
from auth.users u
where p.auth_user_id = u.id and coalesce(u.email, '') <> '' and p.email is distinct from lower(u.email);

-- New top-level page /auth (email confirm) can't be a salon's booking link.
-- Adds to whatever the list is now, instead of writing the whole list again.
do $mig$
declare cur text[] := public._slug_reserved(); add text[] := array['auth']; w text;
begin
  foreach w in array add loop if not w = any(cur) then cur := cur || w; end if; end loop;
  execute format($f$create or replace function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $b$ select %L::text[]; $b$$f$, cur);
end $mig$;
