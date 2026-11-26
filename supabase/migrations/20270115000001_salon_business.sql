-- Business details (Settings → Business details, linked from setup "Ready"): what Stripe and the phone carriers need
-- to register the salon (Automatic Salon Setup spec §4). The owner types them once; the server reads them later to
-- register texting. EIN lives in its own server-only table: the app only ever gets the last 4 digits back.

create table public.salon_business (
  salon_id uuid primary key references public.salons(id),
  legal_name text not null default '',
  business_type text not null default '' check (business_type in ('', 'llc', 'corporation', 'partnership', 'sole_prop', 'nonprofit')),
  ein_last4 text check (ein_last4 ~ '^[0-9]{4}$'),
  website text not null default '',
  area_code text check (area_code ~ '^[2-9][0-9]{2}$'),
  consent_method text not null default '' check (consent_method in ('', 'booking_page', 'sign_in_sheet', 'verbal', 'none')),
  promos_ok boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid references public.people(id),
  updated_at timestamptz not null default now()
);
alter table public.salon_business enable row level security;   -- no policies: read/write only through the calls below

create table public.salon_business_secret (
  salon_id uuid primary key references public.salons(id),
  ein text not null check (ein ~ '^[0-9]{9}$'),
  updated_at timestamptz not null default now()
);
alter table public.salon_business_secret enable row level security;   -- server only (texting registration)

-- What is still missing, in the order the form asks (empty = ready to register).
create function public._business_missing(b public.salon_business, s public.salons) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    case when coalesce(trim(b.legal_name), '') = '' then 'legal_name' end,
    case when coalesce(b.business_type, '') = '' then 'business_type' end,
    case when b.ein_last4 is null and coalesce(b.business_type, '') <> 'sole_prop' then 'ein' end,
    case when coalesce(trim(s.address), '') = '' then 'address' end,
    case when b.area_code is null then 'area_code' end,
    case when coalesce(b.consent_method, '') = '' then 'consent_method' end,
    case when b.confirmed_at is null then 'confirm' end
  ], null) $$;

-- Owner + manager read (manager sees the same, cannot change).
create function public.business_get(p_salon uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.salon_business; s public.salons;
begin
  if not public.is_admin(p_salon) then raise exception 'Only the owner or a manager can see business details' using errcode = '42501'; end if;
  select * into s from public.salons where id = p_salon;
  select * into b from public.salon_business where salon_id = p_salon;
  if b.salon_id is null then b.salon_id := p_salon; end if;
  return jsonb_build_object(
    'legalName', coalesce(b.legal_name, ''), 'businessType', coalesce(b.business_type, ''), 'einLast4', b.ein_last4,
    'website', coalesce(nullif(b.website, ''), ''), 'areaCode', b.area_code, 'consentMethod', coalesce(b.consent_method, ''),
    'promosOk', coalesce(b.promos_ok, false), 'confirmedAt', b.confirmed_at,
    'salonName', s.name, 'salonPhone', s.phone, 'address', s.address, 'state', s.state, 'slug', s.slug,
    'canEdit', public.is_owner(p_salon), 'missing', to_jsonb(public._business_missing(b, s)));
end $$;

-- Owner only. p: { legalName, businessType, ein? (9 digits, only when changed), website, areaCode, consentMethod,
-- promosOk, confirm (true = "these details are true and my clients agreed to get texts") }.
create function public.business_save(p_salon uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ein text := regexp_replace(coalesce(p->>'ein', ''), '[^0-9]', '', 'g'); ac text := nullif(regexp_replace(coalesce(p->>'areaCode', ''), '[^0-9]', '', 'g'), '');
  bt text := coalesce(p->>'businessType', ''); cm text := coalesce(p->>'consentMethod', ''); me uuid := public.my_person_id();
begin
  if not public.is_owner(p_salon) then raise exception 'Only the owner can change business details' using errcode = '42501'; end if;
  if ein <> '' and length(ein) <> 9 then raise exception 'EIN has 9 digits' using errcode = '22023'; end if;
  if ac is not null and ac !~ '^[2-9][0-9]{2}$' then raise exception 'Area code has 3 digits' using errcode = '22023'; end if;
  if bt not in ('', 'llc', 'corporation', 'partnership', 'sole_prop', 'nonprofit') then raise exception 'Unknown business type' using errcode = '22023'; end if;
  if cm not in ('', 'booking_page', 'sign_in_sheet', 'verbal', 'none') then raise exception 'Unknown consent method' using errcode = '22023'; end if;
  insert into public.salon_business as b (salon_id, legal_name, business_type, website, area_code, consent_method, promos_ok, updated_at)
  values (p_salon, left(trim(coalesce(p->>'legalName', '')), 120), bt, left(trim(coalesce(p->>'website', '')), 200), ac, cm,
          coalesce((p->>'promosOk')::boolean, false), now())
  on conflict (salon_id) do update set legal_name = excluded.legal_name, business_type = excluded.business_type,
    website = excluded.website, area_code = excluded.area_code, consent_method = excluded.consent_method,
    promos_ok = excluded.promos_ok, updated_at = now();
  if ein <> '' then
    insert into public.salon_business_secret (salon_id, ein) values (p_salon, ein)
    on conflict (salon_id) do update set ein = excluded.ein, updated_at = now();
    update public.salon_business set ein_last4 = right(ein, 4) where salon_id = p_salon;
  end if;
  -- The confirm line is signed again whenever the owner saves with the box ticked; unticked = not confirmed.
  update public.salon_business set confirmed_at = case when coalesce((p->>'confirm')::boolean, false) then now() end,
    confirmed_by = case when coalesce((p->>'confirm')::boolean, false) then me end
  where salon_id = p_salon;
  insert into public.audit_log (salon_id, action, detail)
  values (p_salon, 'business.saved', jsonb_build_object('ein_changed', ein <> '', 'confirmed', coalesce((p->>'confirm')::boolean, false)));
  return public.business_get(p_salon);
end $$;

revoke execute on function public._business_missing(public.salon_business, public.salons) from public, anon, authenticated;
revoke execute on function public.business_get(uuid), public.business_save(uuid, jsonb) from public, anon;
grant execute on function public.business_get(uuid), public.business_save(uuid, jsonb) to authenticated;
