# Nail POS — project memory

Read this first every session. Keep it short; link out for detail.

## What we're building
- POS for Vietnamese-run nail salons, made by Vietnamese salon people.
- Angle: fair, clear pay for techs + Tap to Pay on iPhone (no card terminal).
- Team: Viet = product/design/build. Elang = sales, client care.

## Source docs (live, in claude.ai)
- Hub (decisions, ideas, research, next steps): https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU
- PRD (V1 scope, data, tech, launch): https://claude.ai/artifact/7aC8Az4WkTYmX9KRntxsCD
- Ideas & Monthly Plan: https://claude.ai/artifact/P8oW1dX4CFQT3tjy8DdaUN
- Experience map (journeys + screen states): https://claude.ai/artifact/Sj5wvmx7KvFTutrJ8k3dDS
- Whiteboards: experience map https://claude.ai/artifact/PZuEnZcu9UvNHJ1MXWN8Gr · how it works https://claude.ai/artifact/4doaYFSTWrB5vAeA3Z7SAD
- Keep docs, whiteboards and this file in sync when scope or stack changes.

Docs win over this file if they disagree. Update this file when a big decision lands.

## V1 scope
1. Tap to Pay checkout on iPhone, receipt via Bluetooth printer or text
2. Tech payout sheet: earnings + tips per tech, cash vs card, check/cash payout split, printable
3. Vietnamese (staff) / English (customer) toggle
4. PIN login + clock-in; print own earnings by PIN
5. Client profile by phone number (visits, last service/tech, notes, gift card)
6. Turn list for walk-ins (moved into V1)
- Basics: salon setup, staff + pay rates, service menu, owner login

## Design rules
- Users: senior Vietnamese staff, low tech. Phone number first, email second (both collected), no extra apps.
- PIN for staff actions. Big buttons, one job per screen.
- Roles: owner, manager, front desk, tech, customer — each sees only their part.
- Scale: 50 salons x 20 staff; data walled per salon; works offline.
- Every ticket shows tip + any card fee; nothing taken silently.
- Target: Vietnamese walk-in salons, 1–20 techs (appointment salons later).
- Edge cases table lives in the PRD.

## Stack
- Code: GitHub (this repo)
- Data: Supabase
- Web hosting: Vercel
- Payments: Stripe (Tap to Pay needs a native iPhone app; web app first for setup + payouts)

## Open questions
- Pilot salons (2–3)
- How pilot salons pay techs today
- Final monthly price (testing ~$39–49 in pilot)

## Decision log
- 2026-11-14: PRD drafted; V1 = checkout, payout sheet, language toggle.
- 2026-11-14: Pricing = one flat monthly price per salon, all staff included; no per-tech/new-client/instant-payout fees; card fee upfront; max 2 plans; free 30-day pilot. Test ~$39–49/mo in pilot.

- 2026-11-14: Research applied: turn list into V1, check/cash split, tip fee transparency, success measures. Segments board: https://claude.ai/artifact/VqxQY5rPpXfkja7VsND9Fy

## Tracking
- Features: GitHub Issues, labels v1 / v1.1 / feature / ux / research / setup
- Market research: https://claude.ai/artifact/UUbqTu5wKNkBxShMVfTqYU (unverified, needs web access)
- Close an issue when its checklist is done; note big calls in the decision log

## How we work
- One feature per session. Plan in docs, build here.
- User is not a coder: plain words, short answers.
