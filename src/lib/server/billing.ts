// Server-only: the salon's PolishOS subscription on OUR platform Stripe account (Stripe Billing).
// Stripe is the truth. sync() copies the salon's subscription + card into salon_billing and returns what the page shows.
// Prices are found by lookup key and made once if missing, so a new Stripe account (live) needs no setup by hand.
import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Cycle = "monthly" | "yearly";
export const LOOKUP: Record<Cycle, string> = { monthly: "polishos_salon_monthly", yearly: "polishos_salon_yearly" };
const AMOUNT: Record<Cycle, number> = { monthly: 4900, yearly: 46800 }; // cents per interval (yearly = $39 × 12)
const INTERVAL: Record<Cycle, "month" | "year"> = { monthly: "month", yearly: "year" };
export const TRIAL_DAYS = 30;

export type BillingView = {
  on: true; test: boolean;
  status: string; cycle: Cycle | null; periodEnd: string | null; trialEnd: string | null; cancelAtPeriodEnd: boolean;
  card: { brand: string; last4: string; exp: string } | null;
  invoices: { id: string; date: string; cents: number; status: string; url: string | null }[];
  prices: Record<Cycle, number>; // cents per month shown on the cards
  hadPlan: boolean;
};

const LIVE = new Set(["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]);
export const isLive = (status: string) => LIVE.has(status);

/** Monthly + yearly prices (made on first use). */
export async function prices(st: Stripe): Promise<Record<Cycle, Stripe.Price>> {
  const list = await st.prices.list({ lookup_keys: Object.values(LOOKUP), active: true, expand: ["data.product"] });
  const found = (c: Cycle) => list.data.find((p) => p.lookup_key === LOOKUP[c]);
  let product = (found("monthly") ?? found("yearly"))?.product as Stripe.Product | undefined;
  const out = {} as Record<Cycle, Stripe.Price>;
  for (const c of ["monthly", "yearly"] as const) {
    let p = found(c);
    if (!p) {
      product ??= await st.products.create({ name: "PolishOS Salon", description: "All staff included. Checkout, payouts, booking, clients, numbers.", metadata: { app: "polishos" } });
      p = await st.prices.create({ product: product.id, currency: "usd", unit_amount: AMOUNT[c], recurring: { interval: INTERVAL[c] }, lookup_key: LOOKUP[c], transfer_lookup_key: true, nickname: `Salon ${c}` });
    }
    out[c] = p;
  }
  return out;
}
const cycleOf = (price: Stripe.Price | null | undefined): Cycle | null =>
  price?.lookup_key === LOOKUP.yearly || price?.recurring?.interval === "year" ? "yearly" : price ? "monthly" : null;

/** Customer portal settings (card, invoices, cancel at period end, switch monthly ↔ yearly); made once. */
export async function portalConfig(st: Stripe, p: Record<Cycle, Stripe.Price>): Promise<string> {
  const mine = (await st.billingPortal.configurations.list({ active: true, limit: 20 })).data.find((c) => c.metadata?.app === "polishos");
  if (mine) return mine.id;
  const product = typeof p.monthly.product === "string" ? p.monthly.product : p.monthly.product.id;
  const c = await st.billingPortal.configurations.create({
    metadata: { app: "polishos" },
    business_profile: { headline: "PolishOS: your salon plan" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name"] },
      subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] } },
      subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products: [{ product, prices: [p.monthly.id, p.yearly.id] }] },
    },
  });
  return c.id;
}

type Row = { salon_id: string; customer_id: string | null; subscription_id: string | null; status: string };

/** The salon's Stripe customer on our account (made once). */
export async function customerFor(db: SupabaseClient, st: Stripe, salonId: string): Promise<string> {
  const { data: row } = await db.from("salon_billing").select("customer_id").eq("salon_id", salonId).maybeSingle<{ customer_id: string | null }>();
  if (row?.customer_id) return row.customer_id;
  const { data: s } = await db.from("salons").select("name,phone").eq("id", salonId).single<{ name: string; phone: string | null }>();
  const c = await st.customers.create({ name: s?.name ?? undefined, phone: s?.phone ?? undefined, metadata: { salon_id: salonId } }, { idempotencyKey: `polishos-customer-${salonId}` });
  await db.from("salon_billing").upsert({ salon_id: salonId, customer_id: c.id, updated_at: new Date().toISOString() });
  return c.id;
}

const iso = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString() : null);
function cardOf(pm: string | Stripe.PaymentMethod | null | undefined) {
  if (!pm || typeof pm === "string" || !pm.card) return null;
  return { brand: pm.card.brand, last4: pm.card.last4, exp: `${String(pm.card.exp_month).padStart(2, "0")}/${pm.card.exp_year}` };
}

/** The salon's one subscription that matters: a live one first, else the newest. */
export async function currentSub(st: Stripe, customer: string): Promise<Stripe.Subscription | null> {
  const subs = (await st.subscriptions.list({ customer, status: "all", limit: 10, expand: ["data.default_payment_method"] })).data;
  return subs.find((s) => isLive(s.status)) ?? subs[0] ?? null;
}

/** Read Stripe, save the copy, return the page's view. */
export async function sync(db: SupabaseClient, st: Stripe, salonId: string, test: boolean): Promise<BillingView> {
  const p = await prices(st);
  const base: BillingView = { on: true, test, status: "none", cycle: null, periodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, card: null, invoices: [], prices: { monthly: p.monthly.unit_amount ?? AMOUNT.monthly, yearly: Math.round((p.yearly.unit_amount ?? AMOUNT.yearly) / 12) }, hadPlan: false };
  const { data: row } = await db.from("salon_billing").select("salon_id,customer_id,subscription_id,status").eq("salon_id", salonId).maybeSingle<Row>();
  if (!row?.customer_id) return base;

  const [sub, cust, inv] = await Promise.all([
    currentSub(st, row.customer_id),
    st.customers.retrieve(row.customer_id, { expand: ["invoice_settings.default_payment_method"] }),
    st.invoices.list({ customer: row.customer_id, limit: 6 }),
  ]);
  const item = sub?.items.data[0];
  const card = cardOf(sub?.default_payment_method) ?? ("deleted" in cust ? null : cardOf(cust.invoice_settings?.default_payment_method));
  const view: BillingView = {
    ...base,
    status: sub?.status ?? "none",
    cycle: cycleOf(item?.price),
    periodEnd: iso(item?.current_period_end),
    trialEnd: iso(sub?.trial_end),
    cancelAtPeriodEnd: !!sub && (sub.cancel_at_period_end || !!sub.cancel_at),
    card,
    invoices: inv.data.filter((i) => i.status !== "draft").map((i) => ({ id: i.id ?? "", date: iso(i.created)!, cents: i.status === "paid" ? i.amount_paid : i.amount_due, status: i.status ?? "open", url: i.hosted_invoice_url ?? null })),
    hadPlan: !!sub,
  };
  await db.from("salon_billing").upsert({
    salon_id: salonId, customer_id: row.customer_id, subscription_id: sub?.id ?? null, status: view.status, cycle: view.cycle,
    current_period_end: view.periodEnd, trial_end: view.trialEnd, cancel_at_period_end: view.cancelAtPeriodEnd,
    card_brand: card?.brand ?? null, card_last4: card?.last4 ?? null, card_exp: card?.exp ?? null, updated_at: new Date().toISOString(),
  });
  return view;
}

/** Which salon a Stripe customer belongs to (webhook). */
export async function salonOfCustomer(db: SupabaseClient, customer: string | null | undefined): Promise<string | null> {
  if (!customer) return null;
  const { data } = await db.from("salon_billing").select("salon_id").eq("customer_id", customer).maybeSingle<{ salon_id: string }>();
  return data?.salon_id ?? null;
}
