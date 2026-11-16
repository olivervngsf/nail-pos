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
- Stripe Connect = **Express**. Card reader = **S710** (works with the web app).
- Loyalty in V1 = **gift cards + points only**; packages, perks, referrals = V1.1.

## Repo layout (target)

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
| M0 | Foundation (repo, kit, shell, auth, RLS, offline, CI) | Not started |
| M1 | Salon setup (owner sign-up, info, services, staff + invites) | Not started |
| M2 | PIN + clock-in, switch person | Not started |
| M3 | Checkout: tickets, tip, cash, receipts | Not started |
| M4 | Payments: Stripe Connect, S710 reader, pay link, webhooks | Not started |
| M5 | Gift cards + discounts | Not started |
| M6 | Clients (CRM) + client history | Not started |
| M7 | Booking: calendar (day/week/month), quick book, repeat, texts | Not started |
| M8 | Booking page + kiosk + staff phone booking | Not started |
| M9 | Turn list / waitlist (walk-ins) | Not started |
| M10 | Close day + payout sheet + payroll export | Not started |
| M11 | Today + Owner Numbers (KPIs) | Not started |
| M12 | Loyalty points + client page | Not started |
| M13 | Tech app (Home, schedule, earnings) | Not started |
| M14 | Pilot-ready: ops, Founder Admin, support access | Not started |

Files: `milestones.md` (what to build, step by step), `schema.sql` (database draft), `screens.md` (every board + frame → route).
