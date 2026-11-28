# PolishOS for iPhone / iPad (shell app)

Status (Nov 25, 2026): app 1.3 = Apple's Tap to Pay name + symbol, warm-up on open/coming back, error codes (EN/VI words in the web app). Code only. Builds in CI for the simulator; not tried on an iPhone yet.
Tap to Pay (Nov 24): Apple granted the **development** entitlement = test iPhones registered in our account only.
TestFlight / App Store can't carry Tap to Pay until Apple reviews 3 videos + a checklist and grants publishing
(see "Apple's Tap to Pay review" below).

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
7. GitHub → Actions → "iPhone app → TestFlight" → Run workflow → pick "TestFlight" (no tap).
   The workflow only shows up once this is on main.
8. iPhone: install the TestFlight app → you get the build (App Store Connect → TestFlight → add yourself as tester).

TestFlight builds use `PolishOS-NoTap.entitlements` (app works; pay link / M2 only, no tap) until Apple grants publishing.

## Test iPhone WITH Tap to Pay (development grant, no Mac needed)
1. Get the iPhone's UDID: open udid.tech (or get.udid.io) in Safari on the iPhone → install its profile → copy the UDID.
2. developer.apple.com → Devices → + → iOS, name "Oliver iPhone", paste UDID.
3. Identifiers → `com.polishos.app` → Capabilities (or Additional Capabilities) → tick **Tap to Pay on iPhone** → Save.
4. GitHub → Actions → "iPhone app → TestFlight" → Run workflow → "Test iPhone (Tap to Pay)".
5. Download the artifact `polishos-ios-test-<n>` → put `PolishOS.ipa` + `manifest.plist` in `public/ios/` (PR → main).
6. On the iPhone in Safari: polishosapp.com/ios/index.html → Install. First open: Settings → Privacy & Security →
   Developer Mode on. A new iPhone = add its UDID, run step 4 again.
7. Try: sign in → Checkout → ticket → Charge → "Tap card on this phone" (Stripe test mode = test card / any real card,
   no money moves in the sandbox). First time the owner accepts Apple's Tap to Pay terms (iCloud + passcode needed).

## Apple's Tap to Pay review (before TestFlight / App Store with tap)
Plan + tracking: `docs/tap-to-pay-iphone-plan.md` (requirements R1–R12, what's built, steps).
Apple's email (Nov 24) needs, once the app meets their requirements PDF + checklist (box links in the email):
1. Video "New User Flow" · 2. Video "Existing User Flow" · 3. Video "Checkout Flow" · 4. Filled checklist →
upload to Apple's File Uploader + reply to the email. Known must-haves (to build): Tap to Pay offered to the owner
during setup + in Settings, terms accepted by an admin inside the app, Apple's "how to tap" screens for staff
(ProximityReaderDiscovery), Tap to Pay shown as a clear option at checkout, warm-up (prepare reader) when the app
opens, Apple-approved names/icons only. Drop the 2 PDFs into the chat to check every line.

## Build
- CI: Actions → "iPhone app (iOS)" (macOS, simulator build, unsigned): proves it compiles.
- On a Mac: `brew install xcodegen && cd ios/PolishOS && xcodegen generate && open PolishOS.xcodeproj`,
  pick your team in Signing, run on an iPhone.

## Files
- `project.yml` (XcodeGen; the .xcodeproj is made from it, not kept in git), `PolishOS/Info.plist`,
  `PolishOS/PolishOS.entitlements`.
- `AppDelegate.swift` (start), `WebViewController.swift` (window, `window.PolishOSApp` bridge for polishosapp.com
  only, links, camera, alerts), `CardReader.swift` (Tap to Pay + M2).

## iPhone Duo (foldable) — build with Xcode 27.1+
Apps built with an older iOS SDK open on the iPhone Duo's inner screen at iPhone size with black bars
(plus Apple's shrink / rotate buttons). Built with Xcode 27.1 or newer (iOS 27.1 SDK) the app fills the
open screen and the web page inside switches to its tablet layout by itself. Both workflows
(`ios.yml`, `testflight.yml`) run on GitHub's `xcode-27` image with the newest released Xcode 27 (27.2 on Nov 28); they stop
with a clear message if the Mac has none. After a build, install the new version on the phone.
