# PolishOS app for handheld terminals (PS10 / H10)

Status: works on a real PS10 (Nov 18, 2026): receipt with QR printed from a paid ticket.

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

## Build
- GitHub: Actions → "Terminal app (Android)" → the run → download `polishos-terminal-apk`.
- By hand: `ANDROID_HOME=<sdk> gradle assembleRelease` in this folder (Gradle 8.14, JDK 17+).
  Output: `app/build/outputs/apk/release/app-release.apk`.

## Install on a terminal
Quick way: on the terminal, open Chrome → `polishosapp.com/polishos-ps10.apk` → Download → open → Install
(the file in `public/`, built with the same signing key as the installed app, so it updates in place;
replace that file when a new version is built).

Or by hand:
1. Get `app-release.apk` onto the terminal (USB cable, or Google Drive).
2. Tap the file → allow "install unknown apps" for the app that opened it → Install.
3. Open PolishOS, sign in, print a test from Settings → Printer.

## Signing (before the pilot)
Without a fixed key each build is signed with a throwaway key: a new version won't install over the old
one (uninstall first; the sign-in on that terminal is lost, salon data is safe on the server).
For real use, make one key, keep it OUT of the repo, and pass it to the build:
`PS10_KEYSTORE`, `PS10_KEYSTORE_PASSWORD`, `PS10_KEY_ALIAS`, `PS10_KEY_PASSWORD`.

## Not in the app
- Bluetooth printers like the NETUM (use Chrome for those).
- "Continue with Google" sign-in (Google blocks it inside app windows): use phone, email or password.
- Card taps on the terminal's own NFC (Stripe Tap to Pay needs a Google-certified device; the PS10 is not).
