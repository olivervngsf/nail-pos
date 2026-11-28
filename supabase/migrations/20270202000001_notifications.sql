-- Notifications (Settings → Safety + records → Notifications; board "Settings, Activity log + Timesheet" → Notifications.dc.html).
-- Owner + managers the owner picks get an email (and later a text, on the salon's own number) when something needs them.
-- One setting per salon in salons.notify_settings:
--   {"to": [membership ids] (empty = owner + every manager), "summary": bool, "on": {"<kind>": {"email": bool, "text": bool}}}
-- Alerts go into notify_queue (server only); the every-minute job (/api/cron/notify) sends them, once each (dedupe key).
-- Live now (from things the app already records): refund_big, discount_big, drawer_off, pin_locked, clock_refused,
-- plan_failed, credit_low. Kept in the setting but not sent yet: new_signin, meal_missed, overtime, forgot_clockout,
-- license, device_off, and the daily summary.
alter table public.salons add column if not exists notify_settings jsonb not null default '{}';

create table if not exists public.notify_queue (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons(id),
  kind text not null,
  title text not null,
  body text not null default '',
  dedupe text not null unique,
  at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'skipped', 'failed')),
  result jsonb
);
alter table public.notify_queue enable row level security; -- no policies: server only
create index if not exists notify_queue_due on public.notify_queue (status, at);

-- Defaults from the board: email on for every alert; text also on for the urgent ones.
create or replace function public._notify_default(p_kind text) returns jsonb
language sql immutable set search_path = public as $$
  select case when p_kind in ('refund_big', 'pin_locked', 'new_signin', 'plan_failed')
    then '{"email": true, "text": true}'::jsonb else '{"email": true, "text": false}'::jsonb end
$$;

create or replace function public._notify_on(p_salon uuid, p_kind text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public._notify_default(p_kind) || coalesce((select notify_settings->'on'->p_kind from public.salons where id = p_salon), '{}'::jsonb)
$$;

-- Queue one alert (if any channel is on), once per dedupe key, and note it in the Activity log.
create or replace function public._notify(p_salon uuid, p_kind text, p_title text, p_body text, p_dedupe text) returns void
language plpgsql security definer set search_path = public as $$
declare on_ jsonb := public._notify_on(p_salon, p_kind); n int;
begin
  if p_salon is null or not (coalesce((on_->>'email')::boolean, false) or coalesce((on_->>'text')::boolean, false)) then return; end if;
  insert into public.notify_queue (salon_id, kind, title, body, dedupe) values (p_salon, p_kind, p_title, p_body, p_dedupe)
  on conflict (dedupe) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_log (salon_id, action, detail) values (p_salon, 'alert.queued', jsonb_build_object('kind', p_kind, 'title', p_title));
  end if;
end $$;

-- Refund / void over $50, and a discount over 20% on a paid ticket.
create or replace function public._notify_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('refunded', 'voided') and old.status is distinct from new.status and greatest(new.total_cents, old.total_cents) >= 5000 then
    perform public._notify(new.salon_id, 'refund_big',
      format('Ticket #%s %s: $%s', new.number, case new.status when 'voided' then 'voided' else 'refunded' end, to_char(greatest(new.total_cents, old.total_cents) / 100.0, 'FM999990.00')),
      'Open Checkout or the Activity log to see who did it and who OK''d it.', 'refund_big:' || new.id || ':' || new.status);
  end if;
  if new.status = 'paid' and old.status is distinct from 'paid' and new.subtotal_cents > 0 and new.discount_cents * 5 > new.subtotal_cents then
    perform public._notify(new.salon_id, 'discount_big',
      format('Ticket #%s: %s%% discount ($%s off)', new.number, round(new.discount_cents * 100.0 / new.subtotal_cents), to_char(new.discount_cents / 100.0, 'FM999990.00')),
      'A discount over 20%. It was OK''d at the desk; this is so you know.', 'discount_big:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists notify_ticket on public.tickets;
create trigger notify_ticket after update of status on public.tickets for each row execute function public._notify_ticket();

-- Cash drawer more than $5 off at close.
create or replace function public._notify_close() returns trigger
language plpgsql security definer set search_path = public as $$
declare d bigint := new.cash_counted_cents - new.cash_expected_cents;
begin
  if abs(d) > 500 then
    perform public._notify(new.salon_id, 'drawer_off',
      format('Cash drawer %s $%s on %s', case when d < 0 then 'short' else 'over' end, to_char(abs(d) / 100.0, 'FM999990.00'), to_char(new.day, 'Mon DD')),
      format('Counted $%s, expected $%s.%s', to_char(new.cash_counted_cents / 100.0, 'FM999990.00'), to_char(new.cash_expected_cents / 100.0, 'FM999990.00'),
        case when coalesce(new.diff_reason, '') <> '' then ' Reason given: ' || new.diff_reason else '' end),
      'drawer_off:' || new.id || ':' || new.cash_counted_cents);
  end if;
  return new;
end $$;
drop trigger if exists notify_close on public.day_closes;
create trigger notify_close after insert or update of cash_counted_cents on public.day_closes for each row execute function public._notify_close();

-- PIN locked (3 wrong tries) and clock-in refused 3+ times today for one person.
create or replace function public._notify_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; n int; m uuid := nullif(new.detail->>'membership', '')::uuid;
begin
  if new.action not in ('pin.locked', 'clock.refused') or new.salon_id is null then return new; end if;
  select display_name into who from public.memberships
   where (m is not null and id = m) or (m is null and person_id = new.person_id and salon_id = new.salon_id) limit 1;
  if new.action = 'pin.locked' then
    perform public._notify(new.salon_id, 'pin_locked', format('%s is locked out: 3 wrong PINs', coalesce(who, 'Someone')),
      'Settings → Activity log → PIN shows each try and the device.', 'pin_locked:' || new.id);
  else
    select count(*) into n from public.audit_log a
     where a.salon_id = new.salon_id and a.action = 'clock.refused' and a.at > now() - interval '24 hours'
       and a.person_id is not distinct from new.person_id;
    if n >= 3 then
      perform public._notify(new.salon_id, 'clock_refused', format('%s tried to clock in %s times from outside the salon', coalesce(who, 'Someone'), n),
        'Usually someone trying from home. Settings → Activity log → Clock.', 'clock_refused:' || new.salon_id || ':' || coalesce(new.person_id::text, '-') || ':' || current_date);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists notify_audit on public.audit_log;
create trigger notify_audit after insert on public.audit_log for each row execute function public._notify_audit();

-- Plan payment failed (Stripe says past_due / unpaid).
create or replace function public._notify_billing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('past_due', 'unpaid') and old.status is distinct from new.status then
    perform public._notify(new.salon_id, 'plan_failed', 'Your PolishOS plan payment failed',
      'We try again the next day. Update the card in Settings → Plan + billing.', 'plan_failed:' || new.salon_id || ':' || current_date);
  end if;
  return new;
end $$;
drop trigger if exists notify_billing on public.salon_billing;
create trigger notify_billing after update of status on public.salon_billing for each row execute function public._notify_billing();

-- Text credit below the salon's warn level (warn % of the auto-add amount), once a day.
create or replace function public._notify_credit() returns trigger
language plpgsql security definer set search_path = public as $$
declare bal bigint; warn bigint;
begin
  if new.kind <> 'spend' then return new; end if;
  select coalesce(sum(cents), 0) into bal from public.text_credit_ledger where salon_id = new.salon_id;
  select coalesce(s.auto_add_cents, 2500) * coalesce(s.warn_pct, 20) / 100 into warn from public.text_credit_settings s where s.salon_id = new.salon_id;
  if bal < coalesce(warn, 500) then
    perform public._notify(new.salon_id, 'credit_low', format('Text credit is low: $%s left', to_char(bal / 100.0, 'FM999990.00')),
      'Add credit in Settings → Texting so promo texts keep going out.', 'credit_low:' || new.salon_id || ':' || current_date);
  end if;
  return new;
end $$;
drop trigger if exists notify_credit on public.text_credit_ledger;
create trigger notify_credit after insert on public.text_credit_ledger for each row execute function public._notify_credit();

-- Settings: owner + managers read and save (logged).
create or replace function public.notify_settings_get(p_salon uuid)
returns table (settings jsonb, people jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin(p_salon) then raise exception 'owner or manager only'; end if;
  return query
  select s.notify_settings,
         coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'role', m.role,
                     'email', p.email is not null and p.email <> '', 'phone', p.phone is not null) order by m.role, m.display_name)
                     from public.memberships m left join public.people p on p.id = m.person_id
                    where m.salon_id = p_salon and m.role in ('owner', 'manager') and m.archived_at is null), '[]'::jsonb)
    from public.salons s where s.id = p_salon;
end $$;

create or replace function public.notify_settings_save(p_salon uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_salon) then raise exception 'owner or manager only'; end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'bad settings'; end if;
  update public.salons set notify_settings = jsonb_build_object(
    'to', coalesce(p_settings->'to', '[]'::jsonb), 'summary', coalesce(p_settings->'summary', 'true'::jsonb), 'on', coalesce(p_settings->'on', '{}'::jsonb))
   where id = p_salon;
  insert into public.audit_log (salon_id, person_id, action, detail) values (p_salon, public.my_person_id(), 'notify.saved', '{}'::jsonb);
end $$;

-- Server (every-minute job): hand out queued alerts once, with who gets them.
create or replace function public.notify_claim(p_limit int default 50)
returns table (id bigint, salon_id uuid, salon_name text, kind text, title text, body text, email boolean, text boolean, recipients jsonb)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with c as (
    update public.notify_queue q set status = 'sending', claimed_at = now()
     where q.id in (select q2.id from public.notify_queue q2
                     where q2.status = 'queued' or (q2.status = 'sending' and q2.claimed_at < now() - interval '10 minutes')
                     order by q2.at limit p_limit for update skip locked)
    returning q.*
  )
  select c.id, c.salon_id, s.name, c.kind, c.title, c.body,
         coalesce((public._notify_on(c.salon_id, c.kind)->>'email')::boolean, false),
         coalesce((public._notify_on(c.salon_id, c.kind)->>'text')::boolean, false),
         coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'email', nullif(p.email, ''), 'phone', p.phone))
                     from public.memberships m left join public.people p on p.id = m.person_id
                    where m.salon_id = c.salon_id and m.archived_at is null and m.role in ('owner', 'manager')
                      and (jsonb_array_length(coalesce(s.notify_settings->'to', '[]'::jsonb)) = 0
                           or m.id::text in (select jsonb_array_elements_text(s.notify_settings->'to')))), '[]'::jsonb)
    from c join public.salons s on s.id = c.salon_id;
end $$;

create or replace function public.notify_done(p_id bigint, p_status text, p_result jsonb default null) returns void
language sql security definer set search_path = public as $$
  update public.notify_queue set status = p_status, sent_at = case when p_status = 'sent' then now() end, result = p_result where id = p_id
$$;

-- The every-minute job also sends alerts.
create or replace function public._cron_ping() returns void
language plpgsql security definer set search_path = '' as $$
declare u text; t text;
begin
  select value->>'url', value->>'token' into u, t from public.platform_secrets where name = 'db_cron';
  if u is null or t is null then return; end if;
  perform net.http_post(url := u || '/api/cron/booking-reminders', body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || t, 'Content-Type', 'application/json'), timeout_milliseconds := 30000);
  perform net.http_post(url := u || '/api/cron/notify', body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || t, 'Content-Type', 'application/json'), timeout_milliseconds := 30000);
end $$;

revoke all on function public._notify_default(text), public._notify_on(uuid, text), public._notify(uuid, text, text, text, text),
  public._notify_ticket(), public._notify_close(), public._notify_audit(), public._notify_billing(), public._notify_credit(),
  public.notify_claim(int), public.notify_done(bigint, text, jsonb), public._cron_ping() from public, anon, authenticated;
grant execute on function public.notify_claim(int), public.notify_done(bigint, text, jsonb) to service_role;
revoke all on function public.notify_settings_get(uuid), public.notify_settings_save(uuid, jsonb) from public, anon;
grant execute on function public.notify_settings_get(uuid), public.notify_settings_save(uuid, jsonb) to authenticated;
