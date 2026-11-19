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

## Build
- GitHub: Actions → "Terminal app (Android)" → the run → download `polishos-terminal-apk`.
- By hand: `ANDROID_HOME=<sdk> gradle assembleRelease` in this folder (Gradle 8.14, JDK 17+).
  Output: `app/build/outputs/apk/release/app-release.apk`.

## Install on a terminal
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
- Card taps on the terminal's NFC (needs Stripe's Tap to Pay; later).
