# Price points: everything PolishOS costs (for Oliver, Elang, Laura)

Updated Nov 24, 2026. Plain numbers in one place. "Real" = we pay it or it's on a bill; "est." = public price or a guess, check before relying on it.
Shareable page (same content): https://claude.ai/artifact/MqrEjYoRYhdmaCTCZK1osU (source `docs/costs.html`; keep both in step).
All price pages (each links back here): Running Costs doc https://claude.ai/artifact/UioTSft9RRanZRPN9j7qom · Pricing board https://claude.ai/artifact/UYUEeU5J5sWsTfAaWHE9EE · Hub https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU · `founder/pricing.md` · `docs/hardware-shopping-list.md`.
Deeper math: `founder/cfo.md` (inputs in `founder/numbers.json`). Price reasoning: `founder/pricing.md`. Go-live steps: `docs/go-live-plan.md`.

## 1. What a salon pays US
| Item | Price | Status |
|---|---|---|
| Salon plan (all staff, everything) | **$49/mo**, or **$468/yr** (= $39/mo) | Proposal; final price = Oliver + Elang (go-live plan § 7) |
| Free pilot | first 30 days $0 | In the app (Billing) |
| Founding Salon offer | first 10 salons: $39/mo locked for 12 months, then $49 (ends Mar 31 2027) | Proposal (`founder/pricing.md`) |
| Salon Plus (bigger salons) | $99–149/mo | Idea, test with owners first |
| Service texts (confirm, reminders, receipts, login codes) | included, never stop | Decided |
| Promo texts | prepaid credit, **2¢ per text part** (160 letters; Vietnamese accents = 70, so ~2×) | Built (test mode until texting approved) |
| Card fees | **no markup**: salon pays Stripe directly | Decided |

## 1b. Plans: 4 tiers + the $100k/year goal (proposal, Nov 24; decide with Elang)
| Plan | Price | Who | What they get | Why it exists |
|---|---|---|---|---|
| **Base Coat** (Free) | $0 forever | Tiny salons, 1–3 staff, trying us | Booking page, calendar, client list, cash tickets, email confirms. No card reader, no texts, 1 device | Door opener; costs us ~$0 (email free, texts off) |
| **Founding** (Early) | $39/mo locked 12 months | First 20 salons, ends Mar 31 2027 | Everything in Gel + Elang sets up in person | Wins trust; becomes Gel after 12 months |
| **Gel** (Premium) | **$49/mo** or $468/yr | Most salons, 1–15 techs | Everything: card reader checkout, payout sheet, turns, texts, loyalty, gift cards, VN/EN | The main plan; research says $49 is the sweet spot |
| **Acrylic** (Next) | **$129/mo** | 15+ techs or 2+ locations | Gel + all locations on one screen, 1,000 promo texts/mo, priority Vietnamese phone line, help moving off the old POS | Few big salons, big share of revenue |

**The $100k math** ($8,350/mo): 110 Gel × $49 = $5,390 · 20 Acrylic × $129 = $2,580 · 10 Founding × $39 = $390 → **$8,360/mo = $100.3k/yr from 140 paying salons** (+ ~100 free salons as the funnel).
- After costs: fixed ~$7.7k/yr + ~$17/salon/mo (~$28k/yr) → **~$64k/yr left** before paying founders.
- Hard part = getting salons, not price: Elang sets up ~3/month in person (~36/yr). Need **10–12 new paying salons/month** → self-setup (wizard + QR devices) + Elang on video day 1 + free salons upgrade when they want to take cards.
- Realistic path: **Year 1 ~40 paying (~$24k/yr) · Year 2 ~140 (~$100k/yr)**.
- Rules: no card-fee markup; Free never gets the card reader (cards = the reason to upgrade); hardware at cost.
- Decide with Elang: Gel $49 vs $59 (at $59 → ~118 salons for $100k) · Acrylic $129 vs $149 · $199 one-time setup fee for Acrylic only?

## 2. What a salon pays OTHERS (not us)
| Item | Price | Notes |
|---|---|---|
| Card on the Stripe reader | 2.7% + 5¢ | Stripe, straight from the salon's own account |
| Pay link / QR (backup) | 2.9% + 30¢ | ~20% more than the reader |
| Card reader Stripe S710 | $299 once (+ tax/shipping) | Bought from the Stripe dashboard; 1 per salon. Our test order Nov 24: $354.17 all in (§ 8) |
| Stripe M2 small reader | ~$59 once | Only with our handheld / phone app |
| Receipt printer + cash drawer | $330–520 once | `docs/hardware-shopping-list.md` |
| Year 1 total, typical | ≈ **$887** ($49 × 12 + S710) + printer | vs ~$2,400 for ABC Salon System's cheapest setup |

## 3. What WE pay every month (our tools)
| Tool | What for | Price | Status Nov 23 |
|---|---|---|---|
| **Google Workspace** Business Starter | work email `oliver@polishosapp.com` (+ `support@` as a free alias), calendar, Drive | **$8.40/user/mo** (monthly, cancel any time) | **Real**: signed up Nov 23, free until Dec 7, billed to Viet Nguyen. Elang + Laura = +$8.40 each |
| ImprovMX | forwarded support@ to Gmail | $0 | Real; not needed once Workspace mail is on (then cancel) |
| Resend | app emails (sign-in codes, booking confirms) from `no-reply@mail.polishosapp.com` | $0 now (100/day), $20/mo later | Free plan |
| Supabase | database (test + live) | $25 + ~$10 = **$35/mo** | est.; Pro needed before the first real salon |
| Vercel | hosting polishosapp.com | **$20/mo** | est. (Pro) |
| Twilio | PolishOS number + campaign, login codes | number $1.15/mo + ~$12/mo; login code ~6¢ each | Real: $20 prepaid, auto-recharge |
| Claude | building the app | $150/mo (→ $20 after the build) | est. |
| Domains (GoDaddy) | polishosapp.com + eo-collective.com | paid for 3 years, renew Nov 2029 | Real |
| Apple + Google developer | phone app stores (later) | ~$8/mo spread | est. |
| Accountant | books + taxes | ~$150/mo | quote needed |
| Insurance | general liability + cyber/tech E&O | ~$160/mo (~$60 if only GL + cyber) | quote needed |
| California LLC tax | EO Collective as an LLC | $800/yr (~$67/mo) | not formed yet |
| **Total fixed** | | **~$644/mo** (plan) | today we really pay much less: Workspace, Twilio, Claude |

## 4. What each paying salon costs US (per month)
| Item | Cost |
|---|---|
| Service texts (~600, local number, 10DLC) | ~$10.00 |
| Stripe Connect active account | $2.00 |
| Login codes (~20) | $1.20 |
| Stripe fee on the $49 we collect + Billing 0.7% | $2.06 |
| Guarantee reserve | $1.50 |
| **Left per salon** (at $45 blended price) | **$28.24 (63%)** |

## 5. One-time (before / at launch)
| Item | Cost |
|---|---|
| Lawyer: terms, privacy, texting consent | ~$1,500 |
| LLC filing $70 + Statement of Info $20 + EIN (free) | ~$300 with Twilio business switch |
| Test hardware (mostly bought; S710 test kit $354.17 real, § 8) | ~$1,000 |
| Loaner S710 readers (3) | ~$900 |
| Launch (flyers, video, travel) + Elang setup travel | ~$1,600 |
| **Total** | **~$5,300** |

## 6. Bottom line (from `founder/cfo.md`)
- Break-even: **23 paying salons**.
- Year 1: **-$4,593** on operations; cash needed ~**$9,900** (founders unpaid).
- Biggest levers: Claude cost down after the build, faster setups, test $49 vs $59.

## 7. Still to decide / check
- Final price + Founding offer (Oliver + Elang).
- Workspace seats for Elang + Laura (when they answer salons).
- Insurance + accountant quotes; form the LLC → move Workspace, Twilio, Stripe to EO Collective.
- Not tax, legal or financial advice: the accountant checks before money moves.

## 8. What we bought (real receipts, one row per order)
Add a row every time we buy something for the project. Totals include tax + shipping.
| Date | What | From | Paid | Status | Notes |
|---|---|---|---|---|---|
| Nov 24, 2026 | Stripe S710 card reader ×1 + S710 dock ×1 | Stripe dashboard → Terminal → Shop (lotus-test) | **$354.17** | Pending (shipping to Oakland, CA) | For building + testing. Register in **Sandbox** when it arrives (needs a Stripe Location first); move to Live for the first real salon |
| Nov 16, 2026 | PS10 handheld terminal, "With NFC" version (H10, Android 14, 58 mm printer; seller POS STORE USA) | Amazon [B0CZLZZ8YF](https://www.amazon.com/dp/B0CZLZZ8YF) | **$179.99** (list price; tax on the order) | Got it, in use. Free return until Jan 31, 2027 | Bought to test taking cards by tap on its NFC. Lesson: it can't. Stripe Tap to Pay needs a Google-certified device and the PS10 says "Device is not certified". Still useful: our Android app + its printer work on it. Cards on it = Stripe M2 reader next to it. That's why we bought the Stripe S710 for the front desk |
| **Total so far** | | | **$534.16** | | |

