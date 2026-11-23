# Price points: everything PolishOS costs (for Oliver, Elang, Laura)

Updated Nov 23, 2026. Plain numbers in one place. "Real" = we pay it or it's on a bill; "est." = public price or a guess, check before relying on it.
Shareable page (same content): https://claude.ai/artifact/MqrEjYoRYhdmaCTCZK1osU (source `docs/costs.html`; keep both in step).
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

## 2. What a salon pays OTHERS (not us)
| Item | Price | Notes |
|---|---|---|
| Card on the Stripe reader | 2.7% + 5¢ | Stripe, straight from the salon's own account |
| Pay link / QR (backup) | 2.9% + 30¢ | ~20% more than the reader |
| Card reader Stripe S710 | ~$299 once | Bought from the Stripe dashboard; 1 per salon |
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
| Test hardware (mostly bought) | ~$1,000 |
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
