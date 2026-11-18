# Pilot-ready checklist (M14 · issue #22)

Built in code (Nov 18). ✅ = done in code; ☐ = needs a click from Oliver or Elang (accounts, keys, money).

## Up and running
- ✅ Health check: `polishosapp.com/api/health` → app + database up/down (no data, no keys).
- ✅ Uptime alert: `.github/workflows/uptime.yml` checks every 10 min (3 tries) → a failed run emails the repo owner.
  - ☐ GitHub → your avatar → Settings → Notifications → Actions: tick **Email** + "Only notify for failed workflows".
  - ☐ Optional second alarm by text: free UptimeRobot monitor on the same URL.
- ✅ Error alerts (Sentry) wired since M0, off until a key is set.
  - ☐ sentry.io → new Next.js project "polishos" → copy DSN → Vercel env `NEXT_PUBLIC_SENTRY_DSN` (Production) → redeploy. Turn on email alerts for new issues.

## Data safe
- ✅ Nightly backup + restore test: `.github/workflows/backup.yml` (3:17 am Pacific) copies the live database, restores it into an empty Postgres and checks every table's row count matches. Fails loudly by email. Script: `scripts/backup-restore-test.sh` (tested on a local copy Nov 18).
  - ☐ Repo secret `LIVE_DB_URL` (same one the live-database workflow uses).
  - ☐ Optional repo secret `BACKUP_PASSPHRASE` (long random words, kept in the password manager) → an encrypted copy is kept 14 days.
  - ☐ Supabase live project on the paid plan → daily backups on (Database → Backups). Do one restore by hand once, write the date here.
- ✅ Data-wall tests (SQL, every salon walled off) run in CI.
  - ☐ Repo secret `DATABASE_URL` = TEST project connection string (until then CI skips them).
- ✅ Database changes only through GitHub (`db-live.yml`).

## Logins
- ✅ 2-step sign-in: My profile → Sign in → 2-step login (owners + managers) → scan the QR in an authenticator app → 6 digits. After that every sign-in asks for the code, and the **server** keeps every salon closed until it's entered (`_aal_ok`, migration `20261223000001_two_step`). Salon devices (QR) aren't affected.
  - ☐ Supabase (test + live) → Authentication → Multi-Factor → **TOTP: enabled** (on by default; check).
  - ☐ Turn it on for Oliver + Elang first (admins).
  - Lost phone: an admin removes the app in Supabase → Authentication → Users → the person → Factors (after checking it's them).
- ☐ 2-step on every account we own: GitHub, Vercel, Supabase, Stripe, Twilio, GoDaddy, Google. Passwords in a password manager.
- ☐ Supabase Auth → Password security: **Leaked password protection** on.

## Money + costs
- ☐ Spending alerts: Vercel (Settings → Billing → Spend management, e.g. $50), Supabase (Usage → spend cap on), Stripe (our platform account: email on every payout/dispute), Twilio (Usage triggers at $20 / $50), Anthropic console (monthly limit).

## Legal
- ✅ Terms, Privacy, texting consent pages: `/legal/terms`, `/legal/privacy`, `/legal/texts` (draft). Have a lawyer read them before the first salon.

## Founder Admin + support access
- ✅ Founder Admin home + salon pages, and support access (owner-granted, 24 h, logged): merged.
