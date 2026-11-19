-- Salon devices say "I'm on" (Nov 19). Until now devices.last_seen only moved on set-up and on a PIN, so a tablet
-- that was on but idle looked "last used 2 days ago" in Founder Admin and in Settings → Devices.
-- The app on a salon device now calls device_ping every few minutes while its screen is showing.
-- Only someone inside that salon (the QR device's own login, or the person signed in on the device) can ping it.

create function public.device_ping(p_device uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.devices;
begin
  select * into d from public.devices where id = p_device and archived_at is null;
  if d.id is null or not public.is_member(d.salon_id) then return false; end if;
  -- at most one write a minute, however often the app asks
  if d.last_seen is null or d.last_seen < now() - interval '1 minute' then
    update public.devices set last_seen = now() where id = d.id;
  end if;
  return true;
end $$;
revoke all on function public.device_ping(uuid) from public, anon;
grant execute on function public.device_ping(uuid) to authenticated;
