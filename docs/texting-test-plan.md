# Texting test plan (PolishOS number)

Why now: Nov 24, 2026 the A2P 10DLC campaign was **approved** (Twilio email, campaign `CM72fc4b8e892533f9845eda3760ad8f63`, brand = sole proprietor "Viet Nguyen", number +1 (775) 535-8984 on Messaging Service "PolishOS"). Carriers now let our texts through.

What this number may send: **staff invites + notices only** (the campaign's use case). Never promos. Never client confirms/reminders until consent proof (Build Tracker 4c; built in PR #169, open, needs its merge conflicts fixed) is merged and the salon has its own number.

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
- [ ] polishosapp.com/admin → Home → **Send a test text** → your own phone.
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
- [ ] Next (Claude): fix conflicts + merge PR #169 (proof of consent, 4c) → "invite ends in 1 day" text → booking confirm/reminder texts (per-salon numbers).

## Results log
| Date | Step | Result | Note |
|---|---|---|---|
| | | | |
