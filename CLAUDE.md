# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Nail POS — project memory

Read this first every session. Keep it short; link out for detail.

## Code (Next.js 15 App Router + TypeScript, Supabase, Vercel)
- **Building the product:** start at `docs/build/README.md` (stack, rules, milestone status). The user says "Build M<n>" → follow `docs/build/milestones.md` § M<n>, the boards/frames it lists, `docs/build/schema.sql`, `docs/build/screens.md`, `docs/design-spec.md`; tick the Status table when done. Full V1 plan (the "why" + open decisions) is the artifact linked below; `docs/build/` is the "how".
- Commands: `npm run dev` · `npm run build` (lint + types) · `npm run lint` · `npm run typecheck` · `npm test` (Vitest unit: money, offline queue, translations; one file: `npx vitest run src/lib/money.test.ts`) · `npm run e2e` (Playwright on the built app, desktop + phone; one test: `npx playwright test e2e/kit.spec.ts -g "offline" --trace off`; kill any old `next-server` on port 3100 first) · `npm run test:rls` (salon-wall SQL tests; needs `DATABASE_URL`) · `npm run kit:sync` (copy design/kit/kit.css → src/styles/kit.css). CI runs all of these on every PR (`.github/workflows/ci.yml`).
- Branches: `main` = production (Vercel auto-deploys); every other branch/PR gets a Vercel preview link.
- Env: `.env.example` → `.env.local`. Only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` so far; values live in Vercel. Never commit secrets.
- Supabase: test project `nail-pos-test` (id `eoamccaeovuahveytbnr`, us-west-1). Live project not created yet (free-plan limit; add before pilot). Schema changes = new file in `supabase/migrations/` (timestamp name) + apply to the test project; never edit an applied migration. Every salon table has `salon_id` + RLS via `is_member()` / `is_admin()`; new salon via `create_salon()` RPC. Run Supabase security advisors after DDL.
- Styling: `design/kit/kit.css` is the one look, synced to `src/styles/kit.css` (generated; never edit). `src/app/globals.css` only adds a reset, real-screen sizing for the kit's fixed board frames, and a few app-only classes. React pieces in `src/components/kit` (Button, Field, PinKeypad, Drawer, LeftMenu, SyncPill…); preview at `/kit`. Don't name app classes after kit modifiers (`.ok`, `.on`, `.warn`).
- Offline-first: writes go through the outbox (`src/lib/offline/outbox.ts`, IndexedDB/Dexie): `enqueue(kind, payload)` saves on the device, a handler per kind (`registerHandler`) sends it, in order, with a clientId so the server applies it once. `SyncPill`/`OfflineBanner` show state. Screen state still uses `useStored` (localStorage). Money helpers in `src/lib/money.ts` (integer cents). `getSupabase()` returns null if env missing; app must still work.
- Language: next-intl, messages in `src/i18n/en.json` + `vi.json` (a unit test fails if keys differ); `useLang()` from `AppProviders` switches per device. Old screens (setup, join) still have inline strings: move them when touched.
- Supabase people model: `people` (one per phone/login, `auth_user_id`) ← `memberships.person_id` (role, PIN, pay, license). `is_member`/`is_admin` check via people. `devices`, `audit_log` (server-written only).
- Accounts (session 1): `src/lib/auth.ts` (sendCode/verifyCode → `claim_memberships` links memberships waiting for that phone; `myMemberships`, `homeFor`, salon device in localStorage `nailpos.device`, `rpc()`); `PhoneCodeLogin` component. DB functions in `supabase/migrations/20261117000001_session1_accounts.sql` (save_setup, get_invite, set_my_pin, pin_unlock/pin_clock, register_device, clock_self, today_staff). Test salon seed: `supabase/seed/test_salon.sql` (test project only). SQL tests: `supabase/tests/*.sql`.
- Checkout (session 2): `src/lib/checkout/ticket.ts` (ticket shape + money math, tested), `store.ts` (tickets on device → outbox `ticket.save` → `save_ticket`; `pullTickets` merges other desks), `src/lib/desk.ts` (`useDesk`: salon, services, staff facts, cached offline; test copy = sample data; `getActing` = person who PIN'd in on Today, 2-min idle). Discount needs `approve_discount` (manager PIN on salon device, or owner/manager's own login). Tables: clients, tickets, ticket_lines (service/discount/tip), payments (cash), receipts.
- Card payments (session 3): server routes `src/app/api/stripe/*` (connect, status, reader, webhook) + `src/app/api/pay/*` (start, status, simulate [test only], cancel, public [client pay page], refund); `src/lib/server/pay.ts` (`asUser`, `asServer` = Supabase secret key, `settle()` = only place a card payment becomes a paid ticket via `settle_card`). Direct charges on the salon's Express account; salon pays fees. Env (Vercel, Sensitive): `STRIPE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Stripe sandbox: "lotus-test sandbox".
- Routes: `/` start · `/pay/[id]` client pays by link/QR · `/checkout` open + paid today · `/checkout/[id]` ticket → pay → cash → paid + receipt · `/login` · `/today` desk (staff, clock by PIN, switch person, salon device, salon switcher) · `/t` tech phone · `/setup` owner salon setup (sign up → code → 10 steps; `src/app/setup/` — `state.ts` shape, `SetupWizard.tsx` one StepView per step returning `[footer, body]`) · `/join/[code]` staff joins on phone (EN/VI, PIN, clock-in; invite details ride in query `n,r,s,o` until invites are read from Supabase). Shared data/helpers: `src/lib/onboarding/data.ts` (steps, nail template menu, state tip rules, phone/time/money format).
- Login: `NEXT_PUBLIC_SMS_LOGIN=on` = real text codes (Supabase phone auth, Twilio Verify configured in the Supabase dashboard); unset = any 6 digits.
- Menu reading: `/api/menu-import` (signed-in only) fetches a website or takes a photo, Claude (`claude-opus-5-5`, structured output, server-side fallbacks) returns services; needs `ANTHROPIC_API_KEY` in Vercel, else the template.
- Test version stubs (marked with dashed `.demo` notes in UI): SMS code when SMS_LOGIN is off, Stripe Connect, reader pairing, $1 test, CSV import, invite texts. Replace each with the real thing in its build step.
- Design source for onboarding: prototype https://claude.ai/artifact/BYMHXFQTM4Bs9oug6i8ThB · Build plan https://claude.ai/artifact/5XZtVDjQktSiyhes4V69wZ
- Full V1 technical plan (roles + permissions, screens, tables, back end, loyalty + gift card rules, milestones M0–M14, open decisions): https://claude.ai/artifact/CYXvzLj1wTvLvxqKt76HsQ

## Designing flows in Claude Design
- Start from: Experience map (journeys + screen states) → Screens board (low-fi) → Screens 2 (new screens). Don't invent flows that aren't in the PRD/V1 scope.
- One flow per session, in V1 order: checkout → payout sheet → PIN + clock-in → turn list → booking/calendar → client profile → owner dashboard → salon setup.
- Base front desk look = Oliver's built calendar page (fix the 10 gaps on the Screens board).
- Every flow shows: desktop (front desk/owner) + phone (tech/client); VN staff / EN customer text; offline + syncing state; PIN step for staff actions; who (role) sees it.
- Each screen: big buttons, one job, money in plain $ with tip + card fee shown.
- ALWAYS annotate (Oliver, Nov 16): every screen gets an annotated spec frame (numbered orange pins sitting just left of the target, never on text + an Annotations panel with a Hide/Show notes button and a `notes` tweak). Keep clean clickable screens separate for Play (page 1 "Overview"); spec frames on later pages. Show flows as a row of step frames incl. error states. Pattern: `design/*/annot.css` + `Stf*.dc.html`.
- Hub has a **Design** tab (https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU#bdf5b014-97f3) listing every board, prototype, design system and whiteboard. Every new design link goes there too.
- When a flow is done: add a row to the Hub table, a "Back to: Nail POS Hub" link in it, and update the Build Tracker.
- Look (set Nov 16): English first (EN/VI switch in each person's profile), compact Apple-like, client (CRM) panel on checkout, soft fade-in motion, off with reduced motion.
- More boards (Nov 16): Owner Numbers https://claude.ai/artifact/VUcpxhN5Se3WCWmELNrGsY · Client History https://claude.ai/artifact/Qe5suDyUKWiPmF7zgmb53k · Loyalty (V1.1 proposal) https://claude.ai/artifact/7JTHZUnaHsDpjSEk1fzLPY · Tech App https://claude.ai/artifact/LeqWAswV7AE9AcZhmZzcdM · staff self-booking = Booking board page 4. One flow = one Claude Design board.
- Sample data: use the real salon menu (Cosmo Nails, cosmonailswildwood.com/services) for service names + prices.
- Done flows: Checkout https://claude.ai/artifact/ArXa9za1gubGLWzEUH6GLw · Onboarding https://claude.ai/artifact/1A5maZvg44WyCY5gugLVym (click-through prototype https://claude.ai/artifact/BYMHXFQTM4Bs9oug6i8ThB , source `design/onboarding/prototype.html`) · Booking https://claude.ai/artifact/VHeTS9Sd81pm1KbTNj9KUb (merged calendar + booking page + kiosk; channels: docs/booking-channels.md)
- ONE LOOK (Oliver, Nov 16): every board + the app use the Nail POS Design System https://claude.ai/artifact/JynVCKHp6dmhoQThgASD5n ; code source = `design/kit/` (`kit.css` tokens+components, `tokens.json`, `rail.py` menu, `annot.css` frames). Font = Inter (Google). README: `design/kit/README.md`. Golden screen = Checkout · Ticket. Never hand-make a menu, bar, button or chip. After each flow: consistency check across all boards. User flags drift with comments starting "Look:".
- ALWAYS re-check annotations when a screen changes (Oliver, Nov 16): recompute every pin position + note text for each frame that imports the changed screen; pins sit just left of their target, never on text. Spec frames stay still (annot.css v4: no animation/hover inside frames).
- ALWAYS keep Main Screens up to date (Oliver, Nov 16): after ANY change on a flow board (checkout, booking, …), run `design/kit/sync_main.py` and republish Main Screens; bump its "Last synced" date on the sticky note.
- Founder Admin board (Oliver + Elang, both admins: salon health, alerts, 24-h owner-granted support access, add salon by invite, System): https://claude.ai/artifact/UsefYEihqDQ2Vg7iU6cSzN (click-through prototype https://claude.ai/artifact/TPaTwbTtYaYLYkahK8b3fQ ), source `design/admin/`
- Boards: Main screens (Today, Clients, Close day, Profile + copies of Calendar and Checkout) https://claude.ai/artifact/WHUqC6j8z4GLg6r8j3Acs5
- Building UI: follow `docs/design-spec.md` (tokens, components, motion, every screen + interaction) and the exact source in `design/<flow>/` (`.dc.html` + `pos.css`/`setup.css`). Pixel match; re-copy files into `design/` if the boards change.

## What we're building
- PolishOS (app) by EO Collective (company). Domain: polishosapp.com (bought Nov 17, GoDaddy).
- POS for Vietnamese-run nail salons, made by Vietnamese salon people.
- Angle: fair, clear pay for techs + Tap to Pay on iPhone and Android (no card terminal).
- Team (working agreement, not final yet; aligned with Elang Nov 16): Elang = product direction + features ("designs the building: how many floors, what's on each floor") + sales, client care. Oliver = solid foundation, build and design (how it works and looks).

## Source docs (live, in claude.ai)
- Hub (decisions, ideas, research, next steps): https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU
- PRD (V1 scope, data, tech, launch): https://claude.ai/artifact/7aC8Az4WkTYmX9KRntxsCD
- Ideas & Monthly Plan: https://claude.ai/artifact/P8oW1dX4CFQT3tjy8DdaUN
- Running costs (software, hardware, AI, people; estimates to verify): https://claude.ai/artifact/UioTSft9RRanZRPN9j7qom · board https://claude.ai/artifact/F5RmPXxLS8CRMZEZCeY9jr
- System design (accounts + PIN, data per salon, hardware, payments end to end, zero surprises): https://claude.ai/artifact/2Urwx55HAAv1kVv37pC6AB · board https://claude.ai/artifact/FrdZnr7duYtJfyQzpC2yzd
- Experience map (journeys + screen states): https://claude.ai/artifact/Sj5wvmx7KvFTutrJ8k3dDS
- Whiteboards: experience map (journeys only) https://claude.ai/artifact/PZuEnZcu9UvNHJ1MXWN8Gr · screens (ONE board, low-fi, all screens; FULL) https://claude.ai/artifact/LHG1YGcM7KyLU8WJ9ht7ME · screens 2 (NEW low-fi screens go here) https://claude.ai/artifact/9AhqNeeUFvN6UnC5zG2kbh · how it works https://claude.ai/artifact/4doaYFSTWrB5vAeA3Z7SAD · feature map https://claude.ai/artifact/4p51HNLiiGwj6dGZL3XgZx
- Keep docs, whiteboards and this file in sync when scope or stack changes.
- Every new note/whiteboard: add a row to the Hub table + a "Back to: Nail POS Hub" link in it.

Docs win over this file if they disagree. Update this file when a big decision lands.

## V1 scope
1. Checkout in the web app: cash or card by Stripe QR code / pay link; receipt by printer, text or email; gift cards (sell + use, plastic + text, no expiry) + $/% discounts (issue #14, PRD "Gift cards and discounts")
2. Tech payout sheet: earnings + tips per tech, cash vs card, check/cash payout split, printable; payroll insights (min wage, overtime, breaks) + export to Gusto/QuickBooks (issue #15)
3. Vietnamese (staff) / English (customer) toggle
4. PIN login + clock-in; print own earnings by PIN. Clock-in: front desk name + PIN or own phone at salon only (location/Wi-Fi); clock-in joins turn list; auto clock-out; manager-approved fixes; offline (PRD "Clock-in: where and when", issue #3)
5. Client profile by phone number (visits, last service/tech, notes, gift card)
6. Turn list for walk-ins (moved into V1)
7. Booking + day calendar (issue #12): calendar = Oliver's built calendar + drag/peek/waitlist/cover; staff quick-book (4 taps); booking page for every channel (Google, website/social, text links, QR) with salon photos, multi-service cart, combos/add-ons, groups, returning client by phone; walk-in check-in iPad; text confirm/reminders. All → one calendar, source kept per booking. Booking page: book.polishosapp.com/salon-city. docs/booking-channels.md. Each salon gets its own booking page automatically after setup; later deals, deposits, AI booking helper (PRD "Salon booking page", issue #32, screens on Screens 2 bottom)
8. Owner dashboard: top 5 KPIs (sales vs last week, avg ticket, return rate + lost regulars, sales per tech per hour, walk-in wait + walk-outs); full list in PRD "Owner KPIs" (issue #16)
- Salon setup (demo → first payment in ~1 week; 1-hour setup day, 10 steps incl. Connect payments): PRD "Salon setup", board https://claude.ai/artifact/1wByQp7c3nViD27dsqJqgD, issue #20
- Basics: salon setup, staff + pay rates, service menu from a nail template, owner login

## Design rules
- Core principle (Oliver, top priority): fast, consistent, reliable. Works on strong, weak or no internet — every screen loads fast, actions save offline and sync later, nothing lost.
- Users: senior Vietnamese staff, low tech. Phone number first, email second (both collected), no extra apps.
- PIN for staff actions. Big buttons, one job per screen.
- Roles: owner, manager, front desk, tech, customer — each sees only their part. Platform roles (us): Oliver and Elang are both admins (Nov 16).
- Salons own their account + data; we run the platform. Founder Admin = salon health, not private data; support access only when owner allows (24 h, logged). Issue #21.
- Scale: 50 salons x 20 staff; data walled per salon; works offline.
- Insight, not autopilot: turn board/calendar show facts (turns, $ today, free-at, skills, requests); owner/manager/front desk decides who's next; optional one-tap reason.
- Every ticket shows tip + any card fee; nothing taken silently.
- Tips: salon never keeps any part; card fee on tips can't be deducted in CA/MN (setting locked by state); owners/managers never in tip pools; monthly cash-tip report per tech. Booth renters = separate pay type, paid into their own Stripe account. License expiry alerts. PRD "Booth rental, tip rules and tech licenses", board https://claude.ai/artifact/2e91J92mh79y7UcySvwA4y, issue #23.
- Target: Vietnamese walk-in salons, 1–20 techs (appointment salons later).
- Edge cases table lives in the PRD.

## Stack
- Code: GitHub (this repo)
- Data: Supabase
- Web hosting: Vercel
- Build: web app first (owner computer + shared salon iPad/phone), deployed on Vercel
- Devices: desktop (front desk, owner) + phones iOS/Android (techs, clients). Design both. Every feature must work on both iOS and Android (web app now; later phone app from one shared codebase for both).
- Printing: desktop to USB/Wi-Fi receipt printer; Android web can use Bluetooth; iPhone web can't (needs Bluefy) — don't depend on it.
- Texting: Twilio or Telnyx; one local number per salon; A2P 10DLC registration; consent + STOP; email backup. Spec in PRD "Texting and phone numbers". Text budget (suggestion): service texts (confirm, reminders, receipts) included in plan + never stop; marketing texts from a prepaid "text battery" (packs ~2¢/text, balance shown, warn at 20%, auto-refill only if owner opts in with a cap); cost preview before every blast; Vietnamese accents = 70 chars/segment (double cost). Issue #26; board https://claude.ai/artifact/UYUEeU5J5sWsTfAaWHE9EE (bottom).
- Ops (before pilot, issue #22): dev/staging/live; Supabase backups + restore test; DB changes via GitHub; data-wall tests; Sentry + uptime alerts; 2-step login + password manager everywhere; secrets only in Vercel/Supabase; spending alerts; terms/privacy/texting consent. Spec: System Design "Running smooth".
- Payments: card reader in every V1 salon (PRD decision Nov 16; reader fee 2.7%+5¢ beats QR 2.9%+30¢). Web app works only with Wi-Fi smart readers (WisePOS E ended sale Sep 1 2026 → Stripe S710 ~$299); $59 M2 needs our phone app (OPEN: Oliver to pick). QR / pay link = backup. How it works: https://claude.ai/artifact/QghcRANKFnTg1u8hpuiSWg ; Tap to Pay later in our own iPhone + Android app (Stripe Tap to Pay, Apple approval, iPhone XS+; flow on Screens 2; PRD "Tap to Pay (later)"; issue #11)

## Open questions
- Reserve with Google ("Book online" on Maps): V1 or V1.1? Needs Google partner approval — start early (issue #18)
- Staff login: 4-digit PIN (designed now) or staff's phone number? Confirm with Elang (affects staff invite, clock-in, switch person, print earnings, reset PIN)
- Final team roles (current working agreement in "What we're building")
- California nail booth rental: manicurist AB5 exemption appears ended Jan 1 2025 — verify; ask pilot salons if they have renters
- Stripe Connect type: Standard vs Express (lean Express); confirm with Stripe before building
- V1 card reader: Stripe S710 (~$299, works with web app now; WisePOS E discontinued) vs M2 (~$59, needs phone app first)
- Clock-in from own phone: how to prove "at the salon" (salon Wi-Fi, GPS, or salon devices only)? Prototype assumes Wi-Fi/location, opens 15 min before shift. Confirm with Elang.
- Pilot salons (2–3)
- How pilot salons pay techs today
- Final monthly price (testing ~$39–49 in pilot). New input Nov 16: pricing deck proposes $199/mo flat for 25+ staff salons ($149 with $100K+/mo card volume), 5,000 texts, 0.20–0.30% card markup — conflicts with 1–20 tech target + no-markup decision. Options: 2 plans (small ~$49–79 / large $199). Decide with Elang. Board: https://claude.ai/artifact/UYUEeU5J5sWsTfAaWHE9EE, issue #25, PRD "Pricing and launch"

- Gift cards + loyalty how-it-works (roles, codes, steps, money): https://claude.ai/artifact/GKRwnoiAkv5pTHk8rQFUby
- Loyalty in V1? Research (Nov 16): points/punch card, prepaid packages, auto perks (birthday, rebook, VIP), referrals = near-zero cost, high switching cost. Proposal: V1 = points + gift cards (receipt/email only, $0); packages, perks, referrals in V1.1. Decide with Elang. Board: https://claude.ai/artifact/7JTHZUnaHsDpjSEk1fzLPY

## Decision log
- 2026-11-14: PRD drafted; V1 = checkout, payout sheet, language toggle.
- 2026-11-14: Pricing = one flat monthly price per salon, all staff included; no per-tech/new-client/instant-payout fees; card fee upfront; max 2 plans; free 30-day pilot. Test ~$39–49/mo in pilot.

- 2026-11-14: Research applied: turn list into V1, check/cash split, tip fee transparency, success measures. Segments board: https://claude.ai/artifact/VqxQY5rPpXfkja7VsND9Fy

- 2026-11-14: Web app first on Vercel; Tap to Pay iPhone app after the pilot.
- 2026-11-14: Booking joins V1 (calendar, quick-add, booking link).
- 2026-11-14: Desktop + mobile design; printing from desktop; iOS web Bluetooth printing not relied on.
- 2026-11-14: Oliver's built calendar page = base front desk design; 10 gaps listed on the Screens board.
- 2026-11-15: Insight, not autopilot for turns (Gap conflict #3 settled).
- 2026-11-16: Run-smooth setup required before first pilot salon (issue #22; System Design "Running smooth" + board).
- 2026-11-16: Founder Admin + support access (owner-granted, 24 h, logged); we see salon health, not client/tech private data.
- 2026-11-16: Salon setup plan: demo → hardware + texting registration → 1-hour setup day (sign up, info, services, staff+PIN, Connect payments, reader, printer, salon device, clients, $1 test) → Elang on call day 1 → week-4 pilot review.
- 2026-11-16: Each salon has its own Stripe account linked to our platform (Connect); money goes straight to salon; card fees pass-through; we earn only the flat monthly subscription. Stripe events (payments, fees, refunds, disputes, payouts) saved next to tickets by ticket # → insights (who earns how much, staff KPIs, daily money truth). Spec: System Design doc.
- 2026-11-16: Product supports both Android and iOS equally (web app + later one phone app for both, incl. Tap to Pay).
- 2026-11-16: System design: one person = one account (phone); membership links person to salon + role + PIN; salon devices use name + PIN; every row has salon_id + row-level security; money in cents; nothing deleted; Stripe Connect, salon's own account, webhook confirms paid; daily money report = zero surprises.
- 2026-11-16: Owner dashboard (top 5 KPIs, facts only) joins V1.
- 2026-11-16: Payroll = V1 insights + export; real payroll later via embedded partner (e.g. Check, Gusto Embedded); never build tax filing ourselves.
- 2026-11-16: Elang is an admin too (same Founder Admin access as Oliver, incl. System + costs).
- 2026-11-16: Gift cards + discounts join V1 checkout; promo codes, auto discounts, online gift card shop later. Commission on discounted vs full price = owner setting.
- 2026-11-17: Names: company = EO Collective, app = PolishOS (Elang + Oliver). Domain bought: polishosapp.com (GoDaddy) = main site, app + booking pages (book.polishosapp.com/salon-city). polishos.com taken (ask owner later); polishos.app still free (optional grab). Optional: eo-collective.com for company email. DNS connected to Vercel (nail-pos project, www → apex) Nov 17. To do: 2-step login on GoDaddy, USPTO trademark check on "PolishOS".

## Tracking
- Build Tracker (status per feature, build order): https://claude.ai/artifact/6DjfxMPXy64uDX8YZdCCnt — keep in sync with GitHub Issues
- Features: GitHub Issues, labels v1 / v1.1 / feature / ux / research / setup
- Market research: https://claude.ai/artifact/UUbqTu5wKNkBxShMVfTqYU (unverified, needs web access) · board https://claude.ai/artifact/Rzu7quesSz9RxryAFvAJrh
- Affinity map (draft, 5 clusters): docs/affinity-map.md
- Tools reference list (options, not selected yet): docs/tools-reference.md
- Hardware shopping list (Amazon links, readers from Stripe): docs/hardware-shopping-list.md
- Later: tech profile page, like LinkedIn for nail techs (tech-owned, portfolio, verified reviews + license, Book Now; private phone hidden): PRD "Future vision", issue #27, low-fi screen on Screens 2 (bottom)
- Client data ideas (bring clients back, show care; after V1): Hub "Ideas" + board https://claude.ai/artifact/FGuDonq7GNmEeAgTWfbjKh
- Close an issue when its checklist is done; note big calls in the decision log

## How we work
- One feature per session. Plan in docs, build here.
- User is not a coder: plain words, short answers.
