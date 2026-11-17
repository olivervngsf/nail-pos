# Pricing and payment economics for a US nail-salon POS (late 2026)

Research date: 2026-11-16. US, USD.
Labels: **[V]** = verified on a primary source (vendor's own page or docs). **[S]** = secondary source only (blog or aggregator citing the vendor). **[E]** = our own estimate or model assumption.
Note on method: this session could not open stripe.com, squareup.com or other vendor pages directly (the network blocked them). Stripe figures come from Stripe's own docs (through the Stripe docs tool) and from search snippets of stripe.com pages. Re-check every rate on the live pricing pages before publishing prices.

## 1. What Stripe charges us in the US (cards, Terminal, Tap to Pay, Connect, payouts, disputes)

### Takeaway
Stripe's list rates are 2.9% + 30¢ for online cards (this covers QR code and Payment Link checkout) and 2.7% + 5¢ for in-person Terminal. Tap to Pay adds 10¢. If we choose Connect pricing where **we** handle the pricing, we also pay $2 per active salon per month plus 0.25% + 25¢ per payout. At list rates that leaves almost no room to add a markup and still match Square. Our current V1 checkout is QR code / pay link only, so every card sale uses the most expensive (online) rate.

### Cited Findings
- Online domestic cards: 2.9% + 30¢ per successful charge. Non-US cards add 1.5%, and currency conversion adds 1%. **[S, citing stripe.com/pricing snippet]** — [Stripe pricing (search snippet)](https://stripe.com/pricing?Sid=1); [PaymentCloud](https://paymentcloudinc.com/blog/stripe-fees/)
- In-person Terminal, domestic cards: 2.7% + 5¢. Tap to Pay adds $0.10 per authorization. **[S, citing stripe.com/pricing snippet]** — [Stripe pricing](https://stripe.com/us/pricing?locale=fr); [Flexprice 2026](https://flexprice.io/blog/stripe-pricing-breakdown-2026)
- Disputes: $15 when a dispute is received, plus $15 if you respond to it, refunded if you win. "Smart Disputes" charges 30% of the disputed amount on disputes it wins. **[S]** — [Stripe pricing](https://stripe.com/pricing?app=1); [PaymentCloud](https://paymentcloudinc.com/blog/stripe-fees/)
- Instant Payouts: sources disagree. One says 1.5% (50¢ minimum), others say 1% (50¢ minimum). Standard payouts are free. **[S, conflicting]** — [PaymentCloud](https://paymentcloudinc.com/blog/stripe-fees/); [Flexprice](https://flexprice.io/blog/stripe-pricing-breakdown-2026)
- Connect, when the platform handles pricing: $2 per active account per month and 0.25% + 25¢ per payout sent. An account counts as "active" in any month it gets a payout. If Stripe handles pricing (salon pays Stripe directly), the platform pays no Connect fees. **[S, citing stripe.com/connect/pricing]** — [Stripe Connect pricing](https://stripe.com/connect/pricing); [Flexprice](https://flexprice.io/blog/stripe-pricing-breakdown-2026)
- How a platform takes its cut: with destination charges, it sets `application_fee_amount`; Stripe moves that fee to the platform and then takes its own processing fee out of the platform's balance. Stripe's worked example: $10 charge, $1.23 application fee, $0.59 Stripe fee, $0.64 left for the platform. Refunds and chargebacks come out of the platform's balance. **[V]** — [Stripe docs: destination charges](https://docs.stripe.com/connect/destination-charges?platform=web&ui=embedded-page)
- Direct charges, the model Stripe describes for SaaS platforms: the payment lands in the salon's balance, the platform can add an application fee, refunds and chargebacks come out of the salon's balance, and the platform can choose whether Stripe bills its fees to the salon or to the platform. **[V]** — [Stripe docs: charge types](https://docs.stripe.com/connect/charges)
- Stripe's no-code "Platform pricing tool" lets a platform set markup rules by transaction type and by group of salons (e.g. "SaaS platforms typically use application fees to charge payment processing costs or markups"). It only works when the platform pays Stripe's fees. On IC+ pricing it also covers direct charges on Express/Custom accounts. **[V]** — [Stripe docs: platform pricing tool](https://docs.stripe.com/connect/platform-pricing-tools)
- Stripe's "Connect margin reports" show volume, application fee revenue, network costs and Stripe fees per salon, so we can see which salons make or lose money for us. **[V]** — [Stripe docs: margin reports](https://docs.stripe.com/connect/margin-reports)
- Tap to Pay on iPhone needs a native iOS app (Terminal iOS / React Native SDK) and an Apple entitlement, and Apple must approve the app. On Connect, each salon has to accept Apple's Tap to Pay terms. It needs an iPhone XS or later. **[V]** — [Stripe docs: Tap to Pay iPhone](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios); [Stripe docs: connect reader](https://docs.stripe.com/terminal/payments/connect-reader?terminal-sdk-platform=ios&reader-type=tap-to-pay)
- US Terminal hardware: smart readers (BBPOS WisePOS E, Stripe Reader S700/S710/T600, Verifone) and the Stripe Reader M2 mobile reader, plus Tap to Pay on iPhone and on Android. **[V]** — [Stripe docs: US regional](https://docs.stripe.com/terminal/payments/regional?integration-country=US)
- Terminal supports offline payments and tip adjustment at checkout. **[V]** — [Stripe docs: Terminal](https://docs.stripe.com/terminal)

### Inferences
- **[E]** On a $55 card ticket (tip included), Stripe costs $1.90 (3.45%) through QR / pay link and $1.54 (2.8%) through a Terminal reader. That makes the QR-only V1 about 0.6 points dearer per sale than Square's in-person rate. Getting salons onto a reader quickly makes a real difference to their card costs.
- **[E]** If we handle pricing at list rates, Connect payout fees (0.25% + 25¢ per payout, plus $2 a month) eat most of any markup. Charging 2.9% + 10¢ in person leaves us roughly $2–22 per salon per month (table in section 6). Too thin to fund the business.
- **[E]** Cheapest setup to start: let Stripe handle pricing (the salon pays Stripe's list rates directly, so we pay no $2 or payout fees) and add a small, clearly shown application fee (0.3%). Once our total volume is large, ask Stripe for custom or IC+ pricing and switch to one flat all-in rate.
- **[E]** Stripe's QR/online rate also counts the sale as card-not-present, which tends to bring more disputes. One more reason to push readers.

### Gaps
- Could not open stripe.com/pricing, so the exact Instant Payout rate (1% or 1.5%) and Terminal reader prices are unconfirmed.
- Did not confirm the volume at which Stripe offers custom or IC+ pricing to platforms. Unknown.
- Did not confirm whether a Stripe Payment Link shown as a QR code at the counter can ever get card-present rates (it shouldn't, because the card is entered online). Assumed online rate.

## 2. What competitors charge for processing and software; surcharge and cash-discount rules

### Takeaway
Salon software sits at about $24–149 a month, with card rates around 2.4–2.75% + 0–20¢ in person. Square's free plan (2.6% + 15¢ in person, 3.3% + 30¢ online) is the price most owners compare against. GlossGenius sells a "flat 2.6%, no extras" message. Surcharging is getting looser at the network level (2026 Visa/Mastercard settlement), but several states still ban it. Showing the card fee upfront is fine. Making customers pay it is a per-state legal question.

### Cited Findings
- Square (2026): Free plan $0/mo, 2.6% + 15¢ in person, 3.3% + 30¢ online. Plus $49/mo per location, 2.5% + 15¢ in person, 2.9% + 30¢ online. Premium $149/mo per location, 2.4% + 15¢ in person. Square Appointments no longer has its own price; booking is free on the Free plan. **[S]** — [KoronaPOS](https://koronapos.com/blog/square-pos-fees/); [POSUSA](https://www.posusa.com/square-fees-pricing/); [SchedulingKit](https://schedulingkit.com/pricing-guides/square-appointments-pricing); [NerdWallet](https://www.nerdwallet.com/business/software/learn/square-fees)
- GlossGenius: one flat 2.6% card rate (in person, card on file and manual entry alike), plans $24 / $48 / $148 a month billed yearly. A Booksy comparison lists 2.4% + 15¢ in person, so sources differ. **[S, vendor's own claim]** — [GlossGenius nails](https://glossgenius.com/overview-nails); [Booksy 2026](https://biz.booksy.com/blog/best-salon-software-2026); [GlossGenius calculator](https://glossgenius.com/payment-processing-calculator)
- Vagaro: from $23.99/mo for the first calendar (promo). Processing range given as 2.2%–3.5%; card rates are not printed on its pricing page and have to be quoted. **[S, competitor blogs]** — [GlossGenius on Vagaro](https://glossgenius.com/blog/vagaro-pricing-a-complete-breakdown-of-costs); [Superdupr](https://superdupr.com/blog/vagaro-vs-glossgenius)
- Fresha: cards 2.29% + 20¢ up to 3.3% + 20¢. Fresha dropped its subscription-free pricing in March 2025. **[S, competitor blog]** — [Booksy 2026](https://biz.booksy.com/blog/best-salon-software-2026)
- Clover: about 2.3–2.6% + 10¢ in person depending on plan and business type, 3.5% + 10¢ online. Essentials plan quoted at $14.95 or $29.95 a month (sources disagree). Same-day funding ("Rapid Deposit") 1.75%. Clover.com/pricing could not be read. **[S, conflicting]** — [UpMenu](https://www.upmenu.com/blog/clover-pos-pricing); [NerdWallet](https://www.nerdwallet.com/article/small-business/clover-vs-square); [POSUSA Clover Go](https://www.posusa.com/clover-go/); [Merchant Insiders](https://merchantinsiders.com/blogs/clover-fees/)
- Nail-specific and other POS: SumUp nail salon POS $199 / $289 a month. SpotOn software $25/mo plus $200 hardware. POSNailStore $195 per user per year. Epos Now nail plan "from $349" (no clear monthly figure). An older (2019) estimate puts salon POS at free to $200+/mo, usually priced by number of users. **[S]** — [SumUp](https://www.sumup.com/en-us/pos/nail-salon/?mod=guide); [SpotOn](https://www.spoton.com/small-business/nail-salon/); [Capterra POSNailStore](https://www.capterra.com/p/135633/POSNailStore/); [Epos Now](https://eposnow.com/us/systems/retail-pos/nail-salon); [Salon Today](https://www.salontoday.com/articles/how-much-does-a-salon-point-of-sale-system-cost)
- Cash discount programs work like this: the card machine charges the list price, and cash payers get a set discount. One (unverified) critic argues these mostly push fees onto clients, and that a $25k/month salon saves $2–3k a year on interchange-plus instead. **[S]** — [Epos Now](https://eposnow.com/us/systems/retail-pos/nail-salon); [Perfect Design blog](https://perfectdesignnailsalon.pages.dev/blog/nail-salon-cash-discount-program)
- Visa/Mastercard settlement: a revised settlement got preliminary approval on 2026-06-09 but is **not** final. It gives merchants more ways to surcharge (by card brand or by card product) and caps standard US consumer credit interchange at 1.25% for its term. **[V for Visa statement; S for detail]** — [Visa statement](https://corporate.visa.com/en/sites/visa-perspectives/company-news/visa-statement-mdl-settlement.html); [America's Credit Unions](https://www.americascreditunions.org/node/27531); [Merchant Cost Consulting](https://merchantcostconsulting.com/lower-credit-card-processing-fees/visa-mastercard-settlement-update-june-2026/)
- Surcharge caps: Visa is 3% or the merchant's actual cost, whichever is lower. Mastercard's cap is reported as 3% or 4% (sources conflict). **[S]** — [Lifelong POS](https://lifelongpos.com/resources/blog/visa-surcharge-rules-2026-compliance-guide); [Beancount](https://beancount.io/blog/2026/07/09/visa-mastercard-interchange-settlement-surcharging-guide)
- States: Connecticut, Maine and Massachusetts are reported to ban credit card surcharges. Colorado caps them at 2%. California is unclear (some say an outright ban, others say allowed if avoidable, disclosed and built into the advertised price; SB 478 cited). Louisiana's debit surcharge ban started 2026-08-01. Debit cards cannot be surcharged under network rules. A federal settlement does not override state law. **[S, conflicting]** — [Sasquatch Studio](https://sasquatchstudio.co/blog/credit-card-surcharge-laws-by-state-2026); [eBizCharge](https://ebizcharge.com/resources/templates/credit-card-surcharge-laws-by-state/); [Nickel](https://www.nickel.com/surcharge-laws); [Beancount](https://beancount.io/blog/2026/07/21/visa-mastercard-swipe-fee-settlement-credit-card-surcharge-pos-guide)

### Inferences
- **[E]** The number owners remember is "Square = 2.6%". GlossGenius has taught salons to like one flat rate with no extras. We should have one simple, all-in in-person rate at or below 2.9%, and say plainly that tips carry the same rate.
- **[E]** Our "$39–49, all staff included" sits right at Square Plus ($49 per location) and around GlossGenius's middle tier ($48), and well below nail-specific systems ($195–349). The range is believable.
- **[E]** Build "pass fee to customer" (surcharge or cash discount) as an owner setting that is off by default and limited by state (blocked in CT, ME, MA; capped in CO; flagged in CA). Credit cards only, never debit. Our design rule ("nothing taken silently") makes the fee line on the ticket a selling point.

### Gaps
- No primary pricing pages for Vagaro, Fresha, Mangomint or Vietnamese-market nail POS vendors (e.g. those sold through Vietnamese-language resellers). Figures above come from competitors' blogs.
- No verified statute text for state surcharge rules. Needs legal check before launch.
- Final approval date for the Visa/Mastercard settlement is unknown.

## 3. Nail salon economics (revenue, card share, ticket, techs, tips)

### Takeaway
A typical US nail salon makes about $180k–290k a year (roughly $15k–24k a month). Services run from about $22 (manicure) to $51 (gel full set). Card tips are much bigger than cash tips. Good data on card vs cash share for Vietnamese-run salons was not found; we have to measure it in the pilot.

### Cited Findings
- Average US nail salon revenue: about $287k (2019, 17% profit margin; up to $575k in some states and franchises). About $204k (2023). About $179.7k for a single-location salon with about 2 employees. **[S, conflicting]** — [Zenoti](https://zenoti.com/thecheckin/are-nail-salons-profitable-unlocking-the-secrets-to-success); [SchedulingKit stats](https://www.schedulingkit.com/statistics/nail-salon-industry-statistics); [NamePepper](https://www.namepepper.com/nail-salon-statistics-and-trends)
- Industry size 2024 (Census, NAICS 812113): about $13.1B employer revenue plus $13.1B non-employer receipts. **[S, derived from Census]** — [SchedulingKit stats](https://www.schedulingkit.com/statistics/nail-salon-industry-statistics); [FRED nail salon revenue](https://fred.stlouisfed.org/data/REVEF812113TAXABL)
- Service prices (citing Nails Magazine): gel full set about $51 on average, manicure about $22. Average spend per visit about $35 (2023, unverified). **[S]** — [SchedulingKit stats](https://www.schedulingkit.com/statistics/nail-salon-industry-statistics)
- Tips: salon clients tip 12.1% on average through a card reader vs 4.3% in cash (vendor data, all salon types). **[S]** — [Heygoldie](https://heygoldie.com/blog/how-much-do-clients-tip-at-a-salon)
- Cash tips are often preferred because techs get them right away, while card tips can take days and carry 2–3% card fees. Some salons take card fees out of tips, and some refuse card tips. **[S]** — [NerdWallet](https://www.nerdwallet.com/finance/learn/how-much-to-tip-nail-salon)

### Inferences
- **[E] Model assumptions used in section 6:** about $5,000 a month in service sales per tech, 70% of sales on card, tips on card adding 15% to card volume, $55 average card ticket (tip included). Results: Small 3 techs = $15k/mo sales, about $12.1k card volume, about 220 card tickets. Mid 8 techs = $40k, about $32.2k, about 585 tickets. Large 15 techs = $75k, about $60.4k, about 1,100 tickets. The small case lines up with the $180k/year average.
- **[E]** Card tips make up a real share of the fee base. Being clear about the fee on tips (our payout sheet) answers a real tech complaint.

### Gaps
- No reliable source on card vs cash share for Vietnamese-run walk-in salons (often thought to be more cash-heavy). The 70% figure is a guess; measure it in the pilot.
- No reliable source for average tech count per salon (one aggregator says about 2 employees, which likely misses booth renters and contractors).
- No source for typical software spend per nail salon beyond vendor price lists.

## 4. Pricing psychology for small Vietnamese-owned businesses

### Takeaway
No solid research turned up on how Vietnamese salon owners react to pricing. What we do know: the market is anchored on "free" Square, on GlossGenius's flat-rate story, and on cash-discount pitches from resellers. So one flat monthly price, one card rate and no surprises is the safest position.

### Cited Findings
- Fresha moved away from "free software, paid processing" in March 2025. **[S]** — [Booksy 2026](https://biz.booksy.com/blog/best-salon-software-2026)
- Square's free plan, with paid tiers that lower the card rate, is the common "free POS if you process with us" model. **[S]** — [KoronaPOS](https://koronapos.com/blog/square-pos-fees/)
- GlossGenius markets one flat rate with no extra fees for Tap to Pay, card on file or manual entry. **[S]** — [Booksy 2026](https://biz.booksy.com/blog/best-salon-software-2026)
- GlossGenius offers lower prices when billed yearly (its $24/$48/$148 tiers are yearly prices). **[S]** — [GlossGenius on Vagaro](https://glossgenius.com/blog/vagaro-cost)

### Inferences
- **[E]** Lead with "$49 a month, everyone included, 2.9% on cards, nothing hidden" in Vietnamese, side by side with what the owner pays Square or their reseller today (bring a fee calculator to sales visits; Elang).
- **[E]** Offer a yearly price (2 months free, e.g. $490/yr) after the pilot. It helps cash flow and keeps salons. Don't lead with it in the pilot.
- **[E]** Skip "free POS if you process with us." It ties our income to the card share at cash-heavy salons, clashes with "card fee upfront," and the margin isn't there on Stripe list rates (section 1).

### Gaps
- No primary research (surveys, interviews) on Vietnamese salon owners' price sensitivity, yearly vs monthly billing, or trust in flat vs tiered pricing. Ask in the pilot interviews.

## 5. Texting costs (Twilio / Telnyx, 10DLC) for an add-on

### Takeaway
A text costs us about 0.7–1.3¢ per segment once carrier fees are added. On top of that, each salon number costs about $1–1.15 a month plus a 10DLC campaign fee of $1.50–10 a month and about $20 one-time to register. Vietnamese text with accent marks splits into much shorter segments (estimate), so it costs more per message.

### Cited Findings
- Twilio US: $0.0083 per segment, in or out. Carrier fees per outbound segment: AT&T $0.0035, T-Mobile $0.0045, Verizon $0.005. So about 1.2–1.3¢ all-in. Phone number $1.15/mo. MMS $0.022. **[S, as of Oct–Nov 2026]** — [Getkanal](https://getkanal.com/blog/twilio-sms-pricing); [Textbee](https://textbee.dev/blog/twilio-pricing-real-cost-breakdown); [Famulor](https://www.famulor.io/blog/twilio-sms-pricing-2026-what-one-message-really-costs); [Twilio SMS pricing](https://www.twilio.com/en-us/sms/pricing)
- Twilio 10DLC: brand $4.50 one-time (sole proprietor or low-volume standard) or $46 (standard with secondary vetting). Campaign vetting $15 one-time. Monthly campaign fee $2 (sole proprietor), $1.50 (low-volume mixed) or $10 (standard). **[V, Twilio help center]** — [Twilio support](https://support.twilio.com/hc/en-us/articles/1260803965530)
- Telnyx US: $0.004 per outbound message part plus carrier fee (e.g. Verizon $0.0045). MMS $0.015 plus carrier fee. 10DLC brand $4.50, campaign review $15 (charged again on each resubmission), monthly campaign $1.50–10 by use case. **[V, Telnyx pages]** — [Telnyx US pricing](https://telnyx.com/pricing/messaging/us); [Telnyx 10DLC fees](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges)

### Inferences
- **[E]** Vietnamese text with accent marks probably forces Unicode (UCS-2) encoding: 70 characters per segment instead of 160. A Vietnamese reminder could be 2–3 segments. Customer texts are mostly English (customer-facing language), so keep reminders short and in English by default.
- **[E]** Volume for a mid salon: about 585 card tickets plus bookings → about 600–1,000 segments a month (confirm, remind, receipt). Cost on Telnyx: about 1,000 × $0.007 + $1 number + $1.50–10 campaign = about $10–18 a month. On Twilio about $15–24.
- **[E]** Suggested add-on: "Texting" $15/mo with 1,000 texts included, then 2¢ each. Or bundle 300 texts into the base plan for receipts and confirmations only. Telnyx gives better margin. The $10/mo standard campaign fee per salon is the biggest fixed cost, so try to register salons as low-volume mixed campaigns ($1.50) where they qualify.

### Gaps
- Twilio's per-segment rate wasn't confirmed on twilio.com itself (secondary sources only).
- Unconfirmed whether each salon needs its own brand and campaign, or whether we can register as an ISV with one campaign per salon. Check the Twilio/Telnyx ISV rules.

## 6. Recommendation and unit economics (small / mid / large)

### Takeaway
**[E]** Start at **$49/mo for one plan, all staff included**, with a pilot discount to $39 for the first 3 months after the free 30-day trial. Card fee: Stripe's list rate plus a **0.3% platform fee**, shown on every ticket. Move to one flat all-in rate (target 2.6% + 15¢ in person) once volume earns better Stripe pricing. Second plan "Plus" $79 (multi-location, payroll export, more texts). Texting add-on $15. No charge for extra devices.

### Cited Findings
(The inputs are cited in sections 1–5. This section is our model.)

### Inferences
**Recommended structure [E]:**
| Item | Price | Notes |
|---|---|---|
| Salon plan | $49/mo per location ($39 pilot price for 3 months; $490/yr after pilot) | All V1 features, unlimited staff, unlimited devices (it's a web app, so extra devices cost us about nothing) |
| Salon Plus | $79/mo | Payroll export (Gusto/QuickBooks), 1,000 texts included, priority support, multi-location view |
| Card fee: reader / Tap to Pay | Stripe 2.7% + 5¢ (+10¢ Tap to Pay) + 0.3% ours ≈ **3.0% + 5¢** | Shown on every ticket; same rate on tips |
| Card fee: QR / pay link | Stripe 2.9% + 30¢ + 0.3% ≈ **3.2% + 30¢** | Most expensive. Push salons to a reader |
| Texting add-on (Salon plan) | $15/mo, 1,000 texts, then 2¢ | Our cost about $10–18 (Telnyx) |
| Reader hardware | Sold at Stripe cost | No markup; price to be confirmed |

**Unit economics per salon per month [E]** (assumptions in section 3: $5k sales/tech, 70% card, +15% card tips, $55 ticket; Stripe list rates; "Stripe handles pricing", so Stripe fees are paid by the salon, not us):

| | Small (3 techs) | Mid (8 techs) | Large (15 techs) |
|---|---|---|---|
| Service sales | $15,000 | $40,000 | $75,000 |
| Card volume (incl. tips) | $12,075 | $32,200 | $60,375 |
| Card tickets | ~220 | ~585 | ~1,100 |
| Salon's Stripe cost, QR/link (2.9% + 30¢) | $416 | $1,109 | $2,080 |
| Salon's Stripe cost, reader (2.7% + 5¢) | $337 | $899 | $1,685 |
| For comparison: Square Free in person (2.6% + 15¢) | $347 | $925 | $1,734 |
| **Our revenue: subscription** | $49 | $49 | $49 (or $79 Plus) |
| **Our revenue: 0.3% platform fee** | $36 | $97 | $181 |
| **Our revenue: texting add-on** | $0–15 | $15 | $15 |
| **Total revenue to us** | **~$85–100** | **~$161** | **~$245–275** |
| Our direct costs (texting ~$12, hosting/support unknown) | ~$0–12 | ~$12 | ~$12–20 |
| **Gross margin before hosting/support** | **~$85** | **~$149** | **~$230–255** |

**Other option we looked at: we handle pricing and charge one all-in rate [E]** (Connect: we pay Stripe plus $2/mo plus 0.25% + 25¢ per payout, weekly payouts):
| | Small | Mid | Large |
|---|---|---|---|
| Margin charging 2.9% + 10¢ on reader | ~$2 | ~$10 | ~$22 |
| Margin charging 3.3% + 30¢ on QR | ~$15 | ~$45 | ~$88 |
At Stripe list rates this setup barely makes money. It only works with negotiated pricing (IC+ or volume discount). Revisit at about 50 salons (≈ $1.6M/mo card volume at mid size; volume threshold for Stripe discounts unknown).

**Key points for the decision [E]:**
1. The **$39–49 price holds up**: matches Square Plus ($49) and GlossGenius mid ($48), well under nail-specific systems ($195–349).
2. A **0.3% platform fee** adds about 40–75% on top of the subscription at mid and large salons, and keeps us in line with Square once a reader is used (3.0% vs 2.6% plus Square's $49 Plus or software gaps). Still, a 0.3–0.4 point gap to Square in person is a sales objection. Consider 0.2% at launch, or no platform fee on tips, to say "cheaper than Square on tips".
3. **QR-only checkout costs salons about 20% more** than a reader. Make the reader part of onboarding, or bring Tap to Pay forward.
4. Never charge per tech, never charge for devices, and never skim tips. All of it fits the "fair, clear" pitch.
5. Turn surcharge / cash discount on per state only (blocked in CT, ME, MA; 2% cap in CO; check CA), credit cards only.

### Gaps
- Hosting (Vercel/Supabase) and support cost per salon not modelled. See the Running costs doc.
- Card share, average ticket and tech productivity are guesses; replace them with pilot data.
- Stripe custom pricing threshold and terms are unknown; ask Stripe sales.
- Live check of stripe.com/pricing, squareup.com/pricing and clover.com/pricing is still needed (blocked in this session).
