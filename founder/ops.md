# Operations: PolishOS (Nov 20 2026)

## 1. Daily / weekly cycle (✱ = a salon sees it)
**Every day**
1. 8:30 Oliver: check `/admin` alerts (devices off, Stripe, late plan), GitHub emails (uptime every 10 min, nightly backup).
2. 9:00–19:00 Elang: answer Zalo/phone in Vietnamese ✱ (same day, always).
3. Evening: Oliver fixes anything from the day's list.

**Every week**
4. Mon: 1 check-in call per salon, logged in Admin → Salons ✱.
5. Tue: ship fixes (never Fri/Sat, salons' busiest days).
6. Wed: fee checks for new owners ✱.
7. Thu: setup day for the next salon ✱.
8. Sat: Elang on site at the newest salon ✱; Oliver on phone.

**Per new salon:** fee check → invite → setup day (1h) → first Saturday on site ✱ → day 7 / 30 / 60 review ✱ → paid.

## 2. Suppliers (every cost in `numbers.json` + equipment)
| Need | Option 1 | Option 2 | Price (public) | Lead time / terms |
|---|---|---|---|---|
| Card reader S710 | Stripe Dashboard → Terminal → order | — (live readers only from Stripe) | ~$299 ([listing](https://hardware.mytime.com/products/stripe-reader-s710-us)); dock $49, hub $39, case $19 | ~1 week; card on file |
| Receipt printer + drawer | Amazon list `docs/hardware-shopping-list.md` | Star/Epson dealers | $330–520 | 2 days |
| Texts + login codes | Twilio (account set up) | Telnyx (cheaper, untested) | ~$10/salon/mo; Verify ~6¢ | 10DLC 1–3 weeks |
| Database | Supabase Pro | — | $25 org + ~$10 2nd project ([pricing](https://supabase.com/pricing)) | monthly card |
| Hosting | Vercel Pro | — | $20/seat ([pricing](https://vercel.com/pricing)) | monthly card |
| Email | Resend | Postmark | $0–20 | now |
| Work email | Google Workspace Business Starter (signed up Nov 23) | ImprovMX forwarding (free, receive only) | $8.40/user/mo monthly | free until Dec 7 |
| Insurance | Hiscox | NEXT / Insureon broker | GL ~$33/mo, tech E&O+cyber ~$126/mo ([Insureon](https://insureon.com/technology-business-insurance/saas-companies/cost)) | **quote needed** |
| Accountant | local CPA (small-business) | Pilot / Bench-type online | ~$150/mo est. | **quote needed** |
| Lawyer (terms, texting, CA pay) | startup lawyer flat fee | — | $500–2,000 est. | **quote needed** |

**Changed `numbers.json`:** Supabase $25 → $35; insurance $75 → $160; **added CA LLC tax $67/mo ($800/yr)**. CFO re-run → break-even 23 salons, year 1 -$4,593.

## 3. People + weekly rota
| Role | Who | Paid? |
|---|---|---|
| Build, fixes, admin checks | Oliver | unpaid founder |
| Sales, fee checks, setup days, first Saturdays, Vietnamese support | Elang | unpaid now (Running Costs doc idea: base + first 2 months of each salon's fee) |
| Ops: check-in calls, reader orders, paperwork, backup fee checks | Laura | unpaid |

| | Slow first month (1–2 salons) | Planned (~3 new/month, up to 25 live) |
|---|---|---|
| Elang | ~10 h/wk: 10 owner calls, 2 fee checks, 1 Sat on site | ~25 h/wk: 3 fee checks, 1 setup, 1 Sat, Zalo daily (~20 min/salon/week) |
| Oliver | build + Sat on phone | + 2 h/wk support, Tue release |
| Laura | 2 h/wk | ~6 h/wk check-ins (25 salons × 15 min) |
- **Bottleneck = Elang's Saturdays** (one salon per Saturday). To go faster: train Laura to run setup days (the "faster setups" lever in the CFO).
- If you pay a helper later: CA minimum wage + payroll tax + workers' comp → ask the accountant.

## 4. Routines (SOPs, one page each)
**A. Fee check (30 min)** 1) Ask for 3 months of card statements. 2) Add up: card fees, POS monthly, lease, exit fee + contract end date. 3) Fill the fee sheet: yearly cost now vs PolishOS (Stripe 2.7% + 5¢ on their card volume + $49 × 12). 4) Show it honestly — if we are not cheaper, say so. 5) Offer the 60-day trial.
**B. Setup day (1h)** follow `docs/go-live-plan.md` §10: invite → 10 steps → staff PINs → reader + printer → $1 test + refund → old POS stays on.
**C. First Saturday** arrive before open; stand at desk; write every stuck moment; Wi-Fi pull test only with owner OK; close day together; techs check pay by PIN.
**D. Complaint** answer same day in Vietnamese → log in Admin → give a fix date → call back when fixed.
**E. Trial end (day 60)** show their numbers (Numbers + payout sheet) → stay / changes / leave (export data either way).
**F. Weekly reorder** Fri: if fewer than 2 loaner readers free → order 1 (1-week lead time).
**G. Money wrong (tip/pay)** stop, call Oliver, fix same day, write to owner what happened. Never "wait and see".

## 5. Tools (our own stack)
Stripe (salon payments + our billing), Supabase, Vercel, GitHub Actions (uptime + backup), Sentry (free), Twilio, Resend, Google Workspace, Zalo, bookkeeping: Wave (free) or QuickBooks Simple Start (~$35/mo) — pick with the accountant.

## 6. Licences, permits, insurance (check each — not legal advice; rules change by place)
- [ ] CA LLC: Articles $70 + Statement of Information $20 ([CA SOS bizfile](https://bizfileonline.sos.ca.gov)); **$800/yr LLC tax, due by the 15th day of the 4th month, no first-year exemption for 2026** ([FTB](https://www.ftb.ca.gov/file/business/types/limited-liability-company))
- [ ] EIN (free): [irs.gov/ein](https://www.irs.gov/ein) — needed for Twilio business + bank
- [ ] Business bank account
- [ ] City business licence (where EO Collective is based)
- [ ] Sales tax: SaaS generally not taxed in CA; reselling readers may be — [CDTFA](https://www.cdtfa.ca.gov) + accountant
- [ ] Insurance: general liability + cyber (min), tech E&O when revenue starts
- [ ] Stripe Connect platform agreement; Terms/Privacy/texting reviewed by lawyer (go-live §7)
- [ ] Texting: business 10DLC brand + campaign; TCPA consent records (Build Tracker 4c)
- [ ] Trademark search "PolishOS" (USPTO, classes 9 + 42)

## 7. Risk register
| # | Risk | Likely | Bad | Plan |
|---|---|---|---|---|
| 1 | Bad first Saturday (reader/printer/Wi-Fi) | Med | High | old POS stays on; Elang on site; fix list before next salon |
| 2 | Elang sick / out of time | Med | High | cap 3 setups/month; train Laura on fee check + setup |
| 3 | Wrong tip / pay number | Low | Very high | SOP G; tested money code; every change logged |
| 4 | Data loss | Low | Very high | nightly backup + restore test (go-live §2) |
| 5 | Texting approval slow | High | Med | invites by link/QR; email backup |
| 6 | Stripe blocks a salon (missing ZIP, KYC) | Med | High | full address + ZIP at setup; pay link backup |
| 7 | Owner locked in processor contract | High | Med | note end date; call 60 days before |
| 8 | Slow month: no new salons | Med | Med | 20% fewer = -$5,220 year 1; keep cash ≥ $10k |
| 9 | Rival copies the payout sheet | Med | Med | speed + reference salons + tech pull |
| 10 | Oliver burnout (solo build + support) | Med | High | feature freeze for pilots; Tue-only releases |
