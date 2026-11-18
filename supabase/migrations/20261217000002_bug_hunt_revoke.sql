-- The invite trigger function is only for the trigger: not callable from the app (security advisor, Nov 18).
revoke execute on function public._invite_same_salon() from public, anon, authenticated;
