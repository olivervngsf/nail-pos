-- Lotus as a DEMO salon on the LIVE project (Oliver, Nov 18): something real to show on polishosapp.com before pilots.
-- Run, in order: test_salon.sql → test_salon_activity.sql → this file. Remove before the first real salon: demo_remove.sql.
-- Real salons never see it (salon wall: every row has salon_id + RLS).
-- Safety: the demo's test phones (+1555010000x) and PINs are public in this repo, so this file
--   1) names it "Lotus Demo Nails" so nobody takes it for a real salon, and
--   2) makes sure the test admin phone (+15550100009) is NEVER a platform admin here (that would open every real salon).
--      Only real admins (Oliver, Elang) go in platform_admins on live.
-- Optional: Supabase Auth → Phone → Test phone numbers (15550100001…8 = 123456) lets you sign in as the demo staff.
--   Leave 15550100009 out on live.
update public.salons set name = 'Lotus Demo Nails', slug = coalesce(slug, 'lotus-demo')
where id = '7e570000-0000-4000-8000-000000000001';

delete from public.platform_admins pa
using auth.users u
where pa.auth_user_id = u.id and u.phone = '15550100009';

select s.name, s.slug,
  (select count(*) from public.memberships m where m.salon_id = s.id) as staff,
  (select count(*) from public.clients c where c.salon_id = s.id) as clients,
  (select count(*) from public.tickets t where t.salon_id = s.id) as tickets,
  (select count(*) from public.platform_admins) as platform_admins
from public.salons s where s.id = '7e570000-0000-4000-8000-000000000001';
