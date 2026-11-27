# Tap to Pay on iPhone: Apple review kit (R11)

What Apple wants back (email Nov 24): reply to the email, then upload to Apple's File Uploader:
1. Video "New User Flow" · 2. Video "Existing User Flow" · 3. Video "Checkout Flow" · 4. the filled
App Review Requirements Checklist.

Written from Apple's public guidelines + what we built (R1–R10, `docs/tap-to-pay-iphone-plan.md`).
**Check every line against Apple's 2 PDFs (box links in the email) before sending** — this container can't open them.

## Before you record (once, ~15 min)
- [ ] iPhone has app **1.4** (Actions → "iPhone app → TestFlight" → "Test iPhone (Tap to Pay)" → install from polishosapp.com/ios/index.html).
- [ ] iPhone: iOS 18+, passcode on, signed in to iCloud, Wi-Fi on, Do Not Disturb on (no pop-ups in the video).
- [ ] A **physical Stripe test card** (the app is in Stripe test mode: real bank cards are refused). Practice tap is fine for a dry run, but Apple wants a real tap in the video.
- [ ] Turn on Screen Recording: Settings → Control Center → add Screen Recording. Record with the microphone **off**.
- [ ] Optional but recommended: a second phone filming the iPhone from above, so the card tap is visible (screen recording can't show the card). Apple reviewers like to see it.
- [ ] Salon address has a ZIP (Settings → Salon address shows ✓ Ready for card payments).
- [ ] Each video = one take, start to end, no cuts. 1–3 minutes each.

## Video 1 · New User Flow (a salon that has never used Tap to Pay)
Goal: show a brand-new merchant is offered Tap to Pay, accepts Apple's terms as an admin, learns how to tap.

Set-up: Founder Admin → Add salon by invite (a test salon, e.g. "Review Salon") → open the invite on the iPhone app.
If you reuse a salon: Settings → Tap to Pay on iPhone → **Start over (for Apple's videos)** first.

1. Open PolishOS (iPhone app). Sign in with the owner's phone + code.
2. Setup steps 1–4 (salon info with full address + ZIP, menu, team, Connect payments with Stripe).
3. **Step 5 · Card reader:** point at the **Tap to Pay on iPhone** card (Apple's symbol, "no reader needed", fee).
4. Tap **Turn on Tap to Pay on iPhone** → Apple's terms appear → **Accept** (owner = admin).
5. Apple's **How to tap** screens open → swipe through them all → Done.
6. Card shows **On**. Finish setup.
7. (End) Checkout → New ticket → one service → Charge → **Tap to Pay on iPhone** tile is there.

Say nothing; the screens speak. If Apple's terms don't appear, the Apple ID already accepted them: use another Apple ID / test iPhone, or note it in the email.

## Video 2 · Existing User Flow (a salon already using PolishOS)
Goal: an existing merchant is told Tap to Pay is available and can turn it on.

Set-up: the demo salon (Lotus Demo Nails) on the iPhone app, signed in as the **owner**.
Settings → Tap to Pay on iPhone → **Start over (for Apple's videos)** → close the app fully.

1. Open PolishOS → **Checkout**.
2. The one-time sheet **Tap to Pay on iPhone · Take cards on this iPhone** slides up (symbol, what it is, fee, owner accepts terms).
3. Tap **Turn it on** → Settings → Tap to Pay on iPhone.
4. Tap **Turn on Tap to Pay on iPhone** → Apple's terms (if this Apple ID hasn't accepted) → Accept.
5. Apple's **How to tap** screens → swipe through → Done. State shows **On · ready**.
6. Show **How to tap** button again on the same page (it opens Apple's screens any time).
7. (Optional) Sign in as a **front desk** person on another device/login: no sheet, and the tile says "Ask the owner or a manager…" until it's on — shows staff never see the terms.

## Video 3 · Checkout Flow (taking a real tap)
Goal: a full payment with Tap to Pay on iPhone, plus what happens when it doesn't go through.

Set-up: Tap to Pay **On** on this iPhone. Stripe test card ready.

1. Checkout → **New ticket** → add a service (e.g. Gel manicure) + tech → **Charge**.
2. How to pay → **Tap to Pay on iPhone** tile (Apple's symbol, "Ready to tap").
3. Pick a tip (20%) → **Charge $X**.
4. Screen: amount + "Hold the card or phone wallet near the top of this iPhone" → Apple's tap screen.
5. Tap the **Stripe test card** on the top of the iPhone → check mark → **Checking with the bank…** → **Paid** + receipt.
6. Second try for the error case: New ticket → Charge → Tap to Pay → **Cancel payment** (or tap a declined test card) → plain message, ticket still open → Charge again → pay. (Shows a clear failure + retry.)
7. (Optional) On the tap screen tap **How to tap** → Apple's screens → back.

## App Review Requirements Checklist · draft answers
Copy these into Apple's checklist (match their wording; their PDF wins where it differs).

| Apple asks about | Our answer | Where in PolishOS |
| --- | --- | --- |
| Device eligibility | Tap to Pay shows only on iPhones that support it (iPhone XS+, supported iOS); others never see it | `tapCheck` (Stripe `supportsReaders`) |
| Name + icon | Always "Tap to Pay on iPhone" with Apple's SF Symbol `wave.3.right.circle` (system-drawn, not our art) | Checkout tile, Settings, setup, sheet |
| Terms and conditions | Accepted only by an owner/manager (admin) in Settings or setup, before any checkout; never shown to staff at checkout | Settings → Tap to Pay on iPhone; checkout sends `terms:false` |
| Non-admin users | See "Ask the owner or a manager to turn on Tap to Pay on iPhone in Settings" | Checkout tile |
| Enabling | Settings → Tap to Pay on iPhone: Off / Getting ready / On · ready, Turn on, Turn off | `/settings/tap-to-pay` |
| New merchants | Offered during setup (card reader step) | Setup step 5 |
| Existing merchants | One-time sheet on Checkout for owners/managers (Turn it on / Not now) | `TapIntro` |
| Merchant education | Apple's ProximityReaderDiscovery "how to tap" after turning on, in Settings, on the tap screen, in setup | `HowToTap` (iOS 18+; our steps on older iOS) |
| Reader preparation | Prepared when the app opens and comes back to the screen (after the iPhone is set up); progress shown | `keepTapWarm` |
| Checkout prominence | Tap to Pay on iPhone is the first payment tile on a supported iPhone | How to pay screen |
| Errors | Plain words (EN + VI): no internet, passcode, iCloud, terms, declined, busy, card key | `checkout.tapErr.*` |
| Payment result | Paid screen + receipt (print / text / email / QR); failed = ticket stays open, clear message, retry | Checkout |
| Marketing | Only Apple's toolkit assets; always the full name; no press without Apple's OK | Rule (R12) |
| PSP | Stripe Terminal iOS SDK 5.8.1 (Tap to Pay + M2) | `ios/PolishOS` |

## Sending (Oliver, ~15 min)
1. Name files `PolishOS-1-new-user.mov`, `PolishOS-2-existing-user.mov`, `PolishOS-3-checkout.mov`.
2. Reply to Apple's email: "Videos and checklist uploaded for PolishOS (bundle `com.polishos.app`)."
3. Upload the 3 videos + filled checklist to Apple's File Uploader (link in the email).
4. Tick R11 in the Build Tracker; Apple usually answers in days to weeks.
