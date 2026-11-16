# Nail POS — project memory

Read this first every session. Keep it short; link out for detail.

## What we're building
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
4. PIN login + clock-in; print own earnings by PIN
5. Client profile by phone number (visits, last service/tech, notes, gift card)
6. Turn list for walk-ins (moved into V1)
7. Booking + day calendar: staff quick-add (4 taps), online booking link, text confirm/reminders (issue #12)
8. Owner dashboard: top 5 KPIs (sales vs last week, avg ticket, return rate + lost regulars, sales per tech per hour, walk-in wait + walk-outs); full list in PRD "Owner KPIs" (issue #16)
- Salon setup (demo → first payment in ~1 week; 1-hour setup day, 10 steps incl. Connect payments): PRD "Salon setup", board https://claude.ai/artifact/1wByQp7c3nViD27dsqJqgD, issue #20
- Basics: salon setup, staff + pay rates, service menu from a nail template, owner login

## Design rules
- Core principle (Oliver, top priority): fast, consistent, reliable. Works on strong, weak or no internet — every screen loads fast, actions save offline and sync later, nothing lost.
- Users: senior Vietnamese staff, low tech. Phone number first, email second (both collected), no extra apps.
- PIN for staff actions. Big buttons, one job per screen.
- Roles: owner, manager, front desk, tech, customer — each sees only their part. Platform roles (us): admin (Oliver), support (Elang).
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
- Texting: Twilio or Telnyx; one local number per salon; A2P 10DLC registration; consent + STOP; email backup. Spec in PRD "Texting and phone numbers".
- Ops (before pilot, issue #22): dev/staging/live; Supabase backups + restore test; DB changes via GitHub; data-wall tests; Sentry + uptime alerts; 2-step login + password manager everywhere; secrets only in Vercel/Supabase; spending alerts; terms/privacy/texting consent. Spec: System Design "Running smooth".
- Payments: card reader in every V1 salon (PRD decision Nov 16; reader fee 2.7%+5¢ beats QR 2.9%+30¢). Web app works only with Wi-Fi smart readers (WisePOS E ended sale Sep 1 2026 → Stripe S710 ~$299); $59 M2 needs our phone app (OPEN: Oliver to pick). QR / pay link = backup. How it works: https://claude.ai/artifact/QghcRANKFnTg1u8hpuiSWg ; Tap to Pay later in our own iPhone + Android app (Stripe Tap to Pay, Apple approval, iPhone XS+; flow on Screens 2; PRD "Tap to Pay (later)"; issue #11)

## Open questions
- Final team roles (current working agreement in "What we're building")
- California nail booth rental: manicurist AB5 exemption appears ended Jan 1 2025 — verify; ask pilot salons if they have renters
- Stripe Connect type: Standard vs Express (lean Express); confirm with Stripe before building
- V1 card reader: Stripe S710 (~$299, works with web app now; WisePOS E discontinued) vs M2 (~$59, needs phone app first)
- Pilot salons (2–3)
- How pilot salons pay techs today
- Final monthly price (testing ~$39–49 in pilot)

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
- 2026-11-16: Gift cards + discounts join V1 checkout; promo codes, auto discounts, online gift card shop later. Commission on discounted vs full price = owner setting.

## Tracking
- Build Tracker (status per feature, build order): https://claude.ai/artifact/6DjfxMPXy64uDX8YZdCCnt — keep in sync with GitHub Issues
- Features: GitHub Issues, labels v1 / v1.1 / feature / ux / research / setup
- Market research: https://claude.ai/artifact/UUbqTu5wKNkBxShMVfTqYU (unverified, needs web access) · board https://claude.ai/artifact/Rzu7quesSz9RxryAFvAJrh
- Affinity map (draft, 5 clusters): docs/affinity-map.md
- Tools reference list (options, not selected yet): docs/tools-reference.md
- Hardware shopping list (Amazon links, readers from Stripe): docs/hardware-shopping-list.md
- Client data ideas (bring clients back, show care; after V1): Hub "Ideas" + board https://claude.ai/artifact/FGuDonq7GNmEeAgTWfbjKh
- Close an issue when its checklist is done; note big calls in the decision log

## How we work
- One feature per session. Plan in docs, build here.
- User is not a coder: plain words, short answers.
