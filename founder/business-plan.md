# PolishOS (by EO Collective) · Business plan

**Verdict: Not yet**

- ✓ Each salon-month earns $28.24 before fixed costs (63% contribution).
- ✗ Year 1 operating LOSS: $2,649.
- ✓ Break-even is 18 salon-months a day against a capacity of 60.
- ✓ 8 of 20 simulated buyers buy (40%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $45.00 a salon-month |
| Profit margin at plan | 41% per salon-month |
| Break-even | 18 salon-months a day |
| Year 1 operating profit | $-2,649 |
| Startup spend | $5,300 |
| Cash needed before it pays for itself | $8,282 |
| Startup money earned back | not in year 1 |
| Buyer panel | 8 buy · 12 pass |

## The idea

- What it is: a point-of-sale + salon app for Vietnamese-run nail salons: checkout (cash, Stripe card reader, pay link), fair tech payout sheet with tips and card fees on every ticket, turn list for walk-ins, booking calendar, client profiles, gift cards, loyalty, owner numbers, English/Vietnamese.
- Who it is for: owners of Vietnamese-run walk-in nail salons in the US, 1–20 techs (start in California, where ~80% of salons are Vietnamese-run), and the senior, low-tech staff who use it every day.
- What it sells, at what price: one flat plan, $49/month per salon (or $468/year = $39/month), all staff and devices included, free 30-day pilot. Card fees passed through at Stripe cost, no markup (2.7% + 5¢ on a reader). Salon buys a Stripe S710 reader (~$299) once. Promo texts from prepaid credit (2¢/text). No contract, no setup fee, no per-tech fee.
- Where and how: web app at polishosapp.com (runs on the salon's own iPad/computer/phones, works offline). Found through personal networks, Vietnamese Facebook groups, Zalo, nail supply stores, owner referrals. Elang sells and does setup day (1 hour); Oliver builds.
- Budget and constraints: two-person team (Oliver = build + design, Elang = sales + client care), Laura helps ops. Founders unpaid. Tools ~$215–375/mo in pilot (incl. Claude). Product is mostly built (V1 code done, test setup live); live database, live Stripe and texting registration still to switch on. 0 paying salons today; 2–3 pilot salons not yet signed.

## Summary

**PolishOS** is a checkout + tech-pay app for Vietnamese-run nail salons (1–20 techs, California first). Its one thing: **techs can see their own pay, and owners see every fee**.

**Verdict: Not yet.** The unit works (each salon leaves $28.24/mo, 63%), break-even is 18 paying salons, and 40% of simulated buyers say yes to the new offer. But **year 1 loses $2,649** on operations because salons arrive slowly (~3 setups a month). Fix: cut the Claude plan to $20 after the build and charge $49 to all → about break-even (-$97). The real fix is faster, cheaper setups.

**Board + panel agree:** proof beats price. 3 of 3 board members said "fund if" you get real pilot salons; 9 of 19 panel no's were "I don't trust a new company", only 1 was price. The Founding Salon offer (60-day run-alongside, loaner reader, we switch you, free fee check, guarantee) moved buyers from **5% → 40%**.
**They disagree on:** Product lens likes the craft; Monopoly lens fears no moat and thin money (no card margin).

**Biggest risk:** no salon has run a real Saturday on it. Plan: old POS stays on, Elang at the desk, fix list before salon #4.

**To start:** ~$8,300 cash over year 1 (founders unpaid). First test costs $0: 10 free fee checks in 3 weeks; success = 3 owners start a trial.

**This week:** Elang writes 30 owner names and books the first 5 fee checks. Oliver turns on 2-step login + spending alerts (go-live §1).

*Simulated buyers and projected numbers — real owners and real quotes confirm them. Not financial, legal or tax advice.*

## What the board said

**Vote: 3 FUND IF · 0 FUND · 0 PASS. Average score 5.0 / 10** (Offers 5, Monopoly 4, Product 6). Memos in `board/`.

### Risks more than one member raised (first)
1. **No proof yet.** 0 paying salons, 0 signed pilots, 1–2 real interviews. (all 3)
2. **"Cheaper" is not a moat.** ABC, Zota, Mango, Tilavon, TLNA already pitch Vietnamese + low price; a rival can copy price or a payout sheet in 6 months. (Offers, Monopoly)
3. **Switching is hard for the owner** (retrain senior staff, move data, exit fees) and nothing in the offer carries that risk yet. (Offers, Product)

Single-member risks:
- Monopoly: no card margin = $39–49/salon only, while rivals live on card income 10–20x bigger.
- Product: too many features for 2 people; seams on day one (live DB/Stripe off, texting paperwork, ZIP blocks reader, printers).

### Conditions checklist (the rest of the pack tests these)
- [ ] 2–3 pilot salons signed and live, with what they pay today and why they'd switch (launch)
- [ ] Watch each pilot in person on a busy day; fix every setup-day seam before salon #4 (ops)
- [ ] Pick the one thing: **trusted checkout + tech pay**; switch other features off for pilots (offer, ops)
- [ ] Offer sold on the outcome ("techs trust their pay, you keep more money"), with a name (offer)
- [ ] A real guarantee + "we switch you over" (data move, training, help with exit fees) (offer, cfo)
- [ ] Real urgency only: limited pilot spots per month Elang can actually set up (offer)
- [ ] Test a higher price / second plan before locking $49 (pricing)
- [ ] 10 paying salons in one city/network in 90 days, cost to win each written down (marketing, launch)
- [ ] Evidence techs push for it (tech pull = network effect) (launch)
- [ ] Plan for year-3 hold: tech network, pay/tip records, or a fair card margin (cfo, plan)

### Where they disagree
- Product (6) likes the craft and the clear "one thing"; Monopoly (4) sees a crowded field with no moat and thin money.
- Offers says test a higher price (could it be $99?); Monopoly says the money is in card fees, not the subscription.

### The strongest version the board can see
Not "a cheaper POS with everything". It is **"the POS where techs trust their pay"**: checkout + payout sheet first, everything else hidden at the start. Sold through the Vietnamese owner network one city at a time (California first), with free switching and a guarantee so the owner risks nothing. Techs who see fair pay carry it to the next salon. That is narrower than the pitch today, and that is the point.

## The competition

Built from the team's own research (`docs/competitors.md`, `docs/abc-salon-system.md`, `reports/Nail POS market pricing and design.md`, Nov 16 2026). Only ABC was checked on its own site; the rest come from review/blog sites (some written by rivals): **check before quoting**. Not re-checked online in this run.

### 1. The field (most direct first)
| Name | Type | Price (comparable) | Notes |
|---|---|---|---|
| ABC Salon System | direct | $40/mo "limited-time" + $1,900–2,500 hardware (or $160–210/mo ×12); packages $288–475/mo | Vietnamese, Texas; ships weekly; Reserve with Google; app 3.0★ (22) |
| Zota | direct | quote only | strong in busy Vietnamese salons; tied to card processor |
| Mango POS | direct | $49–299/mo + $149–249 setup, 3-mo minimum | turn list, payroll |
| Fastboy (Go POS) | direct | from $50/mo (≤5 staff), payroll extra | sold by processor resellers |
| Tilavon | direct | ~$39/mo | bilingual, needs terminal |
| TLNA POS | direct | from $59/mo | browser, Vietnamese training |
| NailSoft | direct | ~$100/mo | old desktop |
| Square Appointments | indirect | $0/$49/$149 + 2.6%+15¢ | no turn list, no Vietnamese, weak tip split |
| Fresha / Vagaro / Booksy | indirect | ~$115–210/mo for 10 staff + new-client cuts | built for appointment salons, per-staff price |
| Paper + bank terminal | substitute | processing only | notebook payroll, paper turns |

Sources: links in `competitors.csv`.

### 2. Price range (monthly software, nail POS)
- Lowest ~$39 (Tilavon) · median ~$50 · highest ~$100 software; real year-1 bill with hardware/agency $2,400–5,700 (ABC).
- PolishOS: $49 + ~$299 reader once ≈ **$887 year 1**.

### 3. Positioning map (text)
- Axis X = hidden cost (low → high: leases, card markup, contracts). Axis Y = built for nail/Vietnamese (low → high).
- High nail fit, high hidden cost: ABC (hardware + agency), Zota, Fastboy (processor-led), Mango (setup + minimum).
- High nail fit, low hidden cost: Tilavon, TLNA — **and PolishOS**. Crowded corner on price alone.
- Low nail fit, low cost: Square. Low nail fit, high cost: Fresha/Booksy (new-client cuts), Boulevard.

### 4. What their customers complain about (thin: few public reviews)
1. **Lost / wrong tips and pay** (ABC Go, Oct 2026): "services and tips mysteriously disappeared", two-tech tip went to one ticket, "we should not have to constantly double-check a system that is supposed to accurately track our work and earnings." — [App Store](https://apps.apple.com/us/app/abc-salon-system-go/id6449681664). *Thin (1–2 reviews).*
2. **Hidden fees / lock-in**: Clover devices locked to processor, 3-year contracts, $200–1,000+ exit fees — [Katalyst](https://www.katalystos.com/blog/what-it-costs-to-leave-your-pos). *Thin for nail salons specifically.*
3. **Can't see the salon remotely** (ABC owner) — App Store. *Thin.*
4. **Splitting one ticket/tip between two techs is hard** (Square) — [Square Community](https://community.squareup.com/t5/Staff-Payroll/How-to-split-credit-card-transactions-between-employees/td-p/835610).
5. **No gift card report** (ABC owner, 2025). *Thin.*

### 5. The gap
**Tech pay everyone can check**: tip + card fee on every ticket, correct two-tech split, check/cash payout split, techs see their own pay by PIN. No rival found shows the check/cash split, and the top rival's own reviews complain about exactly this. Plus no hardware lock-in (~$890 vs ~$2,400 year 1).
Honest caveat: "Vietnamese + cheap" is NOT a gap (Tilavon, TLNA already there). The gap is trust in money, not price.

### 6. The threat
- **ABC** could copy fastest: ships weekly, already Vietnamese, already $40. Adding a payout sheet + fixing tips = a few months.
- **Zota/Fastboy** could give software away free and earn on processing.
- Defense: proof from pilots (real "zero tip fights"), tech pull, data/payout history, speed in one city.

## The buyer panel

**8 buy · 12 pass** (40% buy) out of 20 simulated buyers. Seed 500646, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Small salon owner (1-4 techs, often works the table too) | 7 | 71%  (thin) |
| Mid salon owner (5-10 techs) | 9 | 33% |
| Big salon owner (11-20 techs, maybe 2 locations) | 4 | 0%  (thin) |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Tired of tech pay fights | 2 | 100%  (thin) |
| Fee-sensitive deal hunter | 2 | 100%  (thin) |
| Square user | 3 | 67%  (thin) |
| Happy enough with current POS | 5 | 40%  (thin) |
| Paper and calculator | 3 | 0%  (thin) |
| Locked in a processor contract | 3 | 0%  (thin) |
| Trusts word of mouth only | 2 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| under $61,000 | 5 | 60%  (thin) |
| $61,000 to $104,000 | 8 | 50% |
| $104,000 and up | 7 | 14%  (thin) |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| trust | 6 | "I run on paper and a calculator and it works. A new company I never heard of could close and I'd be stuck with my clients and my techs' pay data in somebody's system. The free trial and the reader loan are nice, but I'm not going to hand over my client list and set up on a stranger's word." (P004) · "I run 11-20 techs and maybe two locations on a POS that mostly works. A brand-new company asking to sit at my desk on a Saturday is a lot of risk for me. If they close, my client list and tech pay records go with them." (P007) |
| habit | 4 | "My POS mostly works and I have 11-20 techs, many of them older. A new system means retraining everyone and risking a bad Saturday, and I never touch settings on Saturdays. The free trial next to my old system is nice, but I still would not start it." (P002) · "I'm in the middle of a 3-year processor deal and my techs, who are mostly older, barely tolerate the system we have. I'd take the free fee check, but I'm not signing up for a trial that puts two systems on my desk on a Saturday." (P011) |
| need | 1 | "My paper tickets and the bank's terminal work fine for 3 techs. It does not do Reserve with Google or marketing like my agency package, so it feels like a checkout app only, and I would have to teach everyone something new." (P015) |
| price | 1 | "My POS is $40 and the paper and notebook work fine. Why pay $49 for something new, even with a 60-day trial? The bank terminal is already paid for and my techs know it." (P020) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |
| trust | 7 | "Sixty days next to my Square setup with no contract and a loaned reader means I risk almost nothing, and having someone who knows salons stand at my desk on a Saturday is more than any card rep has offered. I'd try it, not switch right away." (P001) · "The trial runs next to my old POS, so nothing is at risk, and the free fee check plus the 90-day guarantee is the only thing that answers my card-fee question. I would sign up for the trial and bring my statements, but I would not switch until I see my own numbers." (P003) |
| price | 1 | "I'd take the free fee check and the 60-day trial because I keep my old system and terminal, so I lose nothing, and if my fees aren't lower after 90 days the plan is free. $39 is fine if it really beats what I pay now." (P010) |

### What would flip a no

- Visiting a big salon like mine with 15+ techs that has run it for months, seeing the older techs use it without trouble, and a written promise that my current system stays on the Saturday counter until I say so.
- Visiting or calling a salon owner I know who has used it for months, plus the data export in writing before I give them anything. Even then, not before I can start on a slow weekday and not on a Saturday.
- Another salon my size, running it for a year or more, who I can call myself, plus a written promise that my data comes back if they shut down.
- Seeing it take payments with the Wi-Fi unplugged at a salon like mine that has run it for months, and a phone call with that owner who tells me straight how it went.
- Seeing it running at a salon like mine, with older techs, that I can call or visit. A written answer that the trial won't trigger my processor's exit fee would also help.
- A salon owner I know, in my Facebook group, tells me they run it and their card fees went down. And the fee check on my own 3 months of statements shows me clearly better, with the exit fee counted.
- My sister-in-law, or an owner I know from the Zalo group, tells me she runs it and her card fees went down. Then I would do the free fee check with my statements.
- Reserve with Google and marketing included, plus a salon owner like me who has already switched and tells me what happened to their exit fee.
- A salon owner from my Facebook group who I trust tells me it saved her time, and it shows Google booking or texting my clients.
- Two or three Vietnamese salon owners I know, with similar size, telling me in my Zalo or Facebook group that they run it and the tip and payout numbers were right.
- A free fee check on my own 3 months of statements showing a clearly lower yearly cost in writing, plus a call with another big salon (10+ techs, not a 3-chair shop) that has run it for months without checkout going down.
- Another Vietnamese owner I know and trust from the Facebook group tells me it saved them real money. Or the price is at or under $40 with no card fee surprises.

Buyers say they would buy **1.0 times** in the first month on average.

20 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

### 1. The price: keep **$49/month per salon**
- Panel range (simulated): **$20 – $81**. $49 = the IPP (as many call it a bargain as expensive). Median: bargain $30, expensive $70, too expensive $120. `pricing-curve.md`.
- Competitors: nail POS software $39–100, median ~$50 (`competitors.md`). ABC $40 "limited-time" but year 1 ≈ $2,400 with hardware.
- Margin (CFO tool): $49 → $33.74 contribution/salon (69%), break-even 15 paying salons. $39 → break-even 21. $59 → 12. $79 → 8.
- Only 1 of 19 "no" votes was about price. **Price is not the problem; trust is.** Don't cut it.

### 2. The ladder
| Plan | Price | Who | Why step up |
|---|---|---|---|
| Salon | $49/mo (or $468/yr = $39/mo) | 1–10 techs | everything, all staff |
| Salon Plus (test) | $99–149/mo | 11–20 techs / 2 locations | 2-location view, priority Vietnamese phone line, included promo texts |
- Big-salon buyers gave the highest "too expensive" answers ($160–300). Room for Plus; test it with real owners first.

### 3. Opening offer (real end date)
- **Founding Salon**: first 10 salons lock **$39/mo for 12 months** (then $49). Real limit: Elang can set up ~3 salons a month in person. Ends when 10 are signed or **Mar 31 2027**, whichever is first.
- No "was $X" prices. $49 is the real price.

### 4. What to test with real buyers
- $49 vs $59 for Salon (two price sheets, Elang alternates owners). Watch which one gets signed pilots.
- Ask big owners: "$99 or $149 for Plus?"

### 5. Top 3 price objections (verbatim, simulated)
- "$49 a month plus a $299 reader is real money before I see any benefit." (P020)
- "Is your card rate really cheaper than what I pay now?" (P017, P012, P013, P019)
- "My current POS is only $40, why pay $49." (P020)
→ Real answer = the yearly bill, not the monthly: fee check on their own statement.

## The offer

Method: the Offers lens (value equation + stack), summarised in our own words.

### 1. Problem list (buyer's words; from panel v1 + competitor complaints)
Before buying
1. "Who are you? A new company could close and take my data." (9 of 19 no's = trust)
2. "I want to see an owner I know using it first."
3. "My POS mostly works; switching is all risk."
4. "Older staff won't learn a new system."
5. "Is your card rate really cheaper than what I pay now?"
6. "I'm locked in a processor contract with an exit fee."
7. "$299 reader before I see any benefit."
8. "My current POS is $40, why $49?"
9. "No Reserve with Google / marketing like my agency."
During
10. "What if the internet drops on a busy Saturday?"
11. "Who picks up when it breaks, in Vietnamese?"
12. "Moving my client list, gift cards, menu is a lot of work."
13. "Techs fighting about turns and tips during the switch."
14. "I don't have time to set up software."
After
15. "Will tips and services go missing like my old app?"
16. "Will the price go up after the promo?"
17. "Can I leave with my data?"
18. "Will the company still be around next year?"

### 2. Solutions, scored (value 1–5 / cost 1–5)
| # | Solution | Value | Cost | Keep? |
|---|---|---|---|---|
| 1,2,18 | Founding salon reference list: call or visit a live salon (after salon #1) | 5 | 1 | ✅ |
| 3,4,13 | 60-day run-alongside: keep old POS + terminal until techs are ready | 5 | 1 | ✅ |
| 7 | Loaner S710 reader during trial (pool of 3 readers ≈ $900 once) | 4 | 2 | ✅ |
| 12,14 | We move clients/menu/staff + in-person setup (already planned) | 5 | 2 | ✅ |
| 10,11 | Elang at the desk on first busy Saturday + Zalo group | 5 | 3 (time) | ✅ (caps volume ≈ 3/month) |
| 5,6,8 | Free fee check on 3 months of statements, exit fee included | 5 | 1 | ✅ |
| 5,8 | Guarantee: after 90 days, if plan + card fees aren't lower than before, plan free until they are | 4 | 1–2 | ✅ |
| 17 | Data export any time, in writing | 4 | 1 | ✅ (built) |
| 16 | Founding price locked $39 for 12 months | 3 | 2 | ✅ |
| 6 | Pay their exit fee | 4 | 5 ($200–1,000+) | ❌ (wait for contract end instead; note end date) |
| 9 | Reserve with Google | 3 | 5 (partner approval) | ❌ for now (V1.1) |
| 9 | Marketing posts/SEO | 2 | 5 | ❌ (don't compete with agencies) |

### 3. The stack
- **Core (outcome, not features):** "Your techs trust their pay. No more tip fights. You see every dollar, every fee."
- **Bonus 1 – Run it next to your old POS for 60 days** (kills: switching risk, older staff).
- **Bonus 2 – We switch you over**: clients, menu, staff, PINs moved; loaner card reader (kills: setup work, $299 upfront).
- **Bonus 3 – Free fee check** on your own statements (kills: "is it really cheaper").
- **Guarantee:** after 90 days, if plan + card fees are not lower than your old bill, the plan is free until they are. Plus: data export any time, no contract.
- **Real scarcity:** 10 Founding Salons; Elang sets up ~3 a month in person. Ends at 10 or Mar 31 2027.
- **Name:** **Founding Salon** ("Tiệm Sáng Lập" — have a native speaker check).

### 4. Guarantee cost (CFO check)
- Worst realistic case: 3 of 10 founding salons claim, 3 free months each at $39 = **$351**. Cheap.
- Bigger hidden cost: Elang's Saturdays + travel; and the loaner readers ($900 once, reused).

### 5. Value equation (1–10), before → after
| | v1 pitch | Founding Salon | moved by |
|---|---:|---:|---|
| Dream outcome | 6 | 7 | outcome headline (trusted pay) |
| Perceived likelihood | 3 | 6 | reference salon, fee check, guarantee |
| Time to result | 5 | 6 | in-person setup + Saturday on-site |
| Effort / sacrifice | 3 | 7 | run-alongside, we switch you, loaner reader |

### 6. Re-test (same 20 simulated buyers, same seed)
(filled after the run)
- **Before (v1 pitch): 1 buy · 19 pass (5%).** After (Founding Salon): **8 buy · 12 pass (40%)**. Same 20 cards, seed 500646. v1 kept in `panel-v1/`, new run in `panel/`.
- Moved most: small salons 0% → 71%, mid 11% → 33%, Square users 0% → 67%, "happy enough" 0% → 40%, deal hunters 0% → 100%.
- Did NOT move: big salons (0 of 4), locked processor contracts (0 of 3), paper-and-calculator (0 of 3), word-of-mouth-only (0 of 2). They need a named salon they know, not a better offer.
- Objection that grew: **"what if the internet drops?"** The new pitch forgot to say it works offline (v1 had it). Put it back: "Keeps taking tickets with no internet; syncs when it's back."
- Still a no: Reserve with Google / marketing (3 buyers). Not built; don't promise it.
- Honest limit: simulated buyers lean agreeable; treat 40% as a ceiling. Real target for Elang: 3 of 10 owners shown the offer start a trial.

## The numbers

- **The margin:** each paying salon leaves **$28.24/month** after its own costs (63%). At 50 salons: 41% profit margin.
- **Break-even: 18 paying salons.** Plan reaches 18 in month 10 and 24 by month 12.
- **Year 1: -$2,649** on operations, -$7,949 after the $5,300 startup spend. **Cash needed before it pays for itself: ~$8,300.** Founders are unpaid in these numbers.
- **The line to watch: the ramp** (how fast salons pay). Elang can set up ~3 a month; that, not price, sets year 1.
- **Three ways to improve it (tool-run what-ifs):**
  1. Drop Claude from $150 to $20/mo once the pilot build is done (+ one salon a month sooner): year 1 → **-$609**.
  2. Plus charge $49 to everyone (no $39 founding price): year 1 → **-$97** (about break-even).
  3. Price $59 instead of $49 (base ramp): break-even 12 salons, year 1 -$1,095.
  - More salons alone (volume ×1.5): -$1,082.
- **Board money conditions:** "test a higher price" → not done (needs real owners); "plan for year 3" → open. Card margin (0.2% on card sales, no fee on tips) is the parked lever in the research report; revisit at ~50 salons.
- Not financial, tax or legal advice: an accountant should check the LLC, payroll and tax before money moves.

## Unit economics: PolishOS (1 unit = 1 paying salon for 1 month; 'per day' fields = paying salons, days_per_month = 1). Price $45 = blended year 1: first 10 Founding Salons at $39, rest at $49.

Every number below comes from the input file. Nothing is looked up or guessed.

### One salon-month

| line | per salon-month |
| --- | ---: |
| Price | $45.00 |
| Service texts (local number, ~600 texts, 10DLC share) | -$10.00 |
| Stripe Connect active account | -$2.00 |
| Login codes (Twilio Verify, ~20/mo) | -$1.20 |
| Stripe card fee on the $49 plan (2.9% + 30c) | -$1.72 |
| Stripe Billing (0.7%) | -$0.34 |
| Support time (est. 1h/mo at $0 founder; contractor later) | -$0.00 |
| Guarantee reserve (3 of 10 claim 3 free months, spread) | -$1.50 |
| **Contribution** (what each salon-month leaves to pay the fixed costs) | **$28.24** (63%) |

### The margin that matters

Fixed costs: $482 a month (Supabase Pro (live)  $25, Vercel Pro $20, Google Workspace + domains $22, Resend email $20, Claude (build) $150, Apple + Google dev (spread) $8, Accountant $150, Business insurance (liability + cyber) $75, Twilio PolishOS number + campaign $12).

- **Break-even: 18 salon-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (50 a day): **41%** of every sale, after every cost.
- Capacity: 60 a day.

### Year 1, month by month

| month | salon-months a day | revenue | profit | cumulative (after $5,300 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$482 | -$5,782 |
| 2 | 0 | $0 | -$482 | -$6,264 |
| 3 | 0 | $0 | -$482 | -$6,746 |
| 4 | 2 | $90 | -$426 | -$7,172 |
| 5 | 4 | $180 | -$369 | -$7,541 |
| 6 | 6 | $270 | -$313 | -$7,853 |
| 7 | 9 | $405 | -$228 | -$8,081 |
| 8 | 12 | $540 | -$143 | -$8,224 |
| 9 | 15 | $675 | -$58 | -$8,282 |
| 10 | 18 | $810 | $26 | -$8,256 |
| 11 | 21 | $945 | $111 | -$8,145 |
| 12 | 24 | $1,080 | $196 | -$7,949 |

- **Year 1 operating profit: -$2,649** on $4,995 of revenue.
- After the $5,300 startup spend: -$7,949.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$8,282**.

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 41% | 18 | -$2,649 |
| Price -10% | 35% | 21 | -$3,149 |
| Volume -20% | 36% | 18 | -$3,276 |
| Unit costs +15% | 36% | 19 | -$2,928 |

### Red flags

- Year 1 loses money on operations (-$2,649).
- The startup spend is not earned back within year 1.

## Marketing

Inputs: `panel/results.md` (offer re-test), `competitors.md`, `offer.md`, `pricing.md`, `numbers.json`.

### 1. Positioning
Three versions:
1. For **owners tired of tip fights**, who lose techs over pay nobody can check, PolishOS is the **salon checkout where every tech can see their own pay**, unlike ABC or Square where tips go missing or get split by hand.
2. For **small and mid Vietnamese salons on Square or a $40 POS**, PolishOS is the nail POS you can **try next to your old one for 60 days, set up for you**, unlike rivals that lock you into hardware and contracts.
3. For **owners who feel card fees are a black box**, PolishOS shows your **real yearly cost in writing** and passes Stripe's rate with no markup.
**Pick #1 (lead) + #2 (the how).** Evidence: "tired of pay fights" and "Square users" bought most; "trust" was the top buy reason (7 of 8).

### 2. Channels (start with 3)
| Channel | Why it fits | Cost | Worked if |
|---|---|---|---|
| ✅ Elang's personal network + owner referrals ("introduce 2 owners") | panel: everyone flips on "an owner I know" | $0 + time | 2 intros per happy salon |
| ✅ Vietnamese owner Facebook groups + Zalo: short videos (payout sheet, 30-s checkout, pull Wi-Fi mid-checkout) | where owners decide | $0–200/mo boosting | 10 DMs / video |
| ✅ Nail supply stores: QR flyer "Free fee check" | owners visit weekly | ~$150 print | 5 scans / store / month |
| ❌ Google/Facebook paid ads | buyers trust friends, not ads | | later |
| ❌ Trade shows | too costly now | | after 10 salons |
| ❌ Agency-style marketing | not our game | | never |

### 3. 30-day campaign (launch = first Founding Salon live; target Jan 12 2027 Mon)
| Date | Channel | What |
|---|---|---|
| Dec 29 | Elang list | Write 30 owner names (family, friends, old coworkers); mark contract end dates |
| Dec 30 | Zalo | Create "PolishOS Founding Salons" group |
| Jan 2 | FB groups | Post: "We are Vietnamese salon people building a POS. Looking for 10 salons. Free fee check." (no claims) |
| Jan 5 | Elang calls | 10 calls/day; offer the free fee check (no sign-up needed) |
| Jan 7 | Video 1 | 30-s: tech checks own pay by PIN |
| Jan 9 | Supply stores | 3 stores, QR flyers |
| Jan 12 | **Salon #1 live** | Elang at desk; record (with permission) |
| Jan 14 | Video 2 | Pull the Wi-Fi mid-checkout, ticket still saves |
| Jan 17 | Salon #1 Saturday | Elang on site |
| Jan 19 | FB/Zalo | Real update from salon #1 (their words, their OK; no made-up quotes) |
| Jan 21 | Video 3 | Two-tech tip split, done right |
| Jan 24 | Salon #2 Saturday | |
| Jan 26 | Referral ask | Salon #1: "introduce 2 owners" |
| Jan 28 | Video 4 | Fee check walkthrough (fake numbers clearly labeled) |
| Feb 1 | Review | Counts vs targets (below) |
Nothing new to say → behind the scenes: Oliver building, Elang's salon-family story, a tech's first payout sheet (with OK).

### 4. Ten hooks (each answers an objection)
1. "Thợ tự xem lương bằng PIN. Hết cãi nhau tiền tip." / "Techs check their own pay. No more tip fights." (pay trust)
2. "Try it next to your old POS for 60 days." (switching risk)
3. "Pull the Wi-Fi. The ticket still saves." (offline)
4. "Bring 3 months of card statements. We'll show your real yearly cost." (are fees cheaper)
5. "Two techs, one client, tip split right. Every time." (ABC complaint)
6. "We move your clients and menu. You don't type anything." (setup work)
7. "Your data is yours. Export everything any time, in writing." (company closes)
8. "Made by a salon family. Answers in Vietnamese on Zalo." (who are you)
9. "No contract. No lease. You own the reader." (lock-in)
10. "10 Founding Salons. $39 for 12 months." (real scarcity)

### 5. Budget + numbers
- Budget first 90 days: **~$1,000** (flyers $150, boosting $300, travel $550) — same as CFO launch line.
- Most we can pay to win a salon: contribution **$28.24/mo** (CFO) × ~24 months expected stay (guess) ≈ **$678**; keep real cost under **$200/salon** so payback < 8 months.
- Watch weekly: (1) fee checks done (goal 5/week), (2) trials started (goal 1/week), (3) trial → paid after 60 days (goal 60%+). Change something if 2 weeks in a row miss.

## Brand

Name is already chosen and bought (polishosapp.com, EO Collective). So this is a check + voice + look, not a rename.

### 1. Name check
- **PolishOS** (keep). Says: nail polish + an operating system for the salon. Easy to say in English; Vietnamese owners may say "Pô-lít" — test aloud with 5 owners.
- Backup names if trademark fails: **TipFair**, **Tiệm OS**, **FairTurn**.
- Checks to do (you, not us):
  - Trademark: USPTO search https://tmsearch.uspto.gov — class **9** (software) and **42** (SaaS). Open to-do in CLAUDE.md.
  - Domain: polishosapp.com owned; polishos.com taken; polishos.app was free (Nov 17, re-check).
  - Handles: Instagram, TikTok, Facebook page, YouTube, Zalo OA "PolishOS".
  - Confusion: no rival near this name in `competitors.md`.
- Public searches only; a trademark lawyer confirms. Nothing is registered until you register it.

### 2. Promise + voice
- **Promise:** "Every dollar, every tech, out in the open."
- Taglines: (a) "Fair pay. Clear fees." (b) "The salon app techs trust." (c) "Lương rõ ràng. Phí rõ ràng."
- Voice: **Plain** (do: short words, $ amounts; don't: "seamless", "AI-powered"). **Family** (do: "we're salon people"; don't: corporate). **Honest** (do: say what it can't do yet; don't: fake urgency or reviews).
- Before: "Checkout with cash or a Stripe card reader, turn list for walk-ins, booking calendar…" → After: "Techs see their own pay. You see every fee. Try it next to your old POS for 60 days."

### 3. The look (already set: Nail POS Design System, `design/kit/`)
- Keep the existing kit (Inter, calm Apple-like, one accent). Don't add a second look.
- Logo brief: must read at 32px app icon and on a receipt printer (black only); idea = a polish drop + a check mark; avoid glitter/pink clichés and anything close to ABC/Zota marks. Concepts from an image tool = concepts only.
- Check text contrast WCAG AA on every brand colour (kit tokens).

### 4. First five touchpoints
1. Facebook/Zalo post + flyer: hook #1 + "Free fee check" QR.
2. Fee check sheet (1 page, Vietnamese + English): your yearly cost now vs PolishOS, exit fee included.
3. Setup day: Elang's printed checklist + first receipt with the salon's name.
4. First payout sheet a tech prints by PIN (the "aha" moment — make it beautiful).
5. Reply to the first complaint: same day, Vietnamese, name + phone, what we'll fix and when.

## Operations

### 1. Daily / weekly cycle
- Daily (customer sees ✱): check `/admin` alerts (devices off, Stripe, late plan) ✱; answer Zalo/phone ✱; uptime + backup emails (GitHub Actions).
- Weekly: 1 check-in call per salon (logged in Admin → Salons) ✱; review Sentry errors; ship fixes on one fixed day (not Fri/Sat).
- Per new salon: fee check → invite → setup day (1h) → first Saturday on site ✱ → day 7 / 30 / 60 review ✱.

### 2. Suppliers
| Need | Supplier | Price (public, check) | Lead time |
|---|---|---|---|
| Card reader S710 | Stripe (live readers only from Stripe) | ~$299 | ~1 week |
| Receipt printer + drawer | Amazon list `docs/hardware-shopping-list.md` | $330–520 | 2 days |
| Texts / login codes | Twilio | see Running Costs | 10DLC 1–3 weeks per salon |
| Hosting, DB | Vercel Pro, Supabase Pro | $20, $25/mo | now |
| Email | Resend | $0–20 | now |
No price changes vs `numbers.json`.

### 3. People (who does what)
| Role | Who | Hours |
|---|---|---|
| Build, fix, live switch-on | Oliver | as now |
| Sales, fee checks, setup days, first Saturdays, Zalo support | Elang | ~3 setups/month max (this caps growth) |
| Ops: check-ins, ordering readers, paperwork | Laura | few h/week |
| Backup support on Saturdays | Oliver (phone) | Sat 9–6 first 3 months |
Unpaid founders now. When paid, payroll taxes on top: ask the accountant.

### 4. Routines (SOPs)
**A. Fee check (30 min)** 1) Get 3 months of card statements 2) Total fees + monthly POS + lease + exit fee 3) Fill the fee sheet: yearly now vs PolishOS (Stripe 2.7%+5¢ on their card volume + $49×12) 4) Show honestly — if we're not cheaper, say so 5) Offer the trial.
**B. Setup day (1h)** follow `docs/go-live-plan.md` §10: invite → 10 steps → Make PINs → reader + printer → $1 test → old POS stays on.
**C. First Saturday** arrive before open; stand at desk; note every stuck moment in a list for Oliver; Wi-Fi pull test only with owner OK.
**D. Complaint** answer same day, Vietnamese; log in Admin; fix date; call back.
**E. Close of trial (day 60)** show their own numbers (Numbers page + payout sheet); ask: stay / need changes / leave (export their data either way).
**F. Weekly:** order readers if fewer than 2 loaners left.

### 5. Tools (our own)
Stripe (payments + billing), Supabase, Vercel, GitHub Actions (uptime, backup), Sentry, Twilio, Resend, Google Workspace, Zalo, a simple bookkeeping tool (Wave free / QuickBooks ~$35) — pick with accountant.

### 6. Licences, permits, insurance (check each — not legal advice)
- LLC/registration + EIN for EO Collective (needed to switch Twilio to business) — https://www.irs.gov/ein
- California seller's permit not usually needed for SaaS; confirm with CDTFA https://www.cdtfa.ca.gov
- Business licence in your city.
- Insurance: general liability + cyber (you hold card + client data).
- Stripe Connect platform terms; Terms/Privacy lawyer review (go-live plan §7); texting consent (TCPA) + 10DLC.
- If reselling readers: sales tax on hardware — ask the accountant.

### 7. Risk register
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

## Launch plan

Today: Nov 20 2026 (Fri). Owners: **O** = Oliver, **E** = Elang, **L** = Laura.

### 1. Test before spending (the cheapest real test)
- **10 free fee checks in 3 weeks** (Nov 23 – Dec 13). No product needed, costs $0.
- **Success line:** 10 fee checks done → **3 owners agree to start a 60-day trial** (30%). Panel says 40% (upper bound).
- If fewer than 2 of 10: don't spend on readers/travel; go back to `/founder-offer` (and listen to why).

### 2. Countdown (critical path = ★)
| Week | Task | Who | Done by |
|---|---|---|---|
| Nov 23 | 2-step login + spending alerts everywhere (go-live §1) | O+E | Nov 24 |
| Nov 23 | ★ Write 30 owner names; start fee checks | E | Nov 27 |
| Nov 30 | ★ Live database on (Supabase Pro, `LIVE_DB_URL`, run workflow) (§2) | O | Dec 4 |
| Nov 30 | Fee sheet (1 page EN/VI) + flyer | E+L | Dec 4 |
| Dec 7 | ★ Site on live keys + live sign-in (§3–4) | O | Dec 9 |
| Dec 7 | ★ LLC/EIN; Twilio → business | O | Dec 11 |
| Dec 14 | ★ Stripe live + webhooks button (§5); order 3 loaner S710 | O | Dec 18 |
| Dec 14 | Lawyer reads terms/privacy/texts (§7) | E | Dec 31 |
| Dec 14 | **Decide final price** (pricing.md: $49, Founding $39 ×12) — tell Claude before any owner opens Billing | O+E | Dec 16 |
| Dec 21 | Sentry + alerts (§8); proof-of-consent build (texting 4c) | O | Dec 23 |
| Dec 21 | **Hide non-core features for pilots** (board: one thing = checkout + pay) | O | Dec 23 |
| Dec 28 | ★ Soft open: run a full fake day at a friendly salon after hours | O+E | Jan 3 |
| Jan 5 | Marketing calendar starts (marketing.md) | E | — |
| **Jan 12** | ★ **Salon #1 live** (old POS stays on) | E | Jan 12 |

### 3. Launch-day run sheet (Salon #1, Mon Jan 12)
- 8:30 E arrives; O on phone/laptop.
- 9:00 setup steps (go-live §10): invite → info → menu import → staff + PINs → reader → printer → devices → $1 test + refund.
- 10:00 first real ticket on PolishOS; old POS ready beside it.
- 12:00 first two-tech tip split checked by hand.
- 18:00 close day together; print payout sheet; each tech checks own pay by PIN.
- If reader fails → pay link / old terminal. If Wi-Fi drops → keep going (offline), watch sync. If app error → old POS, O fixes tonight.
- 19:00 O+E: write every stuck moment; fix list.

### 4. First 30 days
| Week | Track | Change if |
|---|---|---|
| 1 | tickets/day on PolishOS vs old POS; stuck moments | <50% of tickets on PolishOS by day 7 |
| 2 | tech pay questions; payout errors (must be 0) | any wrong pay = stop + fix |
| 3 | fee checks done; trials started | <1 trial/week |
| 4 | owner: "would you keep it?" | "no" → why, fix before salon #4 |
Reviews: **day 7** (does checkout work on a busy day?), **day 14** (do techs trust the pay sheet?), **day 30** (is the owner ready to turn the old POS off? would they introduce 2 owners?).

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
