# Milestones — build in this order

Each milestone: **Goal · Design to match · Data · Build steps · Done when**. Boards are Claude Design artifacts; frame codes (e.g. Tk3) are the annotated frames on those boards; the source is also in `design/<board>/`.

Boards: Checkout https://claude.ai/artifact/ArXa9za1gubGLWzEUH6GLw · Onboarding https://claude.ai/artifact/1A5maZvg44WyCY5gugLVym · Booking https://claude.ai/artifact/VHeTS9Sd81pm1KbTNj9KUb · Main Screens https://claude.ai/artifact/WHUqC6j8z4GLg6r8j3Acs5 · Owner Numbers https://claude.ai/artifact/VUcpxhN5Se3WCWmELNrGsY · Client History https://claude.ai/artifact/Qe5suDyUKWiPmF7zgmb53k · Loyalty + Gift Cards https://claude.ai/artifact/7JTHZUnaHsDpjSEk1fzLPY · Tech App https://claude.ai/artifact/LeqWAswV7AE9AcZhmZzcdM · Design System https://claude.ai/artifact/JynVCKHp6dmhoQThgASD5n

---

## M0 · Foundation
**Goal:** an empty app that already looks like Nail POS, logs in, is walled per salon and works offline.
**Design:** Design System (all components), Main Screens (LeftMenu, TopBar), `design/kit/`.
**Data:** `salons`, `people`, `memberships`, `devices`, `audit_log` (schema.sql §1).
**Build steps:**
1. Next.js + TypeScript app; `design/kit/kit.css` as global CSS; Inter font.
2. React components for every kit piece (names = Design System components): LeftMenu, TopBar, PhoneBar, PhoneTabs, Button, Segmented, Chip, Field, Switch, Stepper, PinKeypad, ListGroup/Rows, Card, StatTile, ProgressBar, DataTable, MiniBars, DayTimeline, StatusPill, Avatar, Drawer, Sheet, Toast, Banner. A `/kit` page showing them all.
3. Supabase project ×3 (dev, staging, live); migrations from `schema.sql` §1; RLS helper `is_member(salon_id)`.
4. Auth: owner signs in with phone code (Supabase OTP); salon devices remember the salon and use PINs (M2).
5. Offline: IndexedDB queue; every write goes to the queue first; sync worker; Online / Offline · saved / Syncing pill in TopBar; Banner when offline.
6. i18n EN/VI; language from the person's profile.
7. Sentry, Vercel deploys per branch, GitHub Actions: typecheck, lint, Vitest, Playwright, RLS tests.
**Done when:** `/kit` matches the Design System previews; a test proves salon A can't read salon B; going offline and back syncs a test write; CI green.

## M1 · Salon setup (owner)
**Goal:** owner goes from sign-up to a ready salon (10 steps, ~1 hour).
**Design:** Onboarding board: wizard steps; Services Svc1–Svc6 (choose, AI photo/link import, review, template); Staff Stf1–Stf6; Payments Pay1–Pay4 (wired in M4); Hardware; Test.
**Data:** `services`, `service_categories`, `staff_profiles` (pay type, rate, commission, skills), `invites`.
**Build steps:** wizard shell (`setup.css`); salon info + state (sets tip rules); services from template + manual + AI import (photo or website URL → draft list to review); staff add → one-time invite link by text (7 days); progress saved per step.
**Done when:** a new owner finishes setup on a phone and an iPad; services list matches the review screen; invite text sends; every step resumes after reload/offline.

## M2 · PIN + clock-in
**Goal:** staff join from the invite, set a PIN, clock in; anyone can switch person on a shared device.
**Design:** Onboarding StaffInvite Sj01–Sj12 (confirm, not me, language, PIN, weak PIN, mismatch, photo, done, clock-in); Checkout Profile Pr1–Pr4 (photo).
**Data:** `memberships.pin_hash`, `clock_events`, `people.photo_url`, `people.language`.
**Build steps:** invite link → confirm salon → language → PIN (rules: no 1234/1111, confirm) → photo (anyone uploads own) → done; done screen shows next shift + how to clock in (no clock-in push: staff often join from home); clock in/out by PIN only at the salon (salon device, or own phone on salon Wi-Fi/location), opens 15 min before shift; "Switch person" keypad on every desk screen; 5 wrong PINs = 1 min wait.
**Done when:** Sj flow passes in Playwright incl. weak + mismatch; clock events show on Close day later; PIN never stored in plain text.

## M3 · Checkout (no card yet)
**Goal:** front desk builds a ticket and takes cash; receipt by print, text or email.
**Design:** Checkout board Tk1–Tk7 (start, service, staff, added, discount, gift (M5), ready), Cs1–Cs2 (cash change, short), An5 receipt, Main Screens Checkout copy.
**Data:** `tickets`, `ticket_lines`, `payments` (cash), `receipts`.
**Build steps:** ticket from walk-in or a booking; add services (top + search), pick staff (facts only: free/busy/turns); client panel (phone first); tip lines; cash keypad with change; receipt (USB/Wi-Fi printer on desktop, text, email); offline: ticket + cash payment saved on device.
**Done when:** money math unit-tested (cents, tip, change); a ticket paid offline syncs once; receipt shows tip + any fee lines.

## M4 · Payments (Stripe)
**Goal:** salon connects Stripe; card on the S710 reader; pay link / QR as backup; webhooks confirm paid.
**Design:** Onboarding Pay1–Pay4; Checkout Pay, Reader Rd1–Rd4 (tip on reader, tap, ok, declined), An1–An4 (QR, client pays on phone), Done.
**Data:** `stripe_accounts`, `payments` (card), `stripe_events` (every event saved by ticket #), `payouts`.
**Build steps:** Connect Express onboarding link + return; Terminal server-driven S710 (register reader, collect, tip on reader); pay link/QR; webhook endpoint (idempotent) → `on_ticket_paid()` (schema §4); fees saved per payment and shown.
**Done when:** test-mode card, decline and refund pass; webhook replay is safe; daily money totals equal Stripe's.

## M5 · Gift cards + discounts
**Goal:** sell, take, add money, check, lock/replace gift cards; $/% discounts.
**Design:** Loyalty + Gift Cards board G1–G19 (setup, stock, sell digital/plastic, paid, receiver phone, use, split, refused, lost, all codes, make + print 3 ways, client add card, reload, back to stock); Checkout Tk5–Tk6; doc https://claude.ai/artifact/GKRwnoiAkv5pTHk8rQFUby.
**Data:** `gift_cards`, `gift_card_ledger`, `discounts` (schema §3).
**Build steps:** code generator (16 chars, no 0/O/1/I, check char; plastic numeric 16 digits + check digit), hashed storage + last4; statuses + checks in order (real → this salon → active → not locked → balance); activation only inside `on_ticket_paid()`; reload; back to stock; printing (file, stickers, receipt printer); lockout after 5 wrong codes.
**Done when:** a card is worth $0 until its sale is paid; split payment works; refund reverses ledger rows; tests for every refusal reason.

## M6 · Clients + client history
**Design:** Main Screens Clients C1–C2 (list, lost regulars), Client History board H1–H2, checkout client panel.
**Data:** `clients`, `client_notes`, `client_photos`, `visits` (view over tickets).
**Build steps:** search by phone/name; filters (regular, lost, new, birthday, gift); profile (stats, notes first with allergies, gift card + points, next visit); visit timeline with photos, tech note, payment; Book again.
**Done when:** a client found by phone shows the same history on desk and tech phone; photos upload from any staff phone.

## M7 · Booking calendar (desk)
**Design:** Booking board D1–D13 (day, quick-book card + long lists, drag create/move/resize, peek, waitlist drop, cover late staff, filter, alerts, booked + undo, phone call card, details panel, repeat), W1–W2 week, M1–M2 month, G1–G7 phone gestures, `docs/booking-channels.md`, `docs/design-spec.md` "Calendar gestures + motion".
**Data:** `appointments` (source, status, staff, services, repeat_rule_id), `repeat_rules`, `staff_schedules`, `time_off`, `reminders`.
**Build steps:** day/week/month views; quick-book card (phone first, top services, free staff, repeat, reminders); drag + resize with 15-min snap, undo; overlaps side by side + Alert (never auto-move); details side panel; repeat dialog; confirmation + reminder texts (1 day + 2 h), reply C/R, STOP.
**Done when:** every D/W/M frame has a Playwright test; offline drag saves and syncs; texts only to consented clients.

## M8 · Booking page, kiosk, staff phone booking
**Design:** Booking board BookWeb W1–W8 (door, services, add-ons, group, staff, time, details, done), Kiosk K1–K4, PageSettings P1–P3 (photos, channels, Google), staff phone S1–S7, client link C1–C8.
**Data:** `booking_page_settings`, `salon_photos`, `appointments.source` (google / website / instagram / qr / text / kiosk / staff_phone).
**Build steps:** public booking page per salon (no account, phone for returning clients); kiosk check-in → waitlist; staff phone booking (own free times only); owner page settings with photos.
**Done when:** a booking from each channel lands on the calendar with its source; double-booking impossible from the page.

## M9 · Turn list / walk-ins
**Design:** Booking Cal waitlist + Up next (D1, D6), Main Screens Today waiting counts.
**Data:** `waitlist`, `turns` (per staff per day).
**Build steps:** waitlist from kiosk/desk; turn counts per staff; "next turn" shown as a fact; owner/desk decides; optional reason.
**Done when:** turns and waits match the day's tickets; walk-outs recorded.

## M10 · Close day + payout sheet + payroll export
**Design:** Main Screens Close day Z1–Z5 (open tickets, count cash, card total, tips per staff, closed); PRD payout sheet (issue #15).
**Data:** `day_closes`, `cash_counts`, `payout_lines`, `tip_reports`.
**Build steps:** count drawer by bills; match card total to Stripe; tips per staff (salon keeps none; state fee rules locked); payout sheet per tech (earnings + tips, cash vs check split), printable; export to Gusto/QuickBooks (CSV first).
**Done when:** a day with cash, card, gift card and refund closes to $0 difference in tests; tech can print own earnings by PIN.

## M11 · Today + Owner Numbers
**Design:** Main Screens Today H1–H2; Owner Numbers board K1–K2.
**Data:** views over tickets/appointments/ledgers (no new truth tables).
**Build steps:** top 5 KPIs with compare period; chart + one fact line; more numbers; per-staff table (owner/manager only); needs-attention list.
**Done when:** every number traces back to rows (unit tests with fixed data); techs can't open it.

## M12 · Loyalty points + client page
**Design:** Loyalty board L1–L10 (V1 = points part: L1, L2, L6, L7, L8, L10), G13–G16 client page.
**Data:** `loyalty_settings`, `loyalty_ledger`, views `client_points` (schema §3).
**Build steps:** points written only in `on_ticket_paid()`; reward ready tag; use reward (asks first); refunds reverse; client page (one-time text code) with points + gift cards + add a card.
**Done when:** points on receipt = ledger sum; refund test; client page works without an app.

## M13 · Tech app (phone)
**Design:** Tech App board T1–T4; Booking G1–G7 gestures; S1–S7 staff booking.
**Build steps:** PhoneTabs (Home, Schedule, Book, Earnings, Me); today's money (own only); in-chair timer; my day/week; booking details; staff booking (if owner allows).
**Done when:** a tech sees only their own clients and money; works on iPhone + Android browsers.

## M14 · Pilot-ready
**Design:** System Design doc "Running smooth" + "Founder Admin" (issues #21, #22).
**Build steps:** backups + restore test; data-wall test suite in CI; uptime + Sentry alerts; spending alerts; 2-step login for owners; Founder Admin (salon health only); support access granted by owner (24 h, logged); terms, privacy, text consent.
**Done when:** restore test done; a support session is logged and expires; checklist in System Design all ticked.

## Later (V1.1+)
Packages, perks, referrals (Loyalty L3–L5, L9) · sell gift cards online · Reserve with Google (#18) · Tap to Pay phone app (#11) · Apple/Google Wallet passes.
