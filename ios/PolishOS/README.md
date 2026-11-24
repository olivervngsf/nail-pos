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

## What Oliver needs to do
1. Apple Developer account ($99/yr), ideally in the company name (EO Collective; needs a D-U-N-S number).
2. Ask Apple for the Tap to Pay on iPhone entitlement (developer.apple.com → Tap to Pay on iPhone → Request).
   Without it a signed build fails (`PolishOS.entitlements`).
3. Then: signing key + App Store Connect API key as GitHub secrets → CI uploads to TestFlight (next step).

## Build
- CI: Actions → "iPhone app (iOS)" (macOS, simulator build, unsigned): proves it compiles.
- On a Mac: `brew install xcodegen && cd ios/PolishOS && xcodegen generate && open PolishOS.xcodeproj`,
  pick your team in Signing, run on an iPhone.

## Files
- `project.yml` (XcodeGen; the .xcodeproj is made from it, not kept in git), `PolishOS/Info.plist`,
  `PolishOS/PolishOS.entitlements`.
- `AppDelegate.swift` (start), `WebViewController.swift` (window, `window.PolishOSApp` bridge for polishosapp.com
  only, links, camera, alerts), `CardReader.swift` (Tap to Pay + M2).
