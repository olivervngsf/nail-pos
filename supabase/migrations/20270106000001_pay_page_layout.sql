-- Client pay page (pay link / QR): the owner picks the layout, and the page can show who did the work.
--   salons.pay_layout      'receipt' (bill first, then tip) or 'quick' (everything in one card)
--   pay_requests.tip_split 'service' (tip shared by service price, the default) or 'even' (the client picked "Evenly"
--                          on the Quick pay layout); only the server writes it, settle() reads it.
alter table public.salons add column if not exists pay_layout text not null default 'receipt'
  check (pay_layout in ('receipt', 'quick'));
alter table public.pay_requests add column if not exists tip_split text not null default 'service'
  check (tip_split in ('service', 'even'));

create or replace function public.pay_layout_get(p_salon uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_salon) then raise exception 'not allowed'; end if;
  return (select pay_layout from public.salons where id = p_salon);
end $$;

create or replace function public.pay_layout_save(p_salon uuid, p_layout text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if p_layout is null or p_layout not in ('receipt', 'quick') then raise exception 'bad layout'; end if;
  update public.salons set pay_layout = p_layout where id = p_salon;
  insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, public.my_person_id(), 'pay_layout.saved', jsonb_build_object('layout', p_layout));
  return p_layout;
end $$;

revoke execute on function public.pay_layout_get(uuid), public.pay_layout_save(uuid, text) from public, anon;
grant execute on function public.pay_layout_get(uuid), public.pay_layout_save(uuid, text) to authenticated;
