-- Text credit paid by card (Nov 18): credit is added only after Stripe says the payment went through (our platform
-- account, same customer + card as the salon plan). The free test stub text_credit_add is closed to the app; only the
-- server adds credit now, once per Stripe payment (client_id = 'stripe:<payment intent>').

create or replace function public._text_credit_paid(p_salon uuid, p_cents bigint, p_ref text, p_person uuid, p_label text)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if p_cents is null or p_cents < 500 or p_cents > 50000 then raise exception 'credit must be $5 to $500'; end if;
  if p_ref is null or length(p_ref) < 8 then raise exception 'missing payment id'; end if;
  perform pg_advisory_xact_lock(hashtext('text_credit:' || p_salon::text));
  if not exists (select 1 from public.text_credit_ledger where client_id = p_ref) then
    insert into public.text_credit_ledger (salon_id, kind, cents, label, person_id, client_id)
    values (p_salon, 'add', p_cents, p_label, p_person, p_ref);
    insert into public.audit_log (salon_id, person_id, action, detail)
    values (p_salon, p_person, 'text_credit_add', jsonb_build_object('cents', p_cents, 'ref', p_ref));
  end if;
  return public._text_credit_balance(p_salon);
end $$;
revoke execute on function public._text_credit_paid(uuid, bigint, text, uuid, text) from public, anon, authenticated;

-- No more free credit from the app (the server route charges the card first).
revoke execute on function public.text_credit_add(uuid, bigint, text) from authenticated;
