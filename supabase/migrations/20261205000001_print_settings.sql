-- Printer settings (Nov 17): the owner picks what each printout shows (client receipt, staff earnings slip, ticket slip).
-- One jsonb per salon; every member's device reads it (prints follow it), only owner/manager can change it.
alter table public.salons add column if not exists print_settings jsonb not null default '{}'::jsonb;

create or replace function public.print_settings_get(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_salon) then raise exception 'not allowed'; end if;
  return (select print_settings from public.salons where id = p_salon);
end $$;

create or replace function public.print_settings_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if jsonb_typeof(p) <> 'object' or length(p::text) > 4000 then raise exception 'bad settings'; end if;
  update public.salons set print_settings = p where id = p_salon;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, public.my_person_id(), 'print_settings.saved', p);
  return p;
end $$;

revoke execute on function public.print_settings_get(uuid), public.print_settings_save(uuid, jsonb) from public, anon;
grant execute on function public.print_settings_get(uuid), public.print_settings_save(uuid, jsonb) to authenticated;
