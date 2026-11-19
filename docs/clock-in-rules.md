# Clock-in rules: no clocking in from home

Plain words, to explain to salon owners (and our own team). Set Nov 19. In the app: **Settings → Clock-in**.

## The rule
- **Salon devices always work.** The time clock tablet and the front desk: tap your face, type your PIN.
- **Staff phones:** the owner or manager picks one:

| Choice | What staff do | Good for |
|---|---|---|
| **Salon devices only** (default, safest) | Clock in on the salon tablet. Phones can't. | Most salons |
| **Phone + QR at the salon** | Open the camera, scan the QR on the time clock tablet, tap Clock in. | Busy salons; works on every iPhone and Android, no password |
| **Phone on the salon Wi-Fi** | Be on the salon's Wi-Fi, tap Clock in in the tech app. | Salons that give staff the Wi-Fi password |
| **Phone: QR or salon Wi-Fi** | Either one. | Mixed |

## Why it can't be done from home
- **QR:** the code changes every 30 seconds. A photo taken home is old within a minute.
- **Wi-Fi:** our server checks the internet address the phone is coming from, not what the phone says. Home Wi-Fi and phone data (4G/5G) are refused.
- Phone clock-ins only go through our server, never straight to the database.

## Wi-Fi: what to tell the owner
- "Save this Wi-Fi" saves the salon's **internet address**, not the password. Do it once on setup day, on a device that is on the salon Wi-Fi (front desk computer is easiest).
- **Staff phones must be on the salon Wi-Fi** for this to work. Many salons keep the password on salon devices only, so staff phones won't be on it: then use **QR** instead.
- If the internet company changes the salon's address (rare, sometimes after a router restart), Wi-Fi clock-in stops until the owner taps "Save this Wi-Fi" again. QR keeps working.
- Two internet lines or a new router? Save each one (you can save more than one).

## Records
- Every clock-in/out is saved with where it came from: salon device, QR or Wi-Fi.
- Refused tries are logged (PIN activity / salon activity log) with the reason (phones off, old QR, not salon Wi-Fi).
- Forgot to clock in? A manager fixes it with their PIN; the fix is logged.

## Not used (on purpose)
- **GPS:** easy to fake, drains battery, asks permission every time, poor indoors.

## Tech notes
Migration `20261229000002_clock_rules` (applied to test; was `20261225000001`, renamed Nov 19: shared a number with `admin_system`): `salons.clock_rules.phone` (off | qr | wifi | qr_or_wifi), `salon_wifi` (saved addresses, IPv4 or IPv6 /64), `clock_secrets` (QR key), `clock_events.via` (device | qr | wifi). Server routes `/api/clock/phone` (`_clock_phone`) and `/api/clock/wifi` (`_clock_wifi_add`, `_clock_wifi_here`); `clock_qr` for salon devices; old `clock_self` closed to the app. Screens: `src/app/settings/clock-in`, `src/components/ClockQr.tsx` (on `/clock`), `/t/clock` (scan page), tech Home clock button. Texts: `src/lib/clockrule.ts`. SQL test `supabase/tests/session17_clock_rules.sql`.
