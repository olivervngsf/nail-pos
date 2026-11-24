# PolishOS for iPhone / iPad (shell app)

Status (Nov 24, 2026): code only. Builds in CI for the simulator; not signed, not tried on an iPhone yet.

What it is: the PolishOS web app (polishosapp.com) in its own full-screen window, plus taking cards.
Same idea and same messages as the Android app (`android/ps10`). Every screen stays in the web app.

## Taking cards
- **Tap to Pay on iPhone** (iPhone XS or newer, latest iOS): the client taps the card or phone wallet on the top of
  the iPhone. Web: How to pay → "Tap card on this phone" (shown only when the app's `tapCheck` says yes).
- **Stripe Reader M2** over Bluetooth: How to pay → "Small card reader".
- Flow (both): tip on screen → `/api/pay/start` method `app` → web sends `{"pay", "locationId", "simulated", "tap"}`
  → `CardReader.swift` (Stripe Terminal iOS SDK 5.8.1) takes the card → server checks with Stripe → paid.
- Connection tokens: the app asks the page (`{"event":"token"}` → `/api/stripe/terminal-token`).
- First Tap to Pay use: the owner accepts Apple's terms once (needs iCloud sign-in and a passcode on the iPhone).

## Not in the app yet
- Printing (`{"print"}` answers "not ready"; the web app knows: `appHasPrinter()` is false in the iPhone app).
  Later: Bluetooth printers (NETUM etc.) through CoreBluetooth, which iPhone web can't do.
- Apple's required Tap to Pay "how to tap" screens for staff (ProximityReaderDiscovery, iOS 18) and the
  Tap to Pay launch checklist: needed before the App Store, not for TestFlight testing.

## Account (Nov 24): Oliver's PERSONAL Apple Developer account (paid). Testing now; move to EO Collective
(company account, needs D-U-N-S) before the first paying salon: Apple converts the account or we transfer the app.

## Steps to get it on an iPhone (TestFlight)
1. developer.apple.com → Account → Membership details: copy the **Team ID** (10 letters/numbers).
2. Ask for Tap to Pay: developer.apple.com/contact/request/tap-to-pay-on-iphone (testing access first).
3. Identifiers → + → App IDs → App → Bundle ID `com.polishos.app` (explicit), description "PolishOS". Once Apple
   grants Tap to Pay, tick "Tap to Pay on iPhone" on this ID.
4. appstoreconnect.apple.com → Apps → + → New App: iOS, name "PolishOS" (or "PolishOS Salon" if taken), bundle ID
   `com.polishos.app`, SKU `polishos`.
5. App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → + : name "GitHub",
   role **Admin** → download the .p8 (only once) and note the **Key ID** + **Issuer ID**.
6. GitHub → repo Settings → Secrets and variables → Actions → New secret (×4): `APPLE_TEAM_ID`, `ASC_KEY_ID`,
   `ASC_ISSUER_ID`, `ASC_KEY_P8` (open the .p8 in a text editor, paste ALL of it). Never paste these in chat.
7. GitHub → Actions → "iPhone app → TestFlight" → Run workflow (tick Tap to Pay only after step 2 is approved).
   The workflow only shows up once this is on main.
8. iPhone: install the TestFlight app → you get the build (App Store Connect → TestFlight → add yourself as tester).

Until Tap to Pay is granted, builds use `PolishOS-NoTap.entitlements` (app works; pay link / M2 only, no tap).

## Build
- CI: Actions → "iPhone app (iOS)" (macOS, simulator build, unsigned): proves it compiles.
- On a Mac: `brew install xcodegen && cd ios/PolishOS && xcodegen generate && open PolishOS.xcodeproj`,
  pick your team in Signing, run on an iPhone.

## Files
- `project.yml` (XcodeGen; the .xcodeproj is made from it, not kept in git), `PolishOS/Info.plist`,
  `PolishOS/PolishOS.entitlements`.
- `AppDelegate.swift` (start), `WebViewController.swift` (window, `window.PolishOSApp` bridge for polishosapp.com
  only, links, camera, alerts), `CardReader.swift` (Tap to Pay + M2).
