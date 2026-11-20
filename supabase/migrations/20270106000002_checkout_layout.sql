-- Checkout home screen (open tickets + paid today): the owner picks the layout.
--   salons.checkout_layout  'list' (clean rows, for a computer) or 'cards' (one big card per ticket, for a touch screen)
alter table public.salons add column if not exists checkout_layout text not null default 'list'
  check (checkout_layout in ('list', 'cards'));

create or replace function public.checkout_layout_get(p_salon uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_salon) then raise exception 'not allowed'; end if;
  return (select checkout_layout from public.salons where id = p_salon);
end $$;

create or replace function public.checkout_layout_save(p_salon uuid, p_layout text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_layout is null or p_layout not in ('list', 'cards') then raise exception 'bad layout'; end if;
  update public.salons set checkout_layout = p_layout where id = p_salon;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'checkout_layout.saved', jsonb_build_object('layout', p_layout));
  return p_layout;
end $$;

revoke execute on function public.checkout_layout_get(uuid), public.checkout_layout_save(uuid, text) from public, anon;
grant execute on function public.checkout_layout_get(uuid), public.checkout_layout_save(uuid, text) to authenticated;
