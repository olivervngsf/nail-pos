# Texting test plan (PolishOS number)

Why now: Nov 24, 2026 the A2P 10DLC campaign was **approved** (Twilio email, campaign `CM72fc4b8e892533f9845eda3760ad8f63`, brand = sole proprietor "Viet Nguyen", number +1 (775) 535-8984 on Messaging Service "PolishOS"). Carriers now let our texts through.

What this number may send: **staff invites + notices only** (the campaign's use case). Never promos. Never client confirms/reminders until the salon has its own number (consent proof, Build Tracker 4c, is in since PR #169: only a recorded yes gets a client text).

> **What texts work today (Nov 25) — don't forget**
> - ✅ Staff invite texts (Settings → Team → "Text the invite") — PolishOS number
> - ✅ PIN link texts (Team → PIN → "Text the PIN link") — PolishOS number
> - ❌ Client texts (booking confirm, reminders, receipts, promos) are OFF. Each salon needs its OWN number + brand + campaign first. Never send them on the PolishOS number.
> - Plan for salon numbers + promos: Research — The Salon Texting Plan https://claude.ai/artifact/HFF6aerJLea9q7nbAYJ6Nr

Where to write results: tick the box, write the date + what you saw. Anything failing → send Claude the screen or the Admin "check" reason.

---

## 0. Set up (Oliver, ~10 min, once)
- [ ] Twilio → Messaging → Services → **PolishOS** → copy the ID that starts `MG…`. Sender Pool still lists +1 (775) 535-8984.
- [ ] Twilio → Messaging → Services → PolishOS → Integration: incoming = `https://polishosapp.com/api/sms/inbound`, status = `https://polishosapp.com/api/sms/status` (set Nov 20; just look).
- [ ] Vercel → nail-pos → Environment Variables:
  - `TWILIO_MESSAGING_SERVICE_SID` = the `MG…` ID, **Production + Preview**.
  - `TWILIO_AUTH_TOKEN` = the token Twilio reset on Nov 19 (else inbound replies fail the signature check).
  - `TWILIO_ACCOUNT_SID` present.
  - `TWILIO_FROM`: remove it, or leave it; the Messaging Service is the one we want.
- [ ] Redeploy Production (Deployments → latest → Redeploy).

## 1. First text (Oliver, 2 min)
- [x] Nov 25, 2:48 PM: DELIVERED to Oliver's phone from +1 (775) 535-8984.
- [x] polishosapp.com/admin → Home → **Send a test text** → your own phone.
  - Expect: text "PolishOS test text: texting works. Reply STOP to stop." arrives within ~1 min.
  - Card follows it to **Delivered**. If **Failed / Undelivered**: copy the reason shown (plain words from `explainTextError`) to Claude.
- [ ] Twilio → Monitor → Messaging logs: same text, status Delivered, "Messaging Service = PolishOS".

## 2. Replies (Oliver, 5 min, on the same phone)
| Reply | Expect | ✓ / date |
|---|---|---|
| `HELP` | "PolishOS: texts about your bookings and visits. Help: support@polishosapp.com. Reply STOP to stop." | |
| `GIUP` | same HELP reply | |
| `STOP` | Carrier's standard "unsubscribed" reply. Then Admin → Send a test text again → **blocked / not sent** (phone on the STOP list) | |
| `START` | Carrier's "resubscribed" reply. Test text works again | |
| `DUNG` (or `HUY`) | Same as STOP (Vietnamese) | |
| `START` again | Back on (leave the phone opted in at the end) | |
| `don't stop` | Nothing happens (only the whole word counts) | |

Check after: Twilio logs show each reply hit `/api/sms/inbound` with **200** (not 403 = wrong auth token).

## 3. Staff invite text (Oliver + 1 helper phone, 10 min)
Use the demo salon "Lotus Demo Nails" on live, owner login.
- [ ] Settings → Team → **Add member** with a real phone you can read (yours or Elang's, not a 555 test number) → invite text arrives.
- [ ] Open the link in the text → `/join/…` or `/invite/…` opens for that person.
- [ ] Team drawer → **Text the invite** again → **no second text** (same invite code is never texted twice). New code → texts once.
- [ ] Admin test card / `/api/sms/check` shows the invite text **Delivered**.

## 4. PIN link text (5 min)
- [ ] Settings → Team → pick that member → PIN → **Text the PIN link** → text arrives with `/t/pin?c=…`.
- [ ] Open it, sign in with that phone, set PIN twice → works. Same link again → already used.

## 4b. "Invite ends tomorrow" text (after CRON_SECRET is set)
- [ ] Settings → Team → add a member with your second phone → invite text arrives. Don't join.
- [ ] Wait until the invite has under 24h left (invites last 7 days), or ask Claude to shorten that one invite on the test database.
- [ ] GitHub → Actions → "Scheduled texts" → Run workflow (or wait for the hourly run, 9 AM–8 PM salon time) → text: "PolishOS: your invite to join <salon> ends tomorrow. Join and set your PIN: <link> Reply STOP to stop."
- [ ] Run it again → no second text (once per invite).
- [ ] Join with the link → no reminder for anyone who already joined.

## 4c. Booking reminder emails (after CRON_SECRET + RESEND_API_KEY are set)
- [ ] Book on the demo booking page for tomorrow with your own email → confirmation email now.
- [ ] Around the same time tomorrow minus 1 day (hourly run, 8 AM–9 PM salon time) → "Reminder: <salon> tomorrow…" email.
- [ ] 2 hours before → "See you today at …" email. Texts for these stay off until the salon has its own number (logged as skipped).
- [ ] Cancel a booking with the change/cancel link → no reminders for it.

## 4d. Client flow in TEST MODE: book → confirm → reminder (3 min) → pay → receipt (Oliver, ~15 min, 8 AM–9 PM)
Only phones in `TEXT_TEST_PHONES` get texts, on the PolishOS number, starting "(Test)". Promos never. Cost: ~1¢ per text, cash payment = no card charge.

**Part A · once (Vercel + GitHub)**
1. Make a secret: any long random text, e.g. from a password manager (30+ letters/numbers). Copy it.
2. vercel.com → project nail-pos → Settings → Environment Variables → Add `CRON_SECRET` = that text (Production).
3. Add `TEXT_TEST_PHONES` = your cell, 10 digits, e.g. `4085551234` (Production + Preview). Twilio Virtual Phone too? add it after a comma.
4. Vercel → Deployments → newest Production → ⋯ → Redeploy (wait ~2 min until Ready).
5. github.com/olivervngsf/nail-pos → Settings → Secrets and variables → Actions → New repository secret → name `CRON_SECRET`, same text.
6. GitHub → Actions → "Scheduled texts" → Run workflow → Run. Green ✓ = the app now sends reminders every minute by itself.

**Part B · test mode on (demo salon)**
7. Private window → polishosapp.com/login → phone 555-010-0001 → code 123456 (demo owner).
8. Profile (bottom left) → Settings → Booking reminders → 2nd reminder = 2h → switch on "Test reminders (24h)" → Save.

**Part C · the client flow**
9. New private window → polishosapp.com/lotus-demo-nails → pick a service → a time at least 3h from now → your name + YOUR cell → tick the texts box → Book.
10. Within a minute: text "(Test) Lotus Demo Nails: You're booked …" with a change/cancel link.
11. About 3 minutes later: "(Test) … reminder" text.
12. Back in the owner window → Checkout → New ticket → find the client by your phone → add a service → Charge → Cash → Cash received.
13. Paid screen → Receipt → Text → "(Test) … Your receipt #… ($…): link" arrives; the link opens the receipt.
14. Settings → Texting → Messages: confirm, reminder, receipt all ✓. Anything else: send Claude a screenshot of this list (it shows the reason).
15. Done testing? Settings → Booking reminders → switch Test reminders off (or it ends itself after 24h).

## 5. Things that must NOT text (5 min)
- [ ] Book on the public booking page with a real phone + texts checkbox on → booked screen says texting **not on yet** (salon has no own number). No text arrives.
- [ ] Settings → Texting → Send promo text → still **TEST VERSION**: credit taken, no text goes out.
- [ ] A 555-010-000x demo phone: invite add → nothing sent (fake numbers; fine).

## 6. Limits to know (no test needed)
- Sole proprietor: 1 number, <3,000 texts/day, max 1,000/day to T-Mobile. Pilot only.
- Before charging the first salon: Twilio → business (EO Collective + EIN), new brand + campaign (go-live plan § 6).
- Promos: never on this number. Each salon = its own number + brand + Marketing campaign.

## 7. After all green
- [ ] Tick go-live plan § 6 "Campaign approved …" + Admin → System texting check.
- [ ] Tell Claude → Build Tracker + Session log updated.
- [ ] Next (Claude): "invite ends in 1 day" text → booking confirm/reminder texts (per-salon numbers).

## Results log
| Date | Step | Result | Note |
|---|---|---|---|
| Nov 25 | 1. First text | Delivered | From +1 (775) 535-8984. Number shows "Messaging enabled"; Twilio's old onboarding-task box still open (harmless). Number's own webhook still says demo.twilio.com: if HELP/STOP get no reply, point the number at the PolishOS Messaging Service. |
| Nov 25 (9:44 PM) | 4d. Setup (CRON_SECRET, TEXT_TEST_PHONES, Scheduled texts run) | Done | Every-minute sender registered itself (site address saved in the database). |
| Nov 25 (9:44 PM) | 4d. Book online → confirm | Email sent + text Delivered | "(Test)" text from the PolishOS number to Oliver's cell. |
| Nov 25 | 4d. Test reminder (3 min) | Waiting | Booked after 9 PM: night rule holds it until 8 AM. Check Nov 26 morning. |
| — | 4d. Receipt text | Not run yet | Next: Checkout → Cash → Receipt → Text. |
