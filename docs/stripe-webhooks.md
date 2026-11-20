# Stripe webhooks (PolishOS)

How Stripe tells PolishOS that money moved, and how to set it up. Written Nov 19 after setting it up in the sandbox.
Share this page with anyone who sets up Stripe for PolishOS (sandbox or live).

## What is a webhook?
- Stripe calling our app. When a card payment goes through, Stripe sends a message to our site: "ticket #1013 was paid, $43".
- Without it, the app only finds out by asking Stripe "paid yet?", and it only asks while the desk has that ticket's pay screen open.
- So without a webhook: a client pays by link at home, or the desk closes the screen too early → Stripe has the money, the ticket still shows **open**.
- With it: the ticket is marked paid on its own, refunds made in the Stripe dashboard show up, card fees fill in.

## What is the signing secret, and why it goes in Vercel?
- Anyone on the internet can send a message to our webhook address. Stripe signs every real message with a secret only Stripe and our app know (`whsec_…`).
- Our app checks the signature: real Stripe message → act on it; fake or unsigned → refused. Nobody can fake "paid".
- Vercel is where the app runs, so the secret lives there as an environment variable. The app reads new variables only when it starts → **redeploy** after adding one.
- No secret in Vercel = the app refuses every message (answers `503 not configured`).
- Never paste a secret in chat, email, Slack, a doc or the code. Only in Vercel.

## We have two webhooks

| | Card payments (salons) | Plan + text credit (us) |
|---|---|---|
| Stripe "Events from" | **Connected accounts** (each salon's own Stripe account) | **Your account** (our platform account) |
| Endpoint URL | `https://polishosapp.com/api/stripe/webhook` | `https://polishosapp.com/api/billing/webhook` |
| Vercel variable | `STRIPE_WEBHOOK_SECRET` | `STRIPE_BILLING_WEBHOOK_SECRET` |
| Events | `payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.completed`, `charge.refunded`, `charge.updated`, `account.updated` | `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`, `payment_intent.succeeded`, `customer.updated`, `payment_method.attached` |
| Code | `src/app/api/stripe/webhook/route.ts` | `src/app/api/billing/webhook/route.ts` |
| Status (Nov 19) | **Working (sandbox).** Destination "PolishOS card payments", secret in Vercel Production. Tested: ticket #1014 on `lotus-5` paid by the webhook alone (no desk screen open) | **On (sandbox).** Made with Admin → System → Set up webhooks, Nov 20; secret kept by the app. Live mode: same button after the live key |

## The billing webhook, in plain words
- **Card payments webhook** = money a salon's clients pay **the salon** (services, tips), on each salon's own Stripe account. Working.
- **Billing webhook** = money a salon pays **PolishOS** (the $49/month plan, text credit top-ups), on **our** platform Stripe account. On in the sandbox since Nov 20 (one tap in Admin → System).
- What it does: a plan renews, a card fails or the owner cancels → the app knows right away ("Payment late" on the salon, Founder Admin alert); an owner buys text credit and closes the page mid-payment → the credit still gets added.
- Without it: the Billing page checks Stripe each time someone opens it and catches up then. Gaps: no "payment late" alert until someone opens Billing; a text credit purchase can be missed if the page closes mid-payment.
- Live mode: set it up before the first paying salon (same one tap after switching to the live key, or by hand with "Your account", `/api/billing/webhook`, `STRIPE_BILLING_WEBHOOK_SECRET`).

## Fastest way: one tap (Nov 20)
1. Open **polishosapp.com/admin/system** (Oliver or Elang; not a preview link).
2. The **Stripe webhooks** card shows both: On / Not made / Missing events / Secret unknown, and test vs live mode.
3. Tap **Set up webhooks**. The app uses its own Stripe key to make any missing webhook with all its events and keeps the signing secret itself (server-only table `platform_secrets`), so nothing goes into Vercel and no redeploy.
4. A webhook made by hand whose secret is already in Vercel (like "PolishOS card payments") is kept; the button only adds any missing events.
5. Both rows should say **On**. Then do step D below to check.
6. Going live: switch Vercel to the live key, redeploy, tap the same button again.

## Steps by hand (≈10 min each)

### A. Stripe: make the destination
1. Stripe dashboard → pick the right account at top left (sandbox = **lotus-test sandbox**; live = our live account).
2. **Developers** (bottom left) → **Webhooks** → **+ Add destination**.
3. **Events from**: see table (Connected accounts for card payments, Your account for billing).
4. **Payload style**: **Snapshot**. **API version**: leave the default.
5. Events: **All events** tab → search and tick each event in the table. Don't tick the "Subscriptions" bundle for the card payments one. Check "Selected events" count.
6. Continue → destination type **Webhook endpoint** → Continue.
7. Name (e.g. "PolishOS card payments"), **Endpoint URL** from the table → **Create destination**. It shows **Active**.

### B. Copy the signing secret
1. On the destination page, **Signing secret** → **eye icon** → copy the whole `whsec_…`.
2. Don't press the round-arrow icon next to it: that makes a new secret and the old one stops working.

### C. Vercel: add it and restart
1. Vercel → **nail-pos** → **Settings** → **Environment Variables** → **Add New**.
2. Key from the table (exact spelling), value = `whsec_…`, environment **Production**, **Sensitive** on → **Save**.
3. **Deployments** → top Production deployment → **⋯** → **Redeploy** → wait for **Ready** (~1 min).

### D. Check it works
1. Make a sandbox card payment on salon `lotus-5` (or ask Claude to run one), and close the pay screen before it finishes.
2. Stripe → the destination → **Event deliveries**: new events, **Failed 0**, response **200**.
3. In the app the ticket shows **Paid** without the desk screen open.
4. Opening the webhook URL in a browser shows **HTTP ERROR 405**: that's normal (browsers "GET", Stripe "POSTs"). It does not tell you if the webhook works; step 2 does.

## When something is off
- Stripe shows deliveries **failed with 503** → secret missing in Vercel, or no redeploy after adding it.
- **Failed with 400 "bad signature"** → wrong secret (copied from the other destination, cut short, or rolled). Copy again, update Vercel, redeploy.
- **No deliveries at all** → wrong "Events from" (card payments must be Connected accounts), wrong URL, or events not ticked.
- Secret leaked → Stripe destination → round-arrow (roll) → put the new one in Vercel → redeploy.

## Going live (real money)
- Live mode is a separate world: redo A–D in the **live** Stripe account with the live keys. Sandbox destinations and secrets don't carry over.
- Same URLs; Vercel Production gets the live `STRIPE_SECRET_KEY` + live `STRIPE_WEBHOOK_SECRET` (+ `STRIPE_BILLING_WEBHOOK_SECRET`). Preview deployments keep the sandbox ones.
- Accounts v2 note: `account.updated` for salon accounts may only arrive at a "Your account" destination. It only refreshes a salon's "Stripe ready" flags, which Settings → Payments also refreshes when opened, so payments don't depend on it.

Also see: `docs/go-live-plan.md` § 5 Payments live.
