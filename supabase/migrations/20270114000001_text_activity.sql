-- Owners see every text and email to their clients/staff, with what happened (Settings → Texting → Messages).
-- text_messages + reminders stay server-only tables; this owner/manager call returns a safe copy: phone = last 4,
-- email = first letter + domain. Also the salon's texting state (own number active? carrier review status).

create function public.text_activity(p_salon uuid, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare lim int := greatest(1, least(coalesce(p_limit, 100), 300));
begin
  if not public.is_admin(p_salon) then
    raise exception 'Only the owner or a manager can see texting activity' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'timeZone', (select time_zone from public.salons where id = p_salon),
    'number', (select phone from public.text_numbers where salon_id = p_salon and status = 'active' limit 1),
    'texting', coalesce((select texting from public.admin_salon_status where salon_id = p_salon), 'not_started'),
    'rows', coalesce((select jsonb_agg(x.j order by x.at desc) from (
      (select m.created_at as at, jsonb_build_object('id', 't' || m.id, 'channel', 'sms', 'kind', m.kind, 'status', m.status,
          'error', m.error, 'to', '••' || right(m.to_phone, 4), 'at', m.created_at) as j
        from public.text_messages m where m.salon_id = p_salon order by m.created_at desc limit lim)
      union all
      -- Emails, texts still waiting their time, and reminders dropped before reaching the sender (booking canceled…).
      (select coalesce(r.sent_at, r.send_at), jsonb_build_object('id', 'r' || r.id, 'channel', r.channel, 'kind', r.kind,
          'status', r.status, 'error', r.error,
          'to', case when r.channel = 'email' then left(coalesce(r.to_addr, ''), 1) || '•••@' || split_part(coalesce(r.to_addr, ''), '@', 2)
                     else '••' || right(coalesce(r.to_addr, ''), 4) end,
          'at', coalesce(r.sent_at, r.send_at), 'sendAt', r.send_at)
        from public.reminders r
        where r.salon_id = p_salon and r.send_at > now() - interval '60 days'
          and (r.channel = 'email' or r.status in ('queued', 'sending') or r.error like 'booking%' or r.error like 'late:%')
        order by r.send_at desc limit lim)
    ) x), '[]'));
end $$;

revoke execute on function public.text_activity(uuid, int) from public, anon;
grant execute on function public.text_activity(uuid, int) to authenticated;
