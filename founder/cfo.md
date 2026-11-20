# CFO note (plain words)

- **The margin:** each paying salon leaves **$28.24/month** after its own costs (63%). At 50 salons: 41% profit margin.
- **Break-even: 18 paying salons.** Plan reaches 18 in month 10 and 24 by month 12.
- **Year 1: -$2,649** on operations, -$7,949 after the $5,300 startup spend. **Cash needed before it pays for itself: ~$8,300.** Founders are unpaid in these numbers.
- **The line to watch: the ramp** (how fast salons pay). Elang can set up ~3 a month; that, not price, sets year 1.
- **Three ways to improve it (tool-run, one change at a time):**
  1. Claude plan $150 → $20/mo after the pilot build: year 1 **-$2,649 → -$1,089**, break-even 18 → **13** salons.
  2. Faster setups (4–5 a month, 28 salons by month 12; needs a 2nd person doing setups): year 1 → **-$1,661**.
  3. $49 for everyone (no $39 founding price): year 1 → -$2,205, break-even 15.
  - 1 + 2 together: **-$101**. 1 + 2 + 3: **+$483 (first profitable year 1)**.
  - Risk side: 20% fewer salons → -$3,276.
- **Board money conditions:** "test a higher price" → not done (needs real owners); "plan for year 3" → open. Card margin (0.2% on card sales, no fee on tips) is the parked lever in the research report; revisit at ~50 salons.
- Not financial, tax or legal advice: an accountant should check the LLC, payroll and tax before money moves.

# Unit economics: PolishOS (1 unit = 1 paying salon for 1 month; 'per day' fields = paying salons, days_per_month = 1). Price $45 = blended year 1: first 10 Founding Salons at $39, rest at $49.

Every number below comes from the input file. Nothing is looked up or guessed.

## One salon-month

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

## The margin that matters

Fixed costs: $482 a month (Supabase Pro (live)  $25, Vercel Pro $20, Google Workspace + domains $22, Resend email $20, Claude (build) $150, Apple + Google dev (spread) $8, Accountant $150, Business insurance (liability + cyber) $75, Twilio PolishOS number + campaign $12).

- **Break-even: 18 salon-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (50 a day): **41%** of every sale, after every cost.
- Capacity: 60 a day.

## Year 1, month by month

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

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 41% | 18 | -$2,649 |
| Price -10% | 35% | 21 | -$3,149 |
| Volume -20% | 36% | 18 | -$3,276 |
| Unit costs +15% | 36% | 19 | -$2,928 |

## Red flags

- Year 1 loses money on operations (-$2,649).
- The startup spend is not earned back within year 1.
