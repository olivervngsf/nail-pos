# Design build spec — Checkout + Onboarding

Back to: [Nail POS Hub](https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU)

Use this to build the screens so they match the designs pixel for pixel, with the same interactions and motion.
If this file and the design source disagree, the **source files win**.

## 1. Sources of truth

| What | Where |
|---|---|
| Live boards (click Play to try them) | Checkout: https://claude.ai/artifact/ArXa9za1gubGLWzEUH6GLw · Onboarding: https://claude.ai/artifact/1A5maZvg44WyCY5gugLVym |
| Exact source (HTML + CSS of every screen) | `design/checkout/*.dc.html`, `design/onboarding/*.dc.html` |
| Shared styles (tokens, components, motion) | `design/checkout/pos.css` (both flows use it), `design/onboarding/setup.css` (wizard shell) |
| Board layout + screen titles | `design/*/canvas.json` |
| Colors / type rules behind it | Nail Salon OS Design System https://claude.ai/artifact/FAPieCxsXFJvSAyzgZ4b2L |

If the boards get edited in Claude Design, re-copy the files into `design/` before building.

### How to read a `.dc.html` file (to turn it into React)
- Markup inside `<x-dc>` = the JSX. `class` = `className`. Inline `style` = exact values to keep.
- `{{name}}` = a value from `renderVals()` in the `<script type="text/x-dc">` at the bottom.
- `<sc-for list="{{items}}" as="x">` = `items.map(x => …)`. `<sc-if value="{{flag}}">` = `{flag && …}`.
- `onClick="{{fn}}"` = an event handler. `this.state` / `setState` = React `useState`.
- `<a href="Other.dc.html">` = navigate to that screen (route).
- `ds/…/styles.css` link = the design system base; `pos.css` / `setup.css` hold everything the screens actually use.

## 2. Look and feel (tokens)

Compact, calm, Apple-like. Flat surfaces, soft shadows, one dark primary action, color only for meaning.

### Colors (`pos.css :root`)
| Token | Hex | Use |
|---|---|---|
| `--ink` | #1C1C1E | Text, primary button, selected state, focus |
| `--ink-soft` | #5C5C5E | Secondary text, captions (passes 4.5:1 on white) |
| `--muted` | #8E8E93 | Dashed borders, disabled — never body text |
| `--line` | #E5E5EA | Hairlines, row dividers, input borders |
| `--paper` | #FFFFFF | Cards, groups, inputs |
| `--surface` | #F5F5F7 | Page background, stat tiles |
| `--fill` | #EFEFF2 | Default button, segmented control, chips |
| `--jade` / `--jade-soft` | #2F9E44 / #EAF5EC | Money OK, paid, saved, connected (dots, borders, tints — not small text) |
| `--orange` / `--orange-soft` | #E8590C / #FDEEE6 | Needs attention: offline, waiting, warnings |
| `--red` | #E03131 | Real problem; "Switch person" text |
| Stripe tile | #635BFF | Stripe logo tile only |
| Apple Pay button | #000000 | Client pay button only |

Selection is **ink**, never jade (jade = money/OK only). Color is never the only signal: always a dot/mark + words.

### Type (system font: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto`)
| Class | Size / line | Weight | Letter spacing |
|---|---|---|---|
| `.h1` | 28/34 (hero variants 40/46) | 700 | −0.025em |
| `.h2` | 20/26 | 600 | −0.02em |
| `.money` | 34/40 (variants 26, 28, 30, 40, 44, 56) | 700 | −0.03em, tabular numbers |
| body / rows | 15–17 | 400–600 | −0.01em |
| `.cap` | 13/18 | 400 | 0 |
| `.eyebrow` | 12, UPPERCASE | 600 | +0.04em |
- Every money number uses `font-variant-numeric: tabular-nums` (`.num`).
- Font smoothing: `-webkit-font-smoothing: antialiased`.

### Radius, shadow, spacing
- Radius: `--r-sm` 10px (buttons), `--r-md` 14px (groups, primary button), `--r-lg` 20px (cards, tiles); inputs 12px; pills 999px.
- Shadow `--shadow`: `0 0.5px 0 rgba(0,0,0,.04), 0 6px 24px rgba(28,28,30,.06)`. Hover lift on tiles: `0 10px 30px rgba(28,28,30,.10)`.
- Spacing: 4-pt steps (4/8/10/12/14/16/20/24/28/32/40/48/64). Main content padding: desktop 20–24px (checkout), 40px 64px (setup); phone 20px.
- Easing everywhere: `--ease: cubic-bezier(.2,.8,.2,1)`.

## 3. Components (exact CSS in `pos.css` / `setup.css`)

| Component | Spec |
|---|---|
| App shell (desktop) | 1280×800. Left rail 76px (logo 36px dark square r10, items 60px wide, 22px stroke icons 1.75, 11px labels; active = `--fill` bg + 600). Top bar 56px, translucent `rgba(245,245,247,.8)` + `backdrop-filter: saturate(180%) blur(20px)`, hairline bottom. |
| Wizard shell (setup) | 1280×800. Side 288px: brand row, progress bar 4px (fill animates width .6s), 10 step rows 40px (number circle 24px; done = filled ink + ✓; now = `--fill` bg + bold). Help box at bottom. Footer 76px: Back (ghost) · spacer · Saved pill · Continue (primary, 200px). |
| Phone shell | 390×844, `--surface` bg, top bar 52px centered 17/600 title. |
| `.btn` | 44px tall, r10, `--fill` bg, 15/600. Hover `#E6E6EA`. Press `scale(.98)`. |
| `.btn.primary` | 52px tall, r14, ink bg, white 17/600. Hover opacity .88. |
| `.btn.ghost` | transparent, ink-soft text, hover `--fill`. |
| `.pill` | 28px, r999, 13/500. `.ok` = jade-soft + 7px jade dot ("Saved", "Connected"). `.warn` = orange-soft + orange border + ▲ ("Offline · 3 tickets waiting to sync"). |
| `.group` + `.row` | iOS-style grouped list: white, r14, shadow; rows min 52px, 16px side padding, hairline between, last row no line. |
| `.card` | white, r20, shadow. |
| `.tile` | white card, r20, 20px padding; hover = translateY(−2px) + bigger shadow (.25s). Icon well `.ico` 40px r12 `--fill`. |
| `.seg` | segmented control: `--fill` track, 3px padding, r10; option 30px, 13/600; selected = white + small shadow. |
| `.av` | avatar circle 32px (`.lg` 52px), `--fill`, initial 13/600. |
| `.tag` | 22px pill 12/600; `.jade` variant for "Regular", "PIN set", "#3 in line". |
| `.inp` | 48px, r12, `--line` border, 17px text; focus = ink border + `0 0 0 3px rgba(28,28,30,.08)` ring. |
| `.chip` | 36px pill, 14/500; `.on` = ink bg + white. |
| `.toggle` | iOS switch 44×26, knob 22px; on = jade, knob slides 18px (.25s). |
| Keypad keys | Cash: 60px tall, r14, white + light shadow, 24/500, press scale .96. PIN: 64px circles, press scale .94 + `--fill`. |

Icons: one line-icon style, 24 viewBox, stroke 1.75, round caps/joins, no fill, `currentColor`. Always paired with a text label.

## 4. Motion (all in `pos.css`)

| Name | What it does | Timing | Used for |
|---|---|---|---|
| `.in` / `.in2` / `.in3` | fade + rise 8px | .45s ease, delays 0 / .08s / .16s | Every screen's sections on arrival, in reading order |
| `.fade` | opacity 0→1 | .6s ease | Swapping states inside a screen (reader steps, code entry, connect, test result, language text) |
| `.pop` | scale .6→1.06→1 + fade | .5s ease | Success checks (paid ✓, connected ✓, device ✓, PIN saved) |
| `.pulse` | opacity 1↔.35 loop | 1.4s | "Waiting" dots/rings (reader, QR waiting, Stripe, test steps) |
| Hover/press | bg .2s; tiles lift .25s; buttons press scale .98 | | All controls |
| Progress bar | width change .6s | | Setup side bar |
| Selected-state swaps | background/color .2–.3s | | Tip buttons, cash amounts, chips, pay type |

Rules:
- Motion only shows a change of state. No bouncing lists, no decoration loops except "waiting" pulses.
- `@media (prefers-reduced-motion: reduce)` turns **all** animation and transition off; screens must still read correctly.
- Duration ceiling ~0.6s; nothing blocks input while animating.

## 5. Checkout flow (desktop 1280×800 + phone 390×844)

Example data used everywhere: Ticket #1042, client **Lan Tran** (408) 555-0142, Kim — Gel manicure $35 (45 min), Ngọc — Deluxe pedicure $55 (60 min), regular discount −$5, gift card ••4821 −$20 ($50 → $30 left), due $65.00, tip $18 → card $83.00, Visa ••4242.

| # | Screen (file) | Layout | Interactions → goes to |
|---|---|---|---|
| 1 | Ticket (`Main`) | Rail + bar ("Ticket #1042", Saved pill, "Hạnh · Front desk" → Profile). Left: "Services" h1 + segmented By staff / By service; grouped rows per service (avatar, name, staff · time, price); "Add service" row (dashed avatar); buttons Discount $/%, Gift card, Note; total card (Services, discount, gift card, hairline, "Due now" money 34px + **Charge $65.00** primary 260px). Right card 320px = client panel: avatar 52, name, phone, "Regular" tag; 3 stat tiles (12 visits, $68 avg ticket, 4 wk comes every); Last visit; Notes; Gift card balance; "Open client profile →". | Charge → Pay |
| 2 | Pay (`Pay`) | Centered: ticket line, **$65.00** 56px, "+ tip". 2×2 tiles max 880px: Card reader (fee 2.7% + 5¢ · paid by salon), Cash (No fee · works offline), QR code / pay link (fee 2.9% + 30¢), Split. | Card → Reader · Cash → Cash · QR → PhoneQR · Split = not designed yet · "‹ Ticket" back |
| 3a | Card reader (`Reader`) | Left card: amount, 4-step grouped list; offline warning box (orange-soft); buttons Cancel · other method, Replay, "See paid screen →". Right: phone-shaped reader mock 320×600 (r40 frame, r30 screen). | **Auto-plays**: every 2.2s step advances 1→4. Step states: done = ink ✓ (pop), now = orange ring + pulsing dot + bold, next = grey ring. Reader mock swaps with `.fade`: "Add a tip?" (18% $11.70 / 20% $13.00 / 25% $16.25, Custom $18.00 selected, No tip, "100% of your tip goes to your nail staff.") → "Tap, insert or swipe" $83.00 with pulsing ring → "Approved" ✓ pop. Replay restarts. |
| 3b | Cash (`Cash`) | Bar shows **warn** pill "Offline · 3 tickets waiting to sync". Left card: Due $65.00; "Client gave" 4 quick buttons $65/$70/$80/$100; Change box (money 40px); cash tips per staff inputs (Kim $7.00, Ngọc $11.00); note "No internet needed…". Right: 3×4 keypad, **Cash received**. | Tapping a quick amount selects it (ink) and recomputes Change = given − 65 (fade). Cash received → Done. Keypad not wired yet (build: typing sets "Client gave"). |
| 4 | Paid (`Done`) | Bar pill "Confirmed by Stripe". Left card: ✓ pop 56px, **$83.00** Visa ••4242, sub line; table Staff / Service / Card tip / Fee on tip (Kim $35 $7 $0; Ngọc $55 $11 $0); note on tip split; "Money for this ticket" box: Card charged $83.00, Card fee −$2.29, Tips to staff −$18.00, **Salon keeps $62.71**. Right: Receipt group (Print, Text (408)…, Email, No receipt), "Book next visit?" card (Mon, Dec 14 with Kim, Book it), **New ticket**. | Text → PhoneClientReceipt · New ticket → Ticket |
| P1 | QR (`PhoneQR`) | Amount, QR 220px in card, pulsing orange dot "Waiting for Lan to pay…", Text pay link button, primary "Client scans → their phone", fee note. | → PhoneClientPay |
| P2 | Client pays (`PhoneClientPay`, EN) | Line items group; "Add a tip" 3×2 grid (18%, 20%, 25%, No tip, Custom $18, $10); Total (money 30px); black Apple Pay button; Pay with card; "Secured by Stripe · Google Pay on Android". | Tap tip → selected (ink) and Total updates with fade. Pay → PhoneClientReceipt |
| P3 | Receipt (`PhoneClientReceipt`, EN) | ✓ pop 72px, "Thank you, Lan!", $83.00, salon/date/ticket; full line items incl. tip and card; "See you around Dec 14?" + Book next visit; "Reply STOP to stop texts." | static |
| P4 | Staff share (`PhoneStaff`) | Paid notification card (jade border) "+$28.00"; This ticket: service $35, commission 60% $21, card tip $7, card fee on tip $0; Today tiles (Earned $186 / 6 clients, Tips $54 = $38 card + $16 cash); formula line "(Services $310 × 60%) + Tip $54 = $240"; Print my earnings. | Avatar → Profile |
| P5 | Profile (`Profile`) | Avatar 76, name, role; Language group: English / Tiếng Việt with ✓; note "Only changes your screens…"; PIN / Phone / My earnings rows; "Switch person" (red). | Tap language → all labels on this screen switch EN↔VI live; ✓ fades between rows. |

## 6. Onboarding flow (owner setup, 1280×800 wizard + staff phone)

Side steps (same on all): 1 Sign up · 2 Salon info · 3 Services · 4 Staff + PIN · 5 Payments · 6 Card reader · 7 Printer · 8 Salon device · 9 Clients · 10 $1 test. Progress bar width = (current + 0.5) / 10.

| # | Screen (file) | Content | Interactions → goes to |
|---|---|---|---|
| 1 | Sign up (`Main`) | "Let's set up your salon." 40px; cell phone input; email (backup) input; **Text me a code**; terms line. | Text me a code → swaps (fade) to "Enter the 6-digit code": 6 boxes 52×60 r12 (6th has ink border = cursor), **Verify** → Info, "Change number" goes back, resend timer line. |
| 2 | Salon info (`Info`) | Name, salon phone, address (2-col grid, max 820); Open days chips (Sun off) + hours caption; state chips California / Texas / Minnesota / Other; lock card. | Pick state → lock card text changes (fade). CA/MN: "Tip rules locked by state law…"; others: "safe default, changeable in Settings". |
| 3 | Services (`Services`) | Choose: **Snap your menu** (main, 2px ink border, "Fastest · ~1 min") or **Start from a nail template**. Reading: paper-menu photo 240×320 with green scan band (1.6s loop) + 4 checks ticking every 0.7s. List: rows = toggle, name + "read as “Gel Mani”", min · category, price input 96px; unsure rows get orange ▲ tag + orange price field ("50+" price, guessed time). | Snap → reading → AI list. Template → template list (Acrylic full set off). Retake photo / Snap menu instead → back to choose. Toggle → row dims 45%, count updates. Continue grey until a list exists; label "Looks right · Continue" for AI list. Build: photo/PDF upload → AI extraction; nothing saved until owner confirms. |
| 4 | Staff (`Staff`) | Team list = buttons (tap → detail). Right panel swaps (fade) between: **How staff join** (4 steps), **Add staff** form (name, phone with live validation, role segmented, pay type 3 buttons + stepper: Commission %, Hourly $/hr, Booth $/wk), **Person detail** (avatar, role, pay, 4-step invite timeline with times, actions). Toast bottom-center: ink pill, Undo, 3px drain bar 6s. Footer note "N invites waiting — they can finish later". | + Add staff → form. Phone <10 digits → "Enter a 10-digit cell number"; number on team → "already belongs to Kim"; Add disabled. Add + text invite → row appended with green flash → "Sending text…" (pulse, 1.2s) → "Text sent" + toast "Invite texted to Lan · Undo". Undo → row removed. Row tap → detail: Resend text (toast "old link stops working"), Set up on this iPad (QR), Demo finish → "Opened link" → 1.6s → "PIN set ✓"; Reset PIN → back to Text sent; Remove → row gone, toast "past tickets and pay stay on record". Full map: `StaffFlowMap`. |
| 5 | Payments (`Payments`) | One centered column 560px: title; fee group with 32px line-icon wells (reader 2.7%+5¢, QR 2.9%+30¢, in your bank 2 business days, Nail POS cut $0); "Have these ready" checklist card (EIN/SSN, bank + routing, photo ID); full-width **Connect with Stripe**; note. | Connect → card "Finish in the Stripe window" (pulse) → 3s → "Payments connected" ✓ pop + Business / Bank ••6789 / Payouts. Cancel → start. Demo "Stripe needs more info" → "Almost done" warn card: Fix in Stripe / Do it later (→ Devices). Continue grey until connected. |
| 6–8 | Devices (`Hardware`) | 3 cards: Card reader (code "apple · river · seven"), Receipt printer (Epson TM-m30III found), Salon device (nailpos.app/desk · 4FQ-82K). Reader starts done. "Skip for now" in footer. | Tap a card's button → card gets 2px jade ring, ✓ pops, done text fades in, side steps advance. |
| 9 | Clients (`Clients`) | 3 option cards: Upload a file / We help type them in / Start fresh. Import result card: 412 found, 380 with a phone, 12 duplicates merged; orange note "no marketing texts until they say yes". | Pick option → 2px ink border; Upload shows import card, others show the "start fresh" card (fade). |
| 10 | $1 test (`Test`) | "One last check: a $1 test" + explainer + **Charge $1.00**. | Runs 4 checks, one every 0.9s (charged → receipt printed → Stripe confirmed → refunded), each ✓ pops. Then "Mai Nails is ready." ✓ pop 84px, summary group, Run test again, **Open front desk**. Progress bar → 100%. |
| S1 | Staff joins (`StaffInvite`) | Messages: text bubble (r18 18 18 4, #E9E9EB) with tappable link. App sheet r24 with 4-segment progress bar: **Is this you?** (name, salon, role, pay; "Pay looks wrong? Ask Mai") → **Pick language** (two 64px buttons) → **Make PIN / Type it again** (4 dots, round keypad 64px) → **PIN saved**. | Link → confirm. Not me → "Thanks — we told Mai Nails", link off. Yes → language; choice switches all later text (EN/VI strings in file). PIN: digit fills dot; ⌫ deletes; at 4 digits (0.25s): weak (1111, 1234, 4321, 0123, 9876) → dots shake .4s + red "Too easy" and clear; else → confirm. Confirm mismatch → shake + "PINs don't match", back to create; match → saved ✓ pop → Continue → StaffClockIn. |
| Map | Staff flow map (`StaffFlowMap`) | 1800×844 board: owner lane (7 boxes), staff lane (7 boxes), 10 "What if…" cards. | Reference only. Proposals to confirm: 24 h reminder text, invite link expires after 7 days, "Wrong number" tag after "Not me". |
| S2 | First clock-in (`StaffClockIn`) | Date + time 44px; 220px round button. | Tap → button turns white with jade ring "Clocked in ✓"; details fade in (clocked-in time, "#3 in line", first appointment). Tap again = clock out. |

## 6a. Step frames + annotations (both flows)
- Each flow also appears as a row of **step frames** (one per state, incl. errors) at the top of its board, 1640×800: the real screen (1280) + an **Annotations** panel (360). Orange numbered pins on the screen match the notes. Styles: `annot.css`.
- Checkout frames: `Tk1–Tk7` (ticket → add-service drawer → pick staff → line added → discount drawer → gift card drawer → ready), `Rd1–Rd4` (tip → tap → approved → declined), `Cs1–Cs2` (change → not enough).
- Onboarding frames: `Stf1–Stf6`, `Svc1–Svc5`, `Pay1–Pay4`.
- Ticket drawers (`Main.dc.html`, prop `scenario`): 440px right drawer, slides in .35s over an ink/22% scrim; Add service = search + service list → staff list with facts (request, turns, $ today, free at); Discount = amount chips ($5/$10/10%/15%) + "Takes off" preview + reason chips + manager PIN (4 dots) → Apply (grey until PIN); Gift card = number/scan + Look up → dark balance card → use amount stepper ($5 steps, max balance/due) → Apply. Totals recompute live.
- Reader props `step` (1–4) + `declined`; declined = red row + reader ✕ + Try again. Cash prop `given`; less than due = orange "Still due", Cash received disabled.

## 6c. Booking (board: https://claude.ai/artifact/VHeTS9Sd81pm1KbTNj9KUb, source `design/booking/`)
- **Calendar (`Cal.dc.html`, 1440×900)** — base = Oliver's built calendar. Layout: rail 76 · top bar 56 (date, Day/Week/Month, search `/`, Alerts, + Book `N`) · overlap banner 34 · waitlist 240 left + mini month · filters + counts bar · staff header 56 (turns, appts, NEXT, Cover →) · grid 5 × 166 px columns, 66 px/hour, 9 AM–7 PM · Up next 240 right. Interactions: click empty → quick-book card beside the slot (pop .22 s); drag empty → create with length (dashed ghost, 15-min snap); drag booking → move (lifted shadow, can change staff); drag bottom edge → resize; hover → peek card (tap pins it); waitlist card → drag onto a column; counts → filter (others 18% opacity); Cover → move late staff's bookings + text; every change → toast with Undo (6 s). Overlaps sit side by side in the column. Frames D1–D10.
- **Booking page (`BookWeb.dc.html`)** — one page for every channel. Header with owner photos, ★ rating, hours, Directions; "Book for me / Book a group"; services with search + category chips (Combos first), multi-select rows, add-ons under the picked service; **Your visit** cart (items, total time, total, Continue grey until picked); staff per service; next available + time slots that fit all items; phone first → "Welcome back" + optional inspiration photo; done. Frames W1–W8.
- **Owner settings (`PageSettings.dc.html`)** — photos upload/reorder/cover; channels (Google connect, website button code, bio link, QR poster, text links, kiosk); rules; bookings by source. Frames P1–P3.
- **Walk-in kiosk (`Kiosk.dc.html`, iPad 1024×768)** — welcome + live wait → phone → "same as last time?" + service tiles + optional staff → ticket # + text. Frames K1–K4.
- Map of channels: `Channels.dc.html`. Analysis + plan: `docs/booking-channels.md`.

## 6b. Every tap, every screen
The grey "TAPS" sticky under each board lists what every button does, including error and offline cases not drawn as screens (declined card, printer not found, wrong code, bad import file…). They live in `design/<flow>/canvas.json` → `notes.n1…n9`. Treat them as part of this spec.

## 7. Product rules shown in the designs (must stay true in the build)
- English first; each person switches English / Tiếng Việt in their **Profile**. Clients see their own language on reader + receipts.
- Every ticket shows tip and card fee. Staff keep 100% of tips; card fee on tips is $0 to staff (locked in CA/MN).
- Saved / Offline pill always visible top right; cash works offline and syncs later.
- Money math shown as an equation where staff see pay.
- Imported clients get no marketing texts until they opt in; STOP always works.

## 8. Not designed yet / known gaps (decide before building)
- **OPEN — confirm with Elang:** staff login = 4-digit PIN (what's drawn) or the staff's phone number. Touches Staff step 4, S1 staff phone, S2 clock-in, Switch person, Print my earnings, Reset PIN, Profile. Don't build PIN screens until decided.
- Split payment, refunds, selling a gift card, discount sheet, add-service sheet, client profile full page.
- Cash keypad is visual only; quick amounts work.
- Icons on the Devices screen use text glyphs (▭ ⎙ ▢); replace with line icons in the same style.
- Rail/menu markup is copied per screen in the design — build it once as a shared layout.
- Design system's real components (Button, Card, Badge…) were not mounted; the build can use them if they match these specs.
- Desktop screens are fixed 1280×800 frames; the build must also work on the iPad and phone (stack the right panel under the left below ~1024px).

## 9. Build order (step by step)
1. Tokens + base: port `pos.css` `:root`, type classes, motion keyframes + reduced-motion rule.
2. Shared parts: buttons, pill, group/row, card, tile, segmented, chip, toggle, avatar, tag, input, keypad.
3. Layouts: desktop app shell (rail + bar), wizard shell, phone shell.
4. Checkout screens 1 → 4, then phone P1–P5. Wire navigation from section 5.
5. Onboarding 1 → 10, then S1–S2.
6. Check each screen side by side with the live board in Play: spacing, sizes, text, every state and animation in sections 4–6.
7. Turn on "reduce motion" on the device and check everything still reads.
