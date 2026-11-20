-- Admin names on Admin → System (Nov 20): the 2-step tile showed each admin's profile name, which can be anything
-- the person typed (Oliver's test profile = "OOO", the test admin's = blank) → "OOO ✗ · ✗". Now: the admin label we set
-- in platform_admins.note first (cut before " (" so "Test Admin (test phone …)" shows "Test Admin"), then the profile
-- name if not blank, then "Admin".
create or replace function public._admin_label(p_note text, p_name text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(split_part(coalesce(p_note, ''), ' (', 1)), ''), nullif(trim(coalesce(p_name, '')), ''), 'Admin');
$$;
revoke execute on function public._admin_label(text, text) from public, anon, authenticated;

create or replace function public._admins_two_step() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  if to_regclass('auth.mfa_factors') is null then   -- local test database: no MFA tables
    select coalesce(jsonb_agg(jsonb_build_object('name', public._admin_label(a.note, p.name), 'twoStep', false) order by a.created_at), '[]')
      into out from public.platform_admins a left join public.people p on p.auth_user_id = a.auth_user_id;
    return out;
  end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object('name', public._admin_label(a.note, p.name),
      'twoStep', exists (select 1 from auth.mfa_factors f where f.user_id = a.auth_user_id and f.status::text = 'verified')) order by a.created_at), '[]')
    from public.platform_admins a left join public.people p on p.auth_user_id = a.auth_user_id $q$ into out;
  return out;
end $$;
revoke execute on function public._admins_two_step() from public, anon, authenticated;
