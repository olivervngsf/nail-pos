# Tap to Pay on iPhone: plan to Apple's OK

Status (Nov 24, 2026): Apple granted the **development** entitlement (registered test iPhones only).
Goal: Apple's **publishing** entitlement, so TestFlight + App Store builds can take cards on the iPhone.

How Apple gets there: we build what their requirements PDF asks → reply to Apple's email → upload to their
File Uploader: 1. video "New User Flow" · 2. video "Existing User Flow" · 3. video "Checkout Flow" ·
4. filled App Review Requirements Checklist. The exact rules are in the 2 Box PDFs (links in Apple's email; this
container can't open apple.box.com). Below = Apple's public guidelines + what we know; check each line against
the PDFs once they're in the repo (`docs/apple/`).

## Requirements vs what we built (track by ID)

| ID | Apple requirement | Built today | Status | To build |
| --- | --- | --- | --- | --- |
| R1 | Offer it only on iPhones that can (XS+, iOS supported) | `tapCheck` hides the tile on others | Done | — |
| R2 | Take a card with Tap to Pay on iPhone | `CardReader.swift` tap flow, tip on screen, server settles | Built, not tried on a real iPhone | Test on Oliver's iPhone (step 4) |
| R3 | Button says **Tap to Pay on iPhone** + Apple's symbol | iPhone app 1.3: tile "Tap to Pay on iPhone" + Apple's SF Symbol `wave.3.right.circle` (the app draws it, hands the picture to the page); "top of this iPhone" wording | Built (Nov 25), not on a phone yet | Try on Oliver's iPhone |
| R4 | Owner/admin accepts Apple's terms BEFORE checkout; staff can't | Settings → Tap to Pay on iPhone (owner/manager only): Turn on = Apple's terms shown once and accepted there; checkout payments never show the terms (`terms:false`); until it's on, the checkout tile is greyed: "Ask the owner or a manager…" | Built (Nov 25), not on a phone yet | Try on Oliver's iPhone |
| R5 | A place to turn it on + see its state | `/settings/tap-to-pay`: Off / Getting ready / On · ready, Turn on, Turn off on this iPhone; outside the iPhone app: steps to get there. Per iPhone (saved on the phone) | Built (Nov 25), not on a phone yet | — |
| R6 | New users are offered it during onboarding | Setup step 5 (card reader) has a Tap to Pay on iPhone card: in the iPhone app = Turn on right there (Apple's terms once); in a browser = where to turn it on later. Step can be skipped (no reader needed) | Built (Nov 25), not on a phone yet | — |
| R7 | Existing users are told it's there | iPhone app, owner/manager, iPhone can tap, not on yet: one-time sheet on Checkout "Tap to Pay on iPhone · Take cards on this iPhone" → Turn it on (Settings) / Not now (never again on this iPhone). Staff never see it | Built (Nov 25), not on a phone yet | — |
| R8 | Merchant education ("how to tap") | iPhone app 1.4: Apple's own screens (`ProximityReaderDiscovery`, `.payment(.howToTap)`, iOS 18+) via "How to tap": shown right after Turn on, in Settings, on the tap screen at checkout, in setup. iOS 16/17 or older app: our short steps (EN + VI) | Built (Nov 25), not on a phone yet | Needs app 1.4 build |
| R9 | Reader warmed up so the tap is fast; progress shown | App 1.3: after this iPhone's first tap, Tap to Pay connects when checkout opens + every time the app comes back (`keepTapWarm`, `/api/stripe/tap-ready`); never pops Apple's terms by itself; tile shows "Getting ready…" / "Ready to tap" | Built (Nov 25), not on a phone yet | Warm-up before the FIRST tap comes with R4 (terms in Settings) |
| R10 | Clear errors | App 1.3 sends a code (passcode, iCloud, terms, no internet, declined…) → our own words in English + Vietnamese (`checkout.tapErr.*`) | Built (Nov 25), not on a phone yet | — |
| R11 | 3 videos + checklist sent to Apple | None | To do | Steps 9–11 |
| R12 | Marketing: only Apple's toolkit, full name, Apple OKs press | None | Rule | Follow when we market it |

Score (Nov 25): 1 done · 9 built, not tried on a phone (R2–R10) · left: R11 (videos + checklist) · 1 rule.

## Steps (who · how long)

1. **Oliver · 10 min** — Put Apple's 2 PDFs in a session (drag in, or save to `docs/apple/`). I check every rule
   and update this plan.
2. **Oliver · 15 min** — Register your iPhone (UDID via udid.tech in Safari → developer.apple.com → Devices) and
   tick Tap to Pay on `com.polishos.app` (Identifiers). Same for any other test iPhone (Elang's).
3. **Oliver · 5 min** — Actions → "iPhone app → TestFlight" → Run workflow → "Test iPhone (Tap to Pay)".
   Tell Claude; Claude puts the install file in `public/ios/`. Install from polishosapp.com/ios/index.html.
4. **Oliver · 10 min** (R2) — First real try: Lotus Test Nails (Stripe sandbox) → Checkout → Charge → Tap card → $1 with
   a real card (sandbox = no money moves). Note what breaks.
5. **Claude · done Nov 25** (R3, R9, R10) — Checkout: iPhone tile = "Tap to Pay on iPhone" + Apple's symbol; reader warm-up on
   app open / back to screen; clear error words (EN + VI).
6. **Claude · done Nov 25** (R4, R5) — Turn on + terms: Settings → Payments → Tap to Pay on iPhone (owner/manager); accept
   Apple's terms there (not at checkout); staff see "Ask your owner"; saved per salon + per iPhone.
7. **Claude · done Nov 25** (R6, R7) — Tell owners: setup step "Take cards on your iPhone" (new salons) + one-time sheet for
   existing salons on an iPhone; both lead to step 6.
8. **Claude · done Nov 25** (R8) — "How to tap" screens: Apple's Merchant Education (`ProximityReaderDiscovery`) after
   turn-on, in Settings and a "?" on the tap screen. New app version 1.3 (Swift + bridge).
9. **Oliver · 1 hour** (R11) — Record the 3 videos on the iPhone (Control Center → Screen Recording), each start to end:
   - New User Flow: fresh install → sign in → new salon setup → offered Tap to Pay → accept terms → how-to screens → first payment.
   - Existing User Flow: existing owner signs in → sees the Tap to Pay sheet → turns it on → terms → how-to screens.
   - Checkout Flow: ticket → Charge → Tap to Pay on iPhone → tip → tap card → paid + receipt; plus a declined card.
   Claude writes a shot list (what to tap, in order) before you record.
10. **Claude + Oliver · 30 min** — Fill Apple's checklist (Claude drafts every answer, Oliver checks).
11. **Oliver · 15 min** — Reply to Apple's email + upload videos + checklist to their File Uploader.
12. **Wait** — Apple reviews (days to weeks). Fix what they ask, re-send.
13. **After the publishing OK** — TestFlight with Tap to Pay (workflow "TestFlight" gets tap back), then the
    App Store (move the app to EO Collective's account first).

Not blocking the review: printing in the iPhone app, M2 reader on iPhone.
