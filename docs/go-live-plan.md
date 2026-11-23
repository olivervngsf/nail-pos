# Go-live plan (PolishOS) — start here

One plan from "works on the test setup" to "first real salon takes real money". Updated Nov 25 (texting campaign approved).
Every step: **who** (Oliver · Elang · Claude), **how long**, and where the click-by-click lives.
When a step is done: tick it here, write the date, and tick the same check in **polishosapp.com/admin/system** (Running smooth checks).

**Detail pages (how-to; this plan links to them):**
- Stripe webhooks: `docs/stripe-webhooks.md`
- Email sender + templates: `docs/email-setup.md`
- Clock-in rules for owners: `docs/clock-in-rules.md`
- PIN help for owners (two ways to give a new PIN): `docs/pin-help.md`
- Test logins (test project only): `docs/test-accounts.md`
- Texting plan + FAQ (claude.ai): https://claude.ai/artifact/CCKEccsu486fXUywR76kdz
- Texting test plan (after campaign approval): `docs/texting-test-plan.md`
- Hardware to buy: `docs/hardware-shopping-list.md`
- Every price point (salons pay, we pay, per salon): `docs/costs.md`

(The old `docs/go-live-checklist.md` and `docs/pilot-ready.md` are folded in here.)

---

## Where we are (Nov 20)

| Area | Test setup (today) | Live (real salons) |
|---|---|---|
| App | Preview links (every PR) run on the TEST database + Stripe sandbox | **polishosapp.com runs on the LIVE database since Nov 20** (Stripe still sandbox) |
| Database | `nail-pos-test`: every change tried here first | `nail-pos-live`: gets every change from main (`db-live.yml`, on). Holds the demo salon "Lotus Demo Nails" + demo phones (see `docs/test-accounts.md`); remove before the first real salon |
| Card payments | Sandbox works; webhook On (made by hand Nov 19) | Stripe live mode not set up |
| Plans + text credit | Sandbox: webhook On (Admin → System button, Nov 20); text credit test payment started Nov 20 (Stripe page reached, paying with test card 4242 still to finish) | Same button again after the live key, then one real $5 credit + refund (step 5) |
| Sign-in codes by text | Twilio Verify works | Done Nov 20: live phone sign-in on (Twilio Verify) + test numbers 555-010-0001…0009 = 123456 |
| Salon texts (invites, reminders) | Code ready | **Campaign approved Nov 24** (`CM72fc4b…ad8f63`): staff invites + notices can send once `TWILIO_MESSAGING_SERVICE_SID` is in Vercel. Client texts wait on each salon's own number (consent proof done, PR #169) + each salon's own number. Test: `docs/texting-test-plan.md` |
| Email sign-in | Resend sender works | Copy SMTP + templates to the live project (not checked yet) |
| Admins' 2-step login | 0 of 2 on | Must be 2 of 2 |
| Running smooth checks | All "Not set" | All ticked |

---

**Vercel keys (Nov 20):** Production = live (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). Preview = test. To do: `SUPABASE_SECRET_KEY` is still the live key on Preview too → set Preview to the test key (else preview links' payments, invites, receipts fail). Any `NEXT_PUBLIC_` change needs a Redeploy.

**Founders on live (Nov 20):** Oliver = platform admin (his phone + email, note "Oliver (founder)"). Elang: sign in once, then add the same way. Demo admin 555-010-0009 (note "Demo admin…") goes before the first real salon.

## 1. Lock our own accounts (Oliver + Elang · ~1 h · do first)
- [ ] 2-step login + password manager on every account we own: GitHub, Vercel, Supabase, Stripe, Twilio, GoDaddy, Google, Resend, Anthropic.
- [ ] 2-step login in PolishOS for Oliver and Elang: `/me` → Sign in → 2-step login. Admin → System tile must say **2/2**.
- [ ] Spending alerts: Vercel (Settings → Billing → Spend management, e.g. $50), Supabase (spend cap on), Stripe (email on every payout/dispute), Twilio (usage triggers $20 / $50), Anthropic console (monthly limit). Tick "Spending alerts" in Admin → System.
- [x] Nov 20 DONE: test email to support@ landed in Oliver's Gmail. Inbox **support@polishosapp.com** (it is printed on the legal pages). Tool: **ImprovMX** (improvmx.com, free email forwarding; Oliver signed up Nov 20) forwards support@ to Oliver's Gmail:
  1. ImprovMX: domain `polishosapp.com`, alias `support` → Oliver's Gmail.
  2. GoDaddy → polishosapp.com → DNS: delete any old MX rows; add MX `@` `mx1.improvmx.com` (10), MX `@` `mx2.improvmx.com` (20), TXT `@` `v=spf1 include:spf.improvmx.com ~all` (or add `include:spf.improvmx.com` to an existing SPF row). Never touch Resend's `mail` / `send` rows. Keep ONE `_dmarc` row (`v=DMARC1; p=none;`); two rows = both ignored, so GoDaddy's default `p=quarantine` row was deleted.
  3. ImprovMX "Check again" turns green → email support@ from another account → it lands in Gmail.
  - Resend = SENDING app email only (no-reply@mail.polishosapp.com); ImprovMX = RECEIVING. Replying AS support@ needs ImprovMX paid (~$9/mo) or Google Workspace (~$7/person); move to Workspace when Elang/Laura answer salons.
- [ ] Nov 23 MOSTLY DONE (mail runs on Google; oliver@ receives): **Google Workspace** = real work email (Stripe sales asked for one). Business Starter, monthly, **$8.40/user/mo**, free until Dec 7, billed to Viet Nguyen (change to EO Collective once the LLC exists: Admin console → Billing → payments profile). All prices: `docs/costs.md`.
  1. [x] workspace.google.com → business name "EO Collective" → 2–9 people → US → "I have a domain" → `polishosapp.com`.
  2. [x] User `oliver@polishosapp.com` (= the Workspace admin; password in 1Password) → Business Starter → checkout ($10 card check, refunded).
  3. [x] Nov 23: domain verified (TXT `google-site-verification=…` row at GoDaddy, kept forever).
  4. [x] Nov 23 (done by hand; Google's "set up GoDaddy for me" gave Error 401): Activate Gmail = swap mail at GoDaddy → polishosapp.com → DNS: delete MX `mx1.improvmx.com` + `mx2.improvmx.com`; add MX `@` `smtp.google.com` (1); SPF TXT `@` → `v=spf1 include:_spf.google.com ~all` (one SPF row only). Never touch Resend's `mail` / `send` rows; keep the one `_dmarc` row.
  5. [ ] Nov 23 alias added, test pending: Admin console → Directory → Users → Oliver → User information → Alternate email addresses → `support` (free alias, no 2nd seat) → email support@ + oliver@ from another account → both land in the Workspace inbox; reply works.
  6. [ ] 2-step verification on oliver@ (admin account). Optional: reply AS support@ = Gmail Settings → Accounts → Send mail as → add support@.
  6b. [ ] DKIM (emails not in spam): Admin → Apps → Google Workspace → Gmail → Authenticate email → Generate (2048) → GoDaddy TXT `google._domainkey` → Start authentication.
  7. [ ] Cancel ImprovMX (no longer used). Use oliver@ for Stripe sales + business sign-ups.
  - Later: Elang + Laura = +$8.40/mo each (Admin console → Users → Add). Add eo-collective.com as a secondary domain (free) when the company site starts.

## 2. Turn on the live database (Oliver · ~30 min · needs paid Supabase plan ~$25/mo)
- [ ] Supabase `nail-pos-live` → paid plan → Database → Backups: daily backups on.
- [ ] GitHub repo → Settings → Secrets → Actions: `LIVE_DB_URL` = live **Session pooler** connection string.
- [ ] GitHub → Actions → **Live database** → Run workflow (dry run first: it lists every change file) → then run for real. Tick "Live database up to date".
- [ ] Repo secret `DATABASE_URL` = TEST project connection string (turns on the salon-wall tests in CI). Tick "Data walls test".
- [ ] Optional repo secret `BACKUP_PASSPHRASE` (long random words, in the password manager) → nightly encrypted copy kept 14 days.
- [ ] Next morning: Actions → **Backup** ran green (nightly copy + restore test). Do one restore by hand, write the date here: ____. Tick "Backups" + "Restore test".
- [ ] Live Supabase → Authentication → Multi-factor: TOTP on (default; check). Password security: **Leaked password protection** on.
- [ ] Never run the test seeds on live. Only exception: the Lotus demo (`test_salon.sql` → `test_salon_activity.sql` → `demo_live.sql`), removed with `demo_remove.sql` before the first real salon. Nov 20 (Oliver: demo data on live is OK, always marked DEMO): live is the only database for polishosapp.com now. Test phones 555-010-0001…0009 sign in with 123456 (Supabase live → Auth → Phone → Test Phone Numbers), and 555-010-0009 is a platform admin on live (`platform_admins.note` starts "Demo admin"). Before the first real salon: run `demo_remove.sql`, `delete from platform_admins where note like 'Demo admin%'`, and remove the test phone numbers in Supabase Auth.

## 3. Switch the site to live (Oliver · ~20 min · after step 2)
- [ ] Vercel → nail-pos → Environment Variables → **Production only** (Preview keeps the test project + sandbox):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` = live project
  - `NEXT_PUBLIC_SMS_LOGIN=on` (real text codes; removes "Test version" notes)
- [ ] Redeploy Production. Open polishosapp.com/api/health → app + database OK.
- [ ] Sign in on the live site with your own phone, then add both admins (Supabase live → SQL editor):
  `insert into public.platform_admins (auth_user_id, note) select auth_user_id, 'Oliver' from public.people where phone = '+1YOURPHONE';` (same for Elang, note 'Elang'). The note is the name the Admin → System tile shows.

## 4. Sign-in on live (Oliver · ~30 min)
- [ ] Live Supabase → Authentication → Phone: on, Twilio Verify (same Verify service as test). Use the NEW Twilio auth token (Twilio reset it Nov 19; also update Vercel `TWILIO_AUTH_TOKEN` for Production + Preview and the test project's phone settings).
- [ ] Live Supabase → Email: SMTP + all templates + URL configuration exactly as `docs/email-setup.md`. Raise the rate limit to 100/h.
- [ ] Google sign-in (optional, ~15 min): Google Cloud project "PolishOS" → OAuth consent (External, polishosapp.com) → Web client (origin `https://polishosapp.com`, redirect = the live Supabase callback URL) → live Supabase → Providers → Google on + **Manual linking** on → Vercel Production `NEXT_PUBLIC_GOOGLE_LOGIN=on` → redeploy.

## 5. Payments live (Oliver · ~1 h + Stripe review)
- [ ] Stripe → live mode: finish the platform profile + Connect for live (business details, bank; use EO Collective LLC + EIN + business bank from step 7).
- [ ] Vercel Production `STRIPE_SECRET_KEY` = live key → redeploy.
- [ ] polishosapp.com/admin/system → Stripe webhooks card shows **live mode** → tap **Set up webhooks** → both rows **On**. (Live and sandbox are separate; the button makes both live webhooks and keeps their secrets. Details: `docs/stripe-webhooks.md`.)
- [ ] **Prices final first** (see step 7): the app makes the plan prices in Stripe the first time an owner opens Billing ($49/mo, $468/yr today). Changing a price after that = Claude adds a new price version.
- [ ] Order a Stripe S710 reader ($299 + tax/shipping) per pilot salon (live readers come from Stripe, not Amazon). Hardware list: `docs/hardware-shopping-list.md`.
  - Test reader + dock ordered Nov 24 ($354.17, pending). When it arrives: Stripe → Terminal → Locations → add one (full address + ZIP) → register the reader in **Sandbox**. Before the first real salon: unregister it, register it in Live under that salon's location.
- [ ] $1 test on the setup day with a real card, then refund it.
- [ ] **Money salons pay us** (plan + text credit, our own Stripe account), after the live key + Set up webhooks:
  - Admin → System → Stripe webhooks card says **live mode** and both rows **On** (sandbox webhooks don't carry over).
  - On a real salon's owner login: Settings → Texting → Add credit **$5** → pay with a real card on Stripe's page → back in the app the credit shows **$5.00**, and the receipt row shows the card.
  - Stripe (live) → Developers → Webhooks → "PolishOS: salon plans + text credit" → Event deliveries: new events, response **200**, **Failed 0**.
  - Add $5 again: this time no Stripe page (the saved card is charged at once).
  - Refund both in the Stripe dashboard. Write the date here: ____.

## 6. Texting (Oliver · forms now, carriers take ~1–3 weeks)
> **What texts work today (Nov 25) — don't forget**
> - ✅ Staff invite texts (Settings → Team → "Text the invite") — PolishOS number
> - ✅ PIN link texts (Team → PIN → "Text the PIN link") — PolishOS number
> - ❌ Client texts (booking confirm, reminders, receipts, promos) are OFF. Each salon needs its OWN number + brand + campaign first. Never send them on the PolishOS number.
> - Plan for salon numbers + promos: Research — The Salon Texting Plan https://claude.ai/artifact/HFF6aerJLea9q7nbAYJ6Nr

- [x] Nov 19: Twilio pay-as-you-go; number +1 (775) 535-8984; sole proprietor brand "Viet Nguyen" **approved**.
- [x] Nov 24: **campaign approved** (Twilio email; campaign `CM72fc4b8e892533f9845eda3760ad8f63`, use case = staff invites + notices, no marketing). Registered with carriers.
- [x] Nov 25: first test text **Delivered**. Oliver: Messaging Service `MG…` → Vercel `TWILIO_MESSAGING_SERVICE_SID` (Production + Preview) + check `TWILIO_AUTH_TOKEN` = Nov 19 token → redeploy → run `docs/texting-test-plan.md` (first text Delivered, HELP/STOP/START/DUNG replies, invite + PIN link texts, things that must NOT text). Date: ____.
- [ ] **Before charging the first salon money:** switch Twilio to a business account (EO Collective + EIN + business address) and move the tax info (needs the company first: step 7 "Register EO Collective"). Sole proprietor = testing/pilot only (1 number, <3,000 texts/day).
- [ ] Salon promo texts never go on the PolishOS number: each salon needs its own number + brand + Marketing campaign (on its setup day).
- [x] Nov 19: campaign form submitted (sole proprietor, invites + notices, verbal opt-in script, links `/legal/terms` + `/legal/privacy`); legal pages renamed "Terms of Service" / "Privacy Policy" with an SMS Terms section. Carrier review ~1–3 weeks.
- [x] Nov 20 DONE (set by API): Messaging Service renamed "PolishOS" (MGfb1e10…), incoming = `https://polishosapp.com/api/sms/inbound`, delivery status = `https://polishosapp.com/api/sms/status`, number's own webhook off (STOP/HELP reach us).
- [x] Nov 20: support@polishosapp.com is a real inbox (reviewers + the HELP reply point to it). Nov 23: now a Google Workspace alias of oliver@ (was ImprovMX → Gmail).
- [x] **Claude: proof of consent** (Build Tracker row 4c; PR #169, migration `20270112000001_text_consent`, on test; goes to live with the merge): save WHEN + WHERE each client said yes to texts (booking page, desk, kiosk, START reply) and when they said STOP; today only yes/no. **Deadline: before the first real client text** (confirm, reminder, receipt, promo) = before any salon's own number is approved. Not needed for staff invites. Safe to ship any time.
- [x] Nov 25: "invite ends tomorrow" text built (hourly job `/api/cron/invite-reminders` via GitHub Actions "Scheduled texts"; once per invite, only to staff who got the first invite text, 9 AM–8 PM salon time). **Oliver: make a long random `CRON_SECRET`, put the same value in Vercel (Production) + GitHub → Settings → Secrets → Actions, redeploy.** Until then the job skips.
- [x] Nov 26: test mode for client texts (#193): Vercel `TEXT_TEST_PHONES` = Oliver's cell + Twilio Virtual Phone; confirm / reminder / receipt texts reach ONLY those phones, on the PolishOS number, starting "(Test)". Receipts by text + email send for real from the paid screen. **Oliver: set `TEXT_TEST_PHONES`, redeploy, run `docs/texting-test-plan.md` § 4d.** Remove it (empty) before the first real salon.
- [ ] Nov 26: Twilio reset the Auth Token again. **Oliver: copy the new one into Vercel `TWILIO_AUTH_TOKEN` (Production + Preview) + redeploy**; if sign-in codes fail, also Supabase → Auth → Phone (test + live).
- [ ] Claude: wire confirm / reminder / receipt texts (texting plan steps 3–6) once the campaign is approved.

## 7. Decisions + legal (Oliver + Elang · before the first paying salon)
- [ ] **Final price** (Elang + Oliver): proposal = Salon $49/mo (or $39/mo yearly) after a free 30-day pilot; Salon Plus later. Tell Claude before any owner opens Billing on live.
- [ ] Lawyer reads `/legal/terms`, `/legal/privacy`, `/legal/texts` (text in `src/lib/legal.ts`) and the texting consent wording.
- [ ] Pilot salons (Elang): pick 2–3; ask how they pay techs today and whether they have booth renters.

### Register EO Collective as a company (Oliver + Elang · ~1–2 weeks · ~$900 to start)
California LLC (the CFO numbers already count the $800/yr). Not legal or tax advice: book a 1-hour CPA call (~$150–300) for the owner split + taxes. Skip Delaware unless we raise VC money (we'd still pay CA's $800 and file in CA too; Stripe Atlas does Delaware for ~$500 if that day comes).
- [ ] **Name check** (5 min): bizfileonline.sos.ca.gov → search "EO Collective"; the name ends in "LLC".
- [ ] **Who owns it** (Oliver + Elang): Oliver only, or Oliver + Elang (e.g. 50/50)? Two owners = multi-member LLC = a partnership tax return each year (CPA).
- [ ] **Articles of Organization** (Form LLC-1, online, $70) at bizfileonline.sos.ca.gov. Registered agent = us at a CA address (free) or a paid service (~$50–150/yr) to keep a home address off the record. Usually approved in days. Date: ____.
- [ ] **EIN** (free, ~10 min): irs.gov → "Apply for an EIN online", after the LLC is approved. Keep the letter in the password manager / shared drive.
- [ ] **Statement of Information** (Form LLC-12, $20) within 90 days of forming, then every 2 years.
- [ ] **Operating agreement**: who owns what, who decides, what happens if someone leaves. A must with 2 founders.
- [ ] **Business bank account** with the LLC papers + EIN; company money never mixed with personal.
- [ ] **DBA "PolishOS"** (Fictitious Business Name, county clerk, ~$50–100): we sell as PolishOS, not EO Collective.
- [ ] **City business license** where we work from.
- [ ] **$800 CA franchise tax every year** (Form 3522): first payment due by the 15th day of the 4th month after forming (the first-year free pass ended in 2024).
- [ ] **Move our accounts to the company** (after EIN + bank): Twilio business profile (step 6), Stripe platform account business details + bank (step 5, before live mode), Resend / Vercel / GoDaddy / Supabase / Anthropic billing → company card; business insurance (~$160/mo, `founder/`).

## 8. Know when something breaks (Oliver · ~20 min)
- [ ] Sentry: sentry.io → Next.js project "polishos" → DSN → Vercel Production `NEXT_PUBLIC_SENTRY_DSN` → redeploy; email alerts for new issues. Tick "Sentry alerts".
- [ ] GitHub → avatar → Settings → Notifications → Actions: Email + "Only notify for failed workflows" (uptime check runs every 10 min, backup nightly).
- [ ] Optional: free UptimeRobot on polishosapp.com/api/health for a text alert. Tick "Uptime checks".
- [ ] Tick "Secrets" in Admin → System once every key lives only in Vercel / Supabase / GitHub secrets (none in chat, docs or code).

## 9. Devices (Oliver · as hardware arrives)
- [ ] Each salon: front desk tablet + time clock tablet set up by QR (Settings → Devices → Add a device), receipt printer paired (Settings → Printer → Print a test), S710 reader paired (Settings → Card reader).
- [ ] PS10 handheld (if used): Claude sets a fixed signing key for the app before the pilot; try staff slips (several papers in a row); try the Stripe M2 reader once it arrives.

## 10. First pilot salon (Elang leads · Oliver on call)
- [ ] Before: remove the live demo salon (`demo_remove.sql`) if it was added. Admin → System all green.
- [ ] polishosapp.com/admin → Salons → Add salon by invite → text/email the invite → owner signs in → setup (10 steps, ~1 h): info, menu, staff + PINs, Connect payments, reader, printer, devices, clock-in rule, clients, $1 test. Show the owner the PIN box (Settings → Team → person): "Make a new PIN now" when they're here, PIN link when they're away (`docs/pin-help.md`).
- [ ] Day 0 (as soon as the owner says yes): owner fills **Settings → Business details** (legal name, EIN, area code, how clients say yes, confirm) so card + texting registration can start; full steps in the Salon Onboarding doc https://claude.ai/artifact/6pxbR9ZNRba5m9WtKoVvwQ .
- [ ] Day 1: Elang on call. Week 1: check-in logged in Admin → Salons. Week 4: pilot review (keep / pay / changes).

## Later (after the pilot)
- Tap to Pay in our own iPhone + Android app; Salon Plus plan; Reserve with Google (start the partner request early); clock-in "opens 15 min before shift" once shifts exist.

---

### Keep this plan true
- Claude updates this file whenever a go-live step changes (code, keys, decisions), and the matching line in `CLAUDE.md`.
- Admin → System's Running smooth checks are the same list in the app: tick both.
