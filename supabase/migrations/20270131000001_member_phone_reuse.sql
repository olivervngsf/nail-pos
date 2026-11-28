-- A removed team member (archived) no longer holds their phone: the owner can add that phone again.
-- Before: unique (salon_id, phone) counted removed people too → "That phone is already on the team".
-- Every lookup by phone (team_save, save_setup, claim_memberships, client_lookup, admin_salon_edit) already skips archived rows.
alter table public.memberships drop constraint if exists memberships_salon_id_phone_key;
drop index if exists public.memberships_salon_id_phone_key;
create unique index memberships_salon_id_phone_key on public.memberships (salon_id, phone) where archived_at is null;
