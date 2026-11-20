# Email setup (PolishOS sender + templates)

Sender: `PolishOS <no-reply@mail.polishosapp.com>` via Resend (domain `mail.polishosapp.com`, DNS at GoDaddy, verified Nov 17).
Supabase → Authentication → Emails → SMTP: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key (Sending access).
Rate limit: 30/h now, 100/h before the first pilot salon. Resend free plan = 100 emails/day.

## Receiving email (support@polishosapp.com)
Resend only SENDS (from `no-reply@mail.polishosapp.com`). Mail TO `support@polishosapp.com` is received by **ImprovMX** (improvmx.com, free forwarding, Oliver's account, Nov 20) and forwarded to Oliver's Gmail. DNS at GoDaddy on `polishosapp.com`: MX `mx1.improvmx.com` (10) + `mx2.improvmx.com` (20), SPF TXT `v=spf1 include:spf.improvmx.com ~all`. Resend's records live on `mail.` / `send.` and are not touched. Steps: `docs/go-live-plan.md` § 1.

## Templates (Supabase → Authentication → Emails)
Paste each file's HTML into the template; subject is on line 1 of each file.

| Supabase template | File | Used for |
|---|---|---|
| Magic link or OTP | `supabase/templates/magic-link.html` | Email sign-in code + forgot-password code (both use `signInWithOtp`) |
| Change email address | `supabase/templates/change-email.html` | Add sign-in email: "Yes, this is my email" button → `/auth/confirm` + code as backup |
| Reset password | `supabase/templates/reset-password.html` | Not used by the app today (kept in case) |
| Security → Password changed | `supabase/templates/notice-password-changed.html` | Alert (turn on) |
| Security → Email address changed | `supabase/templates/notice-email-changed.html` | Alert to the old email (turn on) |
| Security → Phone number changed | `supabase/templates/notice-phone-changed.html` | Alert (turn on) |
| Security → Identity linked | `supabase/templates/notice-identity-linked.html` | Alert when Google is connected (turn on) |

Leave "Confirm sign up", "Invite user", "Reauthentication" as is (not used: no new accounts by email; staff invites are our own links).

## URL configuration
Site URL `https://polishosapp.com`; Redirect URLs `https://polishosapp.com/**`, `https://*.vercel.app/**`.
The confirm button uses `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`, so Site URL must be the live app.

## How "add sign-in email" works
Menu → Add sign-in email → Save → email with one button. The tap opens `/auth/confirm` on any device, confirms, and
never leaves another person signed in there. The menu checks every 4 s and flips to "Email added" by itself.
A DB trigger (`on_auth_email_changed`) copies the confirmed email to `people.email`.

## Booking confirmation emails
Sent by our server (`/api/book/notify`), not by Supabase. Needs one thing in Vercel → Settings → Environment Variables:
`RESEND_API_KEY` = a Resend API key with Sending access (Resend → API Keys → Create; same account as above), for
Production and Preview, marked Sensitive. Then redeploy. Sender shows as "<Salon name> via PolishOS".
Without the key the booking still saves and the booked screen says the email couldn't be sent.
