-- Internal helpers of the invite system are not callable from the app.
revoke execute on function public._auth_email(), public._person_for(text, text), public._invite_code(), public._no_self_serve_salon() from authenticated;
