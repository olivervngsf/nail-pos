# Board brief: PolishOS

(Facts only, from the founders' own docs, Nov 20 2026. No opinion added.)

# PolishOS (by EO Collective)

- What it is: a point-of-sale + salon app for Vietnamese-run nail salons: checkout (cash, Stripe card reader, pay link), fair tech payout sheet with tips and card fees on every ticket, turn list for walk-ins, booking calendar, client profiles, gift cards, loyalty, owner numbers, English/Vietnamese.
- Who it is for: owners of Vietnamese-run walk-in nail salons in the US, 1–20 techs (start in California, where ~80% of salons are Vietnamese-run), and the senior, low-tech staff who use it every day.
- What it sells, at what price: one flat plan, $49/month per salon (or $468/year = $39/month), all staff and devices included, free 30-day pilot. Card fees passed through at Stripe cost, no markup (2.7% + 5¢ on a reader). Salon buys a Stripe S710 reader (~$299) once. Promo texts from prepaid credit (2¢/text). No contract, no setup fee, no per-tech fee.
- Where and how: web app at polishosapp.com (runs on the salon's own iPad/computer/phones, works offline). Found through personal networks, Vietnamese Facebook groups, Zalo, nail supply stores, owner referrals. Elang sells and does setup day (1 hour); Oliver builds.
- Budget and constraints: two-person team (Oliver = build + design, Elang = sales + client care), Laura helps ops. Founders unpaid. Tools ~$215–375/mo in pilot (incl. Claude). Product is mostly built (V1 code done, test setup live); live database, live Stripe and texting registration still to switch on. 0 paying salons today; 2–3 pilot salons not yet signed.

## Market facts the founders have (mostly secondary sources, unverified)
- ~50k–130k US nail salons, roughly 40–51% Vietnamese-run → ~25–60k target salons. California ~80% Vietnamese-run.
- Owners decide by word of mouth, Vietnamese Facebook groups, Zalo — not review sites.
- It is a payments market dressed as a software market: rivals sell cheap software and earn on card processing, leased hardware, lock-in.
- Card fees cost a salon ~10–20x the software fee (model salon: 8 techs, $40k/mo sales, ~$900/mo card fees).

## Competitors (from founders' research)
- ABC Salon System (Vietnamese, Texas): $40/mo software "limited-time" + $1,900–2,500 hardware or $160–210/mo for 12 months; marketing packages $288–475/mo. Year 1 ≈ $2,400 vs PolishOS ≈ $887. App 3.0 stars; tech complaints: lost tips, two-tech tip put on one ticket. Ships weekly. Has Reserve with Google. Filters unhappy clients from review requests.
- Zota: strong in busy Vietnamese salons, quote only, tied to a card processor.
- Mango $49–299 + setup fee, 3-month minimum; Fastboy from $50 (payroll extra); Tilavon ~$39; TLNA from $59; NailSoft ~$100. New entrants already pitch Vietnamese + low price.
- Square: $0/$49/$149, 2.6% + 15¢; no turn list, no Vietnamese, weak tip split. Fresha/Vagaro/Booksy: per-staff pricing ~$115–210/mo for 10 staff, built for appointment salons.

## What the founders believe is different
- Pay techs can trust: tip + card fee on every ticket, multi-tech tip split, check/cash payout split (no rival found offering it), techs see/print own earnings by PIN, every change logged.
- No traps: no contract, no lease, salon owns reader + data, export any time.
- ~$890 year 1 vs ~$2,400 (ABC cheapest).
- Calm design for senior Vietnamese staff; works offline.
- Honest reviews (no review gating); tip records useful for the 2026 "No Tax on Tips" deduction (nail techs are on the IRS list).

## Founder pain research (affinity map, thin: mostly one source + online reviews)
- Techs: turns = income, don't trust whoever picks next; trust paper they can see; can't check how pay/tips are worked out; fees taken from card tips.
- Owners: tired of nickel-and-diming and surprise charges; too busy to set up software; staff won't learn new apps (live by phone number + PIN).

## Unit economics the founders have (estimates)
- Our cost to serve: ~$22–40 per salon/month in tools + ~$10/salon texting. Break-even on tools ~12–15 paying salons. To pay founders: more salons or higher price.
- Stripe Connect ~$2 per active salon/month.

## Open questions
- Final price ($39–49 vs. a second $149–199 plan for 20+ staff).
- How pilot salons pay techs today; card vs cash share; what they pay now and exit fees.
- No pilot salons signed yet. No real customer interviews beyond 1–2 people.
