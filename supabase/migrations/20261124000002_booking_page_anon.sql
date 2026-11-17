-- M8 follow-up (security advisor): only the 4 booking-page functions are for signed-out visitors.
-- Staff / owner booking functions already refuse non-members inside; this also closes them to anon at the door.
revoke execute on function public.kiosk_hello(uuid, text), public.my_slots(uuid, date, int), public.my_regulars(uuid),
  public.staff_book(jsonb), public.staff_unbook(uuid), public.booking_settings_get(uuid), public.booking_settings_save(uuid, jsonb),
  public.service_online(uuid, boolean), public.salon_photo_add(uuid, uuid, text, text), public.salon_photo_remove(uuid),
  public.salon_photo_cover(uuid), public._slug_reserved() from anon;
