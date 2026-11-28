-- Notifications: a big refund, a big discount, a short cash drawer, a PIN lock-out and 3 refused clock-ins queue one
-- alert each (once); a switched-off alert queues nothing; the server hands each out once with the owner + managers;
-- a tech can't read or change the settings. Rolls back.
begin;
insert into auth.users (id, phone, aud, role) values
  ('00000000-0000-0000-0000-0000000a1e01', '14085550961', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a1e02', '14085550962', 'authenticated', 'authenticated');
insert into public.platform_admins (auth_user_id) values ('00000000-0000-0000-0000-0000000a1e01') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1e01","role":"authenticated"}', true);
select public.save_setup(jsonb_build_object('salonId', '00000000-0000-0000-0000-00000000a1e5', 'ownerName', 'Mai', 'salonName', 'Alert Nails', 'state', 'CA', 'step', 2,
  'staff', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000a1ef', 'name', 'Tuan', 'phone', '+14085550962', 'role', 'tech'))));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1e02","role":"authenticated"}', true);
select public.claim_memberships();
do $$ begin
  begin
    perform public.notify_settings_get('00000000-0000-0000-0000-00000000a1e5');
    raise exception 'FAIL tech read notification settings';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1e01","role":"authenticated"}', true);
-- Discount alerts off for this salon.
select public.notify_settings_save('00000000-0000-0000-0000-00000000a1e5', '{"to": [], "summary": true, "on": {"discount_big": {"email": false, "text": false}}}');
reset role;
insert into public.tickets (id, salon_id, number, status, subtotal_cents, discount_cents, total_cents) values
  ('00000000-0000-0000-0000-00000000a1f1', '00000000-0000-0000-0000-00000000a1e5', 901, 'paid', 8000, 0, 8000),
  ('00000000-0000-0000-0000-00000000a1f2', '00000000-0000-0000-0000-00000000a1e5', 902, 'open', 4000, 2000, 2000),
  ('00000000-0000-0000-0000-00000000a1f3', '00000000-0000-0000-0000-00000000a1e5', 903, 'paid', 3000, 0, 3000);
update public.tickets set status = 'refunded' where id = '00000000-0000-0000-0000-00000000a1f1';   -- $80: alert
update public.tickets set status = 'refunded' where id = '00000000-0000-0000-0000-00000000a1f3';   -- $30: no alert
update public.tickets set status = 'paid' where id = '00000000-0000-0000-0000-00000000a1f2';       -- 50% off, but switched off
insert into public.day_closes (salon_id, day, start_cents, cash_expected_cents, cash_counted_cents, summary)
  values ('00000000-0000-0000-0000-00000000a1e5', current_date, 10000, 50000, 48500, '{}');              -- $15 short: alert
insert into public.audit_log (salon_id, action, detail) values
  ('00000000-0000-0000-0000-00000000a1e5', 'pin.locked', jsonb_build_object('membership', '00000000-0000-0000-0000-00000000a1ef'));
insert into public.audit_log (salon_id, person_id, action, detail)
  select '00000000-0000-0000-0000-00000000a1e5', p.id, 'clock.refused', '{"reason":"not_wifi"}'::jsonb
    from public.people p cross join generate_series(1, 4) where p.phone = '+14085550962';
do $$ declare n int; r record; begin
  select count(*) into n from public.notify_queue where salon_id = '00000000-0000-0000-0000-00000000a1e5';
  if n <> 4 then raise exception 'FAIL expected 4 alerts (refund, drawer, pin, clock), got %', n; end if;
  if exists (select 1 from public.notify_queue where kind = 'discount_big' and salon_id = '00000000-0000-0000-0000-00000000a1e5') then raise exception 'FAIL switched-off alert was queued'; end if;
  if (select count(*) from public.notify_queue where kind = 'clock_refused' and salon_id = '00000000-0000-0000-0000-00000000a1e5') <> 1 then raise exception 'FAIL clock refusals should be one alert a day'; end if;
  select * into r from public.notify_claim(50) c where c.kind = 'refund_big';
  if r.title not like 'Ticket #901 refunded: $80.00' then raise exception 'FAIL refund title: %', r.title; end if;
  if not r.email or not r.text then raise exception 'FAIL refund should be email + text by default'; end if;
  if jsonb_array_length(r.recipients) <> 1 then raise exception 'FAIL expected the owner only, got %', r.recipients; end if;
  if exists (select 1 from public.notify_claim(50)) then raise exception 'FAIL alerts handed out twice'; end if;
  perform public.notify_done(r.id, 'sent', '{}'::jsonb);
  if (select count(*) from public.audit_log where salon_id = '00000000-0000-0000-0000-00000000a1e5' and action = 'alert.queued') <> 4 then raise exception 'FAIL alerts not in the Activity log'; end if;
end $$;
select 'notifications ok';
rollback;
