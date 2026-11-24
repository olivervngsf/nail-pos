# PolishOS app for handheld terminals (PS10 / H10)

Status: works on a real PS10 (Nov 18, 2026): receipt with QR printed from a paid ticket.
Cards (Nov 19, 2026): the practice reader took a full payment on the PS10 (tip on screen, paid, recorded). Real M2 not tried yet.

What it is: the PolishOS web app (polishosapp.com) in its own full-screen window, plus direct printing on
the terminal's built-in printer. No RawBT, no printer to pick.

Why an app: the built-in printer ("InnerPrinter", Bluetooth address 00:11:22:33:44:55) is an old-style
Bluetooth serial device. A web page in Chrome can't open it; an Android app can.

## How printing works
- The app offers `window.PolishOSApp` to pages from polishosapp.com only.
- The web app (`src/lib/print/bluetooth.ts`, `inApp()` / `appPrint`) sends `{"id","print": base64 ESC/POS}`.
- `InnerPrinter.java` writes the bytes to InnerPrinter and answers `{"id","ok":true}` or `{"id","error"}`.
- First print asks for "Nearby devices" (Android's name for the Bluetooth permission).

## Card reader (Stripe Reader M2), app 1.1+
- The small Stripe reader next to the terminal, over Bluetooth, through Stripe's Terminal SDK (`CardReader.java`).
- Flow: web app → Pay → "Small card reader" → client picks a tip on the terminal → server makes the payment
  (`/api/pay/start` method `app`) → web sends `{"pay": client secret, "locationId", "simulated"}` → the app finds +
  connects the reader (first time: Nearby devices + Location are asked; a new reader may update itself for a few
  minutes) → card is tapped / inserted / swiped → server checks with Stripe and marks the ticket paid.
- The app asks the web page for Stripe connection tokens (`{"event":"token"}` → `/api/stripe/terminal-token`).
- Stripe test mode: "practice reader" (Stripe's simulated reader, no hardware) or the real M2 with Stripe's
  physical test card. Never a real card in test mode.
- Other messages: `{"reader": "status" | "connect" | "disconnect" | "cancel"}`.
- Tap to Pay on the terminal's own NFC is NOT possible on the PS10: Google has not certified the device
  (Play Store → Settings → About → "Device is not certified"), which Stripe requires.

## Tap to Pay on a regular Android phone, app 1.2+ (Nov 24, 2026; not tried on a phone yet)
- Same app, any Google-certified Android phone with NFC, Android 11+ (Pixel, Samsung…). No reader: the client taps
  the card or phone wallet on the back of the phone. Stripe library `stripeterminal-taptopay` (same version as the
  reader kit); Stripe's own "hold the card here" screen runs in a second process (`App.java` skips our start there).
- Web app: on How to pay the page asks the app `{"reader":"tapCheck"}` → `{supported, reason, nfcOff}`; only a phone
  that says yes shows "Tap card on this phone" (`canTapToPay` in `src/lib/app/reader.ts`). Then the same steps as the
  M2: tip on screen → `/api/pay/start` method `app` → `{"pay", "locationId", "simulated", "tap": true}` → paid.
- Rights: Location only (no Bluetooth). NFC must be on. Developer options / screen sharing / a rooted phone = refused.
- Test mode: "practice tap" (Stripe's simulated tap, no card) or a real tap with Stripe's physical test card.
- Same fee as the M2 (in-person card rate). The PS10 answers "not supported" and keeps the M2.
- To try: install the 1.2 file on a Pixel/Samsung, sign in, open a ticket → How to pay → Tap card on this phone.

## Build
- GitHub: Actions → "Terminal app (Android)" → the run → download `polishos-terminal-apk`.
- By hand: `ANDROID_HOME=<sdk> gradle assembleRelease` in this folder (Gradle 8.14, JDK 17+).
  Output: `app/build/outputs/apk/release/app-release.apk`.

## Install on a terminal
Quick way: on the terminal, open Chrome → `polishosapp.com/polishos-ps10-v1.1.apk` → Download → open → Install
(the file in `public/`, built with the same signing key as the installed app, so it updates in place).
The file name ends with the app version (Oliver, Nov 19): a new build = a new file `polishos-ps10-v<version>.apk`
(same number as `versionName` in `app/build.gradle`); remove the old file.
Putting a new version there (Nov 24): GitHub → Actions → "Terminal app (Android)" → Run workflow → tick **Publish**.
The run builds the app, puts the file in `public/` on a branch `apk/v<version>-<run>` and opens a pull request
(swaps the old file, updates this README); merge it and the link is live. Same file for Tap to Pay phones.
Until the fixed signing key below is set up, each build has its own key: uninstall the old app before installing
a new one (the sign-in on that device is lost; salon data is safe on the server).

Or by hand:
1. Get `app-release.apk` onto the terminal (USB cable, or Google Drive).
2. Tap the file → allow "install unknown apps" for the app that opened it → Install.
3. Open PolishOS, sign in, print a test from Settings → Printer.

## Signing (before the pilot)
Without a fixed key each build is signed with a throwaway key: a new version won't install over the old
one (uninstall first; the sign-in on that terminal is lost, salon data is safe on the server).
For real use, make one key, keep it OUT of the repo, and pass it to the build:
`PS10_KEYSTORE`, `PS10_KEYSTORE_PASSWORD`, `PS10_KEY_ALIAS`, `PS10_KEY_PASSWORD`.
In GitHub (Nov 24): repo secrets `PS10_KEYSTORE_B64` (the .jks file in base64) + `PS10_KEYSTORE_PASSWORD`,
`PS10_KEY_ALIAS`, `PS10_KEY_PASSWORD`; the Android workflow uses them when they are there.

## Not in the app
- Bluetooth printers like the NETUM (use Chrome for those).
- "Continue with Google" sign-in (Google blocks it inside app windows): use phone, email or password.
- Card taps on the PS10's own NFC (Stripe Tap to Pay needs a Google-certified device; the PS10 is not). Regular
  certified Android phones can: see Tap to Pay above.
