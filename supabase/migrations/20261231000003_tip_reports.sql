-- Monthly cash-tip report (PRD tip rules: "monthly cash-tip report per tech"). Each person sees their card + cash tips for a month
-- on the salon device by PIN and signs it ("Yes, I got these tips"); the owner/manager sees who signed in the payout sheet.
-- The amounts are saved at signing, so a later change (late ticket, refund) shows as "changed since signed" and can be signed again.

create table public.tip_reports (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  membership_id uuid not null references public.memberships(id),
  month date not null check (extract(day from month) = 1),
  card_cents bigint not null,
  cash_cents bigint not null,
  signed_at timestamptz not null default now(),
  device_id uuid references public.devices(id),
  unique (membership_id, month)
);
alter table public.tip_reports enable row level security;
create policy "admin read" on public.tip_reports for select to authenticated using (public.is_admin(salon_id));
revoke insert, update, delete on public.tip_reports from anon, authenticated;

-- Everyone's tips for one month (salon calendar), plus what each signed.
create function public._tip_month(p_salon uuid, p_month date, p_only uuid)
returns table (membership_id uuid, name text, card_cents bigint, cash_cents bigint, signed_at timestamptz, signed_card_cents bigint, signed_cash_cents bigint)
language sql stable set search_path = '' as $$
  with t as (select * from public._tips(p_salon, public._day_lo(p_salon, p_month), public._day_lo(p_salon, (p_month + interval '1 month')::date)))
  select m.id, m.display_name, coalesce(t.card_cents, 0), coalesce(t.cash_cents, 0), r.signed_at, r.card_cents, r.cash_cents
  from public.memberships m
  left join t on t.membership_id = m.id
  left join public.tip_reports r on r.membership_id = m.id and r.month = p_month
  where m.salon_id = p_salon and (p_only is null or m.id = p_only)
    and (t.membership_id is not null or r.id is not null or (p_only is not null))
  order by m.display_name $$;

-- Owner / manager: the month for everyone.
create function public.tip_report(p_salon uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_salon) then raise exception 'not allowed'; end if;
  if extract(day from p_month) <> 1 then raise exception 'month must start on day 1'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from public._tip_month(p_salon, p_month, null) x), '[]');
end $$;

-- A person on the salon device: PIN → own month; p_sign = true also signs it (once per amount; re-sign if it changed).
create function public.pin_tip_report(p_device uuid, p_membership uuid, p_pin text, p_month date, p_sign boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; sid uuid; x record; lo date;
begin
  perform set_config('nailpos.pin_purpose', case when p_sign then 'tip_sign' else 'tip_report' end, true);
  r := public._check_pin(p_device, p_membership, p_pin);
  if not (r->>'ok')::boolean then return r; end if;
  if extract(day from p_month) <> 1 then raise exception 'month must start on day 1'; end if;
  sid := (r->>'salon_id')::uuid;
  select * into x from public._tip_month(sid, p_month, p_membership);
  if p_sign then
    -- Only a month that has started (today's month or earlier).
    lo := date_trunc('month', (now() at time zone (select time_zone from public.salons where id = sid)))::date;
    if p_month > lo then raise exception 'month not started'; end if;
    insert into public.tip_reports (salon_id, membership_id, month, card_cents, cash_cents, device_id)
      values (sid, p_membership, p_month, x.card_cents, x.cash_cents, p_device)
      on conflict (membership_id, month) do update set card_cents = excluded.card_cents, cash_cents = excluded.cash_cents,
        signed_at = now(), device_id = excluded.device_id;
    insert into public.audit_log (salon_id, device_id, action, detail)
      values (sid, p_device, 'tips.signed', jsonb_build_object('membership', p_membership, 'month', p_month, 'cash_cents', x.cash_cents, 'card_cents', x.card_cents));
    select * into x from public._tip_month(sid, p_month, p_membership);
  end if;
  return r || jsonb_build_object('report', to_jsonb(x));
end $$;

revoke execute on function public._tip_month(uuid, date, uuid) from public, anon, authenticated;
revoke execute on function public.tip_report(uuid, date), public.pin_tip_report(uuid, uuid, text, date, boolean) from public, anon;
grant execute on function public.tip_report(uuid, date), public.pin_tip_report(uuid, uuid, text, date, boolean) to authenticated;
