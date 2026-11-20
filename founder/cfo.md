# CFO note (plain words) — updated with /founder-ops real costs, Nov 20

- **The margin:** each paying salon leaves **$28.24/month** after its own costs (63%). At 50 salons: profit margin from the tool below.
- **Fixed costs went up to $644/mo** (was $482): CA LLC tax $800/yr ($67/mo), insurance ~$160 (not $75), Supabase $35 (2 projects).
- **Break-even: 23 paying salons** (was 18). Plan has 24 by month 12, so you only reach it at the very end of year 1.
- **Year 1: -$4,593** on operations. **Cash needed before it pays for itself: ~$9,900.** Founders unpaid.
- **The line to watch: the ramp** (Elang ~3 setups/month). 20% fewer salons → -$5,220.
- **Ways to improve it (tool-run):**
  1. Claude $150 → $20/mo after the build: **-$3,033**, break-even 19.
  2. Faster setups (4–5/month, 28 by month 12; needs a 2nd setup person): **-$3,605**.
  3. Price $59: **-$3,039**, break-even 16. ($49 for all, no founding discount: -$4,149.)
  - 1 + 2 + $49 for all: -$1,461. 1 + 2 + **$59**: **-$1 (break-even)**.
  - 1 + 2 + $49 + insurance kept to general liability + cyber (~$60, skip tech E&O until revenue): -$261.
- **Board money conditions:** "test a higher price" → now matters more: $59 is the cleanest single lever. Test $49 vs $59 with real owners (pricing.md). "Plan for year 3" → open (card margin 0.2% parked).
- Revenue is before tax; SaaS is generally not taxed in California, but hardware resale may be — ask.
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

Fixed costs: $644 a month (Supabase Pro ($25 org) + 2nd project compute (test + live) $35, Vercel Pro $20, Google Workspace + domains $22, Resend email $20, Claude (build) $150, Apple + Google dev (spread) $8, Accountant $150, Insurance: general liability ~$33 + tech E&O/cyber ~$126 (Insureon averages; get quotes) $160, Twilio PolishOS number + campaign $12, California LLC annual tax $800/yr (spread) $67).

- **Break-even: 23 salon-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (50 a day): **34%** of every sale, after every cost.
- Capacity: 60 a day.

## Year 1, month by month

| month | salon-months a day | revenue | profit | cumulative (after $5,300 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$644 | -$5,944 |
| 2 | 0 | $0 | -$644 | -$6,588 |
| 3 | 0 | $0 | -$644 | -$7,232 |
| 4 | 2 | $90 | -$588 | -$7,820 |
| 5 | 4 | $180 | -$531 | -$8,351 |
| 6 | 6 | $270 | -$475 | -$8,825 |
| 7 | 9 | $405 | -$390 | -$9,215 |
| 8 | 12 | $540 | -$305 | -$9,520 |
| 9 | 15 | $675 | -$220 | -$9,740 |
| 10 | 18 | $810 | -$136 | -$9,876 |
| 11 | 21 | $945 | -$51 | -$9,927 |
| 12 | 24 | $1,080 | $34 | -$9,893 |

- **Year 1 operating profit: -$4,593** on $4,995 of revenue.
- After the $5,300 startup spend: -$9,893.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$9,927**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 34% | 23 | -$4,593 |
| Price -10% | 27% | 28 | -$5,093 |
| Volume -20% | 27% | 23 | -$5,220 |
| Unit costs +15% | 29% | 26 | -$4,872 |

## Red flags

- Year 1 loses money on operations (-$4,593).
- The startup spend is not earned back within year 1.
