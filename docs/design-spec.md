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
| 3 | Services (`Services`) | "Your service menu" + category segmented control; grouped rows: toggle, name, min · category, price input (96px). 7 template services, Acrylic full set off by default. "+ Add a service", "N services on". | Toggle switch → row dims to 45% and count updates. |
| 4 | Staff (`Staff`) | Team list (Mai owner, Hạnh front desk $16.50/hr PIN set, Kim 60% PIN set, Ngọc 60% Text sent, Tuyết booth renter $250/wk Text sent). Right card 400: Add staff — name, phone, role segmented, pay type 3 buttons (Commission / Hourly / Booth renter), explainer box, **Add + text PIN invite**. | Pay type selects (2px ink border) and explainer text swaps (fade). |
| 5 | Payments (`Payments`) | "Get paid straight to your bank", fee rows (2.7%+5¢, 2.9%+30¢, 2 business days, our cut $0). Right card: Stripe tile, **Connect payments**. | Connect → "Waiting for Stripe…" pulsing ring → after 2.2s "Payments connected" ✓ pop + Business / Bank ••6789 / Payouts daily. |
| 6–8 | Devices (`Hardware`) | 3 cards: Card reader (code "apple · river · seven"), Receipt printer (Epson TM-m30III found), Salon device (nailpos.app/desk · 4FQ-82K). Reader starts done. "Skip for now" in footer. | Tap a card's button → card gets 2px jade ring, ✓ pops, done text fades in, side steps advance. |
| 9 | Clients (`Clients`) | 3 option cards: Upload a file / We help type them in / Start fresh. Import result card: 412 found, 380 with a phone, 12 duplicates merged; orange note "no marketing texts until they say yes". | Pick option → 2px ink border; Upload shows import card, others show the "start fresh" card (fade). |
| 10 | $1 test (`Test`) | "One last check: a $1 test" + explainer + **Charge $1.00**. | Runs 4 checks, one every 0.9s (charged → receipt printed → Stripe confirmed → refunded), each ✓ pops. Then "Mai Nails is ready." ✓ pop 84px, summary group, Run test again, **Open front desk**. Progress bar → 100%. |
| S1 | Staff sets PIN (`StaffInvite`) | Text bubble (r18 18 18 4, #E9E9EB) with invite link; bottom sheet r24: avatar, "Hi Kim — make your PIN", 4 dots, round keypad. | Each digit fills a dot; ⌫ removes; 4th digit → 0.5s → "PIN saved" ✓ pop → Continue → StaffClockIn. |
| S2 | First clock-in (`StaffClockIn`) | Date + time 44px; 220px round button. | Tap → button turns white with jade ring "Clocked in ✓"; details fade in (clocked-in time, "#3 in line", first appointment). Tap again = clock out. |

## 7. Product rules shown in the designs (must stay true in the build)
- English first; each person switches English / Tiếng Việt in their **Profile**. Clients see their own language on reader + receipts.
- Every ticket shows tip and card fee. Staff keep 100% of tips; card fee on tips is $0 to staff (locked in CA/MN).
- Saved / Offline pill always visible top right; cash works offline and syncs later.
- Money math shown as an equation where staff see pay.
- Imported clients get no marketing texts until they opt in; STOP always works.

## 8. Not designed yet / known gaps (decide before building)
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
