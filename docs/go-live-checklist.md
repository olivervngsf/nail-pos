# Go live checklist (PolishOS)

Status Nov 18. Code is ready for invite-only salons. These steps need Oliver's clicks (accounts, money, keys).

## 1. Google sign-in (≈15 min)
1. Google Cloud console → new project "PolishOS" → APIs & Services → OAuth consent screen: External, app name PolishOS, support email, logo optional, domain polishosapp.com → Publish.
2. Credentials → Create credentials → OAuth client ID → Web application.
   - Authorized JavaScript origins: `https://polishosapp.com`
   - Authorized redirect URI: `https://<supabase-project-id>.supabase.co/auth/v1/callback` (copy from Supabase → Authentication → Providers → Google).
3. Supabase → Authentication → Providers → Google: on, paste Client ID + Client secret, save.
4. Supabase → Authentication → Settings: turn on **Manual linking** (lets people press "Connect Google" in their menu).
5. Supabase → Authentication → URL Configuration: Site URL `https://polishosapp.com`; Redirect URLs add `https://polishosapp.com/**`.
6. Vercel → nail-pos → Settings → Environment Variables (Production): `NEXT_PUBLIC_GOOGLE_LOGIN=on` → redeploy.

## 2. Real sign-in on the live site
- Vercel Production: `NEXT_PUBLIC_SMS_LOGIN=on` (real text codes; removes "Test version" notes on the start page).
- Supabase Auth: Phone provider on with Twilio Verify (already set up), Email provider on, email templates show `{{ .Token }}`.
- Supabase Auth → Password security: turn on **Leaked password protection** (advisor warning).
- Custom SMTP (e.g. Resend) so email codes aren't rate-limited.

## 3. Live database (needs paid Supabase plan, ~$25/mo)
- Create project `nail-pos-live` (us-west-1), apply every file in `supabase/migrations/` in order, run security advisors.
- Do NOT run the test seeds there as-is. Exception (Oliver, Nov 18): Lotus as a demo salon = `test_salon.sql` → `test_salon_activity.sql` → `demo_live.sql` (renames it "Lotus Demo Nails", keeps the test admin phone out of `platform_admins`). Remove before the first real salon: `demo_remove.sql`. In Supabase Auth test phone numbers on live, never add 15550100009.
- Add yourself + Elang to `platform_admins` after your first sign-in:
  `insert into public.platform_admins (auth_user_id, note) select auth_user_id, 'Oliver' from public.people where phone = '+1YOURPHONE';`
- Vercel Production env: live `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Previews keep the test project.

## 4. Payments
- Stripe: finish platform profile + Connect for live mode; Vercel Production `STRIPE_SECRET_KEY` (live), new live webhook → `STRIPE_WEBHOOK_SECRET`.

## 5. First salon
- polishosapp.com/admin → Make salon + invite → Text / Email the message → owner signs in (phone, email or Google) → setup.
