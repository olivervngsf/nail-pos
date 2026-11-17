# Nail POS — Build pack (read this first when building)

Back to: [Nail POS Hub](https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU)

This folder turns the designs into a product, step by step. Each milestone is small enough for one Claude Code session.

## How to use it (what to type)

- **"Build M3"** → Claude Code reads `milestones.md` § M3, the boards and frames it lists, `docs/design-spec.md`, `design/kit/`, then builds it, writes the tests, and checks the screens against the design.
- **"Continue M3"** → picks up the unchecked items in that milestone.
- **"What's next?"** → reads the Status table below and proposes the next milestone.
- After each milestone: tick it in the Status table, update the Build Tracker, open a PR.

## Stack (decided; change only by updating this file)

| Part | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript, one web app | Runs on desktop, iPad, iPhone, Android browsers; deploys to Vercel |
| Look | `design/kit/kit.css` copied as the global stylesheet; same class names (`btn`, `chip`, `row`, `group`, `stat`, `rail`…) | Pixel match with the boards; no second design system |
| Data | Supabase: Postgres + row-level security + Auth (phone code) + Storage (photos) | Data walled per salon; one place |
| Offline | PWA + IndexedDB queue (Dexie). Every write is saved on the device first, then synced | Works on weak or no internet |
| Payments | Stripe Connect (Express, each salon its own account) + Stripe Terminal (S710 smart reader) + pay link / QR as backup | Money goes straight to the salon |
| Texts | Twilio or Telnyx (one local number per salon, A2P 10DLC) + email (Resend) | Confirmations, reminders, receipts |
| Language | next-intl, EN first, VI per person | English first, switch in Profile |
| Errors / uptime | Sentry + an uptime check | Ops before pilot (issue #22) |
| Tests | Vitest (logic, money), Playwright (screens, offline), SQL tests for RLS | Nothing ships without them |

Defaults chosen for open questions so building is not blocked (change here if Elang decides otherwise):
- Staff login = **4-digit PIN** on salon devices (phone number for their own phone).
- Stripe Connect = salon's own account, Accounts v2, full dashboard, Managed Risk (Stripe's rules ruled out Express, Nov 17). Card reader = **S710** (works with the web app).
- Loyalty in V1 = **gift cards + points only**; packages, perks, referrals = V1.1.

## Repo layout (target)

Actual (Nov 16): the app lives under `src/` (`src/app`, `src/lib`); keep that.

```
app/                 Next.js routes (desk), app/(phone)/ for tech + client pages
components/          one React component per kit piece (LeftMenu, TopBar, Button, Chip, Rows, StatTile, Drawer, Toast, PinKeypad…)
lib/                 money (cents), time, offline queue, stripe, texts, i18n
supabase/migrations  SQL migrations (start from docs/build/schema.sql)
supabase/tests       RLS + money tests
tests/               Playwright flows named after the board frames (tk1-start.spec.ts, d2-create.spec.ts…)
design/              the boards' source (already here) — the truth for layout
docs/                specs (this folder)
```

## Rules for every milestone (definition of done)

1. Screens match the board frames listed (same kit classes, same spacing); the frame's numbered notes are the behaviour spec.
2. Money in cents; every ticket shows tip + card fee; nothing taken silently.
3. Works offline: save on device, sync later, show the Online / Offline · saved pill.
4. Staff actions ask for a PIN; each role sees only its part.
5. Every row has `salon_id`; RLS test proves another salon can't read it.
6. Nothing is deleted: void / refund / adjust rows instead.
7. EN + VI strings for every label.
8. Tests: unit for money/logic, Playwright for the main path + one error state, RLS test for new tables.
9. Main Screens board stays in sync with what was built (CLAUDE.md rule).

## Status

| # | Milestone | Status |
|---|---|---|
| M0 | Foundation (repo, kit, shell, auth, RLS, offline, CI) | Done (Nov 16): kit.css is the one stylesheet (`npm run kit:sync`), React kit components + `/kit`, `people`/`devices`/`audit_log` + salon-wall test passing, offline queue (IndexedDB) + sync pill, EN/VI (next-intl), Sentry wired (off until DSN), CI (lint, types, unit, build, Playwright desktop+phone, RLS). Left for later: staging + live Supabase projects, Sentry DSN, DATABASE_URL secret for CI RLS run |
| M1 | Salon setup (owner sign-up, info, services, staff + invites) | Mostly (session 1, Nov 17): sign-in by text code, setup saves to Supabase via the offline queue (`save_setup`), invites read from the DB (`get_invite`). To do: invite texts (needs Twilio number), AI menu import, resume setup on a second device |
| M2 | PIN + clock-in, switch person | Done (session 1): join → confirm phone → PIN hashed on server (weak refused) → home `/t`; salon device (`register_device`), switch person + clock by PIN on `/today` (5 wrong = 5 min lock, 2 min idle lock), clock from own phone. To do: "at the salon" check (Wi-Fi/location) |
| M3 | Checkout: tickets, tip, cash, receipts | Mostly (session 2, Nov 18): `/checkout` + `/checkout/[id]` (services + staff picker with turns/$ today, "$45+" final price, $/% discount with manager PIN, client panel by phone, cash with quick bills + change + cash tips per staff, paid summary, print receipt 80 mm). Saved on the device, sent via outbox (`save_ticket`, same ids = safe repeat, server works totals out, paid = frozen). SQL: `supabase/migrations/20261118000001_checkout.sql`, test `supabase/tests/session2_checkout.sql`. To do: text/email receipts actually sent (session 5, logged as queued now), ticket from a booking (M7), cash drawer kick |
| M4 | Payments: Stripe Connect, S710 reader, pay link, webhooks | Built, waiting for keys (session 3, Nov 17): Connect, salon's own Stripe account via Accounts v2 + full dashboard (setup step 4 + Payments card on Today), reader pairing (setup step 5; test reader `simulated-s710`), checkout Card reader (tip on reader, test tap/tip/decline buttons) + QR / pay link (`/pay/[id]`, client picks tip → Stripe Checkout), server confirms with Stripe (`settle()` in `src/lib/server/pay.ts`, polled + webhook `/api/stripe/webhook`), card fee shown, refunds with owner/manager OK. Needs Vercel env `STRIPE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, later `STRIPE_WEBHOOK_SECRET`. Extras (Nov 17): real $1 test in setup step 9 (`/api/stripe/test-dollar`, auto refund, fee shown, skippable), real salon address for the Terminal location (`src/lib/stripe/address.ts`), refunds made in the Stripe dashboard recorded (`stripe_refund_seen`, full or part), fee filled in later (`stripe_set_fee`), daily card totals for owners (`card_day_totals`, for Close day), SQL test `supabase/tests/session3_card.sql`. Webhook events to subscribe: payment_intent.succeeded, payment_intent.payment_failed, checkout.session.completed, charge.refunded, charge.updated, account.updated. To do: split payment |
| M5 | Gift cards + discounts | Built (session 4, Nov 17): sell at checkout (new digital code made by the server, new plastic from stock, add money), card is $0 until the sale is paid, pay with a card by code or client phone (part or all, rest in cash/card), undo, refunds put money back, checks in order + 5-wrong-codes lockout, codes stored as hash + last 4. Owner `/gift-cards` (link on Today): money owed, all cards, history, lock + replace lost card, make + print/CSV plastic cards, settings. SQL `supabase/migrations/20261120000001_gift_cards.sql`, test `supabase/tests/session4_gift.sql`, e2e in `e2e/checkout.spec.ts`. $/% discounts were done in M3. To do: send digital codes by text (needs texting), discount limit setting, client page shows cards (M12) |
| M6 | Clients (CRM) + client history | Built (session 5, Nov 17): `/clients` list (search phone or name; filters regulars, lost regulars, new this month, birthdays, gift card balance; lost = regular not seen 45+ days and 1.5× their usual gap) + profile panel (stats, allergy/care in red first, likes, notes, gift cards, photos, visits); `/clients/[id]` full history (visits newest first, open one: nail photos, tech notes, how it was paid incl. tip + card fee); add/edit client; any staff phone adds notes + photos (Storage bucket `client-photos`, private, per salon folder); techs reach it from `/t`; checkout client panel links to the profile. SQL `supabase/migrations/20261121000001_clients.sql`, test `supabase/tests/session5_clients.sql`, e2e `e2e/clients.spec.ts`. To do: Text / Book again buttons (need texting + calendar), loyalty points on profile (M12), next visit (M7) |
| M7 | Booking: calendar (day/week/month), quick book, repeat, texts | Built (session 6, Nov 17): `/calendar` day (staff columns, 15-min grid, drag to book / move / resize with undo, overlaps side by side + alert, never auto-moved, counts filter, Up next facts, mini month), week + month views, phone = one staff at a time; quick-book card (phone first, top services + search, free staff first, repeat every N weeks × times, source); details panel (confirm, check in → ticket at checkout, no-show, cancel, client profile); saved on the device + outbox `appt.save` (works offline, newest edit wins). Reminder texts queued (1 day + 2 h, only clients who said yes) — sent once texting is set up. SQL `supabase/migrations/20261122000001_bookings.sql`, test `supabase/tests/session6_bookings.sql`, e2e `e2e/calendar.spec.ts`. To do: actual texts + reply C/R/STOP (texting session), staff working hours + time off, waitlist (M9), cover late staff |
| M8 | Booking page + kiosk + staff phone booking | Not started |
| M9 | Turn list / waitlist (walk-ins) | Not started |
| M10 | Close day + payout sheet + payroll export | Not started |
| M11 | Today + Owner Numbers (KPIs) | Not started |
| M12 | Loyalty points + client page | Not started |
| M13 | Tech app (Home, schedule, earnings) | Not started |
| M14 | Pilot-ready: ops, Founder Admin, support access | Not started |

Plan behind this pack (roles + permissions, back end, loyalty + gift card rules, open decisions): [Full V1 Plan](https://claude.ai/artifact/CYXvzLj1wTvLvxqKt76HsQ).

Files: `milestones.md` (what to build, step by step), `schema.sql` (database draft), `screens.md` (every board + frame → route).
