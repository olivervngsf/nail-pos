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
- Stripe: finish platform profile + Connect for live mode; Vercel Production `STRIPE_SECRET_KEY` (live), webhooks: open Admin → System on polishosapp.com → Set up webhooks (makes the payments + billing webhooks with the live key and keeps their secrets; no env vars to copy).

## 4b. Texting (Twilio) — plan: https://claude.ai/artifact/CCKEccsu486fXUywR76kdz
- Now (Nov 19): one Twilio account for testing + sign-in codes, upgraded to pay-as-you-go ($20 prepaid, auto-recharge), registered as an **individual** (Oliver) with tax info. No subscriptions (not needed at our size; look again past ~$150/month Twilio spend).
- **Before charging the first salon money: switch the Twilio account to business (EO Collective + EIN, business address) and move the tax info to the business.** The A2P 10DLC brand needs the business anyway.
- Then register: brand + campaign (or toll-free verification) → Messaging Service `MG…` → Vercel `TWILIO_MESSAGING_SERVICE_SID`. Until then texts come back Undelivered.
- Status Nov 19: number +1 (775) 535-8984; sole proprietor brand "Viet Nguyen" submitted, in review. Next: campaign form (~1–3 weeks review) → Messaging Service. Each step is a carrier review (hours to weeks), and a mistake means reject, fix, pay and wait again: that's why texting takes weeks while the code is already done. Plan § "Why texting takes weeks".
- Team FAQ (pricing, salon setup, messages, laws) for Laura + Elang: texting plan § "Texting FAQ for Laura + Elang". Before the first paying salon: lawyer reads `/legal/texts` + consent wording; record when + where each client said yes.
- Twilio reset the auth token on Nov 19: the new one goes in Vercel `TWILIO_AUTH_TOKEN` (Production + Preview) and Supabase Auth → Phone → Twilio settings.

## 5. First salon
- polishosapp.com/admin → Make salon + invite → Text / Email the message → owner signs in (phone, email or Google) → setup.

## 6. Legal + 2-step login
- Have a lawyer read `/legal/terms`, `/legal/privacy`, `/legal/texts` (text in `src/lib/legal.ts`).
- Make the inbox `support@polishosapp.com` (it is printed on those pages).
- Supabase live project → Authentication → Multi-factor: TOTP on (default). Then turn on 2-step login for yourself and Elang at `/me`.
- Use the `/legal/texts` + `/legal/privacy` links in the A2P 10DLC registration.
