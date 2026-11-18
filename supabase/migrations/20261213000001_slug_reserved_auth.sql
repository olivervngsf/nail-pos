-- /auth (email confirm page) can't be a salon's booking link. profile_pin_settings redefined the list after
-- email_confirm_link and dropped 'auth'; this puts it back on top of the newest list (desk, clock, go).
create or replace function public._slug_reserved() returns text[] language sql immutable set search_path = '' as $$
  select array['book', 'kiosk', 'setup', 'login', 'today', 'checkout', 'clients', 'calendar', 'settings', 'pay', 'join', 'api', 'admin', 'gift-cards', 'kit', 'paid',
    't', 'r', 'c', 'me', 'close-day', 'salon', 'demo', 'numbers', 'loyalty', 'payouts', 'help', 'invite', 'earnings', 'desk', 'clock', 'go', 'auth'];
$$;
