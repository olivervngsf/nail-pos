// Server-only: text credit paid by card on OUR platform Stripe account (same customer + card as the salon plan).
// Credit is added only after Stripe says the payment succeeded, once per payment (ledger client_id 'stripe:<pi>').
import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_CENTS = 500, MAX_CENTS = 50000;

export type SavedCard = { id: string; brand: string; last4: string };

/** The card the salon pays its plan with (customer default, else the live subscription's). */
export async function savedCard(st: Stripe, customer: string): Promise<SavedCard | null> {
  const c = await st.customers.retrieve(customer, { expand: ["invoice_settings.default_payment_method"] });
  if ("deleted" in c && c.deleted) return null;
  let pm = (c as Stripe.Customer).invoice_settings?.default_payment_method as Stripe.PaymentMethod | string | null;
  if (!pm || typeof pm === "string") {
    const subs = await st.subscriptions.list({ customer, status: "all", limit: 5, expand: ["data.default_payment_method"] });
    const s = subs.data.find((x) => x.default_payment_method && typeof x.default_payment_method !== "string");
    pm = (s?.default_payment_method as Stripe.PaymentMethod | undefined) ?? null;
  }
  if (!pm || typeof pm === "string" || !pm.card) return null;
  return { id: pm.id, brand: pm.card.brand, last4: pm.card.last4 };
}

const label = (auto: boolean, brand?: string, last4?: string) =>
  `${auto ? "Auto add" : "Added credit"}${last4 ? ` · ${brand ? brand[0].toUpperCase() + brand.slice(1) : "Card"} ••${last4}` : ""}`;

/** A succeeded text-credit payment → credit (safe to call many times). Returns the new balance or null if not ours/paid. */
export async function creditFromIntent(db: SupabaseClient, st: Stripe, pi: Stripe.PaymentIntent): Promise<number | null> {
  const m = pi.metadata ?? {};
  if (m.kind !== "text_credit" || !m.salon_id || pi.status !== "succeeded") return null;
  const cents = pi.amount_received || pi.amount;
  let brand: string | undefined, last4: string | undefined;
  if (pi.payment_method) {
    const pm = typeof pi.payment_method === "string" ? await st.paymentMethods.retrieve(pi.payment_method).catch(() => null) : pi.payment_method;
    brand = pm?.card?.brand; last4 = pm?.card?.last4;
  }
  const { data, error } = await db.rpc("_text_credit_paid", {
    p_salon: m.salon_id, p_cents: cents, p_ref: `stripe:${pi.id}`, p_person: m.person_id || null, p_label: label(m.auto === "1", brand, last4),
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

/** Charge the saved card now (owner tap or auto add). Throws Stripe's card error (declined, needs 3-D Secure…). */
export async function chargeSaved(st: Stripe, p: { customer: string; card: SavedCard; salonId: string; cents: number; personId: string | null; auto: boolean; key: string }) {
  return st.paymentIntents.create({
    amount: p.cents, currency: "usd", customer: p.customer, payment_method: p.card.id,
    off_session: true, confirm: true,
    description: p.auto ? "PolishOS text credit (auto add)" : "PolishOS text credit",
    metadata: { kind: "text_credit", salon_id: p.salonId, person_id: p.personId ?? "", auto: p.auto ? "1" : "0" },
  }, { idempotencyKey: p.key });
}
