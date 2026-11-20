# Operations: PolishOS

## 1. Daily / weekly cycle
- Daily (customer sees ✱): check `/admin` alerts (devices off, Stripe, late plan) ✱; answer Zalo/phone ✱; uptime + backup emails (GitHub Actions).
- Weekly: 1 check-in call per salon (logged in Admin → Salons) ✱; review Sentry errors; ship fixes on one fixed day (not Fri/Sat).
- Per new salon: fee check → invite → setup day (1h) → first Saturday on site ✱ → day 7 / 30 / 60 review ✱.

## 2. Suppliers
| Need | Supplier | Price (public, check) | Lead time |
|---|---|---|---|
| Card reader S710 | Stripe (live readers only from Stripe) | ~$299 | ~1 week |
| Receipt printer + drawer | Amazon list `docs/hardware-shopping-list.md` | $330–520 | 2 days |
| Texts / login codes | Twilio | see Running Costs | 10DLC 1–3 weeks per salon |
| Hosting, DB | Vercel Pro, Supabase Pro | $20, $25/mo | now |
| Email | Resend | $0–20 | now |
No price changes vs `numbers.json`.

## 3. People (who does what)
| Role | Who | Hours |
|---|---|---|
| Build, fix, live switch-on | Oliver | as now |
| Sales, fee checks, setup days, first Saturdays, Zalo support | Elang | ~3 setups/month max (this caps growth) |
| Ops: check-ins, ordering readers, paperwork | Laura | few h/week |
| Backup support on Saturdays | Oliver (phone) | Sat 9–6 first 3 months |
Unpaid founders now. When paid, payroll taxes on top: ask the accountant.

## 4. Routines (SOPs)
**A. Fee check (30 min)** 1) Get 3 months of card statements 2) Total fees + monthly POS + lease + exit fee 3) Fill the fee sheet: yearly now vs PolishOS (Stripe 2.7%+5¢ on their card volume + $49×12) 4) Show honestly — if we're not cheaper, say so 5) Offer the trial.
**B. Setup day (1h)** follow `docs/go-live-plan.md` §10: invite → 10 steps → Make PINs → reader + printer → $1 test → old POS stays on.
**C. First Saturday** arrive before open; stand at desk; note every stuck moment in a list for Oliver; Wi-Fi pull test only with owner OK.
**D. Complaint** answer same day, Vietnamese; log in Admin; fix date; call back.
**E. Close of trial (day 60)** show their own numbers (Numbers page + payout sheet); ask: stay / need changes / leave (export their data either way).
**F. Weekly:** order readers if fewer than 2 loaners left.

## 5. Tools (our own)
Stripe (payments + billing), Supabase, Vercel, GitHub Actions (uptime, backup), Sentry, Twilio, Resend, Google Workspace, Zalo, a simple bookkeeping tool (Wave free / QuickBooks ~$35) — pick with accountant.

## 6. Licences, permits, insurance (check each — not legal advice)
- LLC/registration + EIN for EO Collective (needed to switch Twilio to business) — https://www.irs.gov/ein
- California seller's permit not usually needed for SaaS; confirm with CDTFA https://www.cdtfa.ca.gov
- Business licence in your city.
- Insurance: general liability + cyber (you hold card + client data).
- Stripe Connect platform terms; Terms/Privacy lawyer review (go-live plan §7); texting consent (TCPA) + 10DLC.
- If reselling readers: sales tax on hardware — ask the accountant.

## 7. Risk register
| Risk | Likely | Bad | Plan |
|---|---|---|---|
| Bad first Saturday (reader/printer/Wi-Fi) | Med | High | old POS stays on; Elang on site; fix list before next salon |
| Elang sick / no time | Med | High | cap at 3/month; Laura trained on fee check |
| Texting approval slow | High | Med | invites by link/QR; email backup |
| Data loss | Low | Very high | nightly backup + restore test (go-live §2) |
| Stripe account issue for a salon | Low | High | pay link backup; full address + ZIP at setup |
| Rival copies payout sheet | Med | Med | speed + references + tech pull |
| Owner can't leave processor contract | High | Med | note end date; call 60 days before |
| Bug in tip math | Low | Very high | tested money code; every change logged; same-day fix |
| Oliver burnout (solo build) | Med | High | freeze features for pilots (board: one thing) |
| A salon wants Reserve with Google | Med | Low | V1.1 list; don't promise |
