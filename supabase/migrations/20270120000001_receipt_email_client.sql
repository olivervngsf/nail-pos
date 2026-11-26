-- Email receipt typed at checkout also fills the client's email on file, when the client has none yet.
-- Never overwrites an email already on file (changing it = Edit drawer with an owner/manager OK).
create or replace function public.log_receipt(p_id uuid, p_salon uuid, p_ticket uuid, p_channel text, p_to text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  addr text := lower(trim(coalesce(p_to, '')));
begin
  if not public._is_desk(p_salon) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.tickets where id = p_ticket and salon_id = p_salon) then raise exception 'no such ticket'; end if;
  insert into public.receipts (id, salon_id, ticket_id, channel, sent_to, status)
  values (p_id, p_salon, p_ticket, p_channel, nullif(trim(coalesce(p_to, '')), ''),
          case p_channel when 'print' then 'printed' when 'none' then 'skipped' else 'queued' end)
  on conflict (id) do nothing;

  if p_channel = 'email' and addr ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    update public.clients c set email = addr
    from public.tickets t
    where t.id = p_ticket and t.salon_id = p_salon and c.id = t.client_id and c.salon_id = p_salon
      and coalesce(c.email, '') = '';
  end if;
end $$;
