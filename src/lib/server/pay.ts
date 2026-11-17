// Server-only helpers for card payments: Stripe client, Supabase as the signed-in user / as the server,
// and settle() — the one place a card payment becomes a paid ticket (called by status checks and the webhook).
import "server-only";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { splitCents } from "@/lib/money";

export const fail = (status: number, error: string) => Response.json({ error }, { status });

let stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}
export const testMode = () => (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
/** Supabase acting as the signed-in person (RLS + role checks apply). */
export async function asUser(req: Request): Promise<SupabaseClient | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const sb = createClient(URL(), key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data } = await sb.auth.getUser(token);
  return data.user ? sb : null;
}
/** Supabase as the server (Stripe-confirmed writes only). */
export function asServer(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createClient(URL(), key, { auth: { persistSession: false } });
}

export function originOf(req: Request) {
  const h = req.headers;
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

type PayRequest = { id: string; salon_id: string; ticket_id: string; method: "card_reader" | "pay_link"; amount_cents: number; payment_intent: string | null; checkout_session: string | null; reader_id: string | null; status: string; error: string | null };

/** Look at Stripe for this pay request; when paid, record it (safe to call many times). Returns the pay request status. */
export async function settle(prId: string): Promise<{ status: string; error?: string | null }> {
  const db = asServer(), st = getStripe();
  if (!db || !st) throw new Error("Payments aren't switched on yet.");
  const { data: pr } = await db.from("pay_requests").select("*").eq("id", prId).single<PayRequest>();
  if (!pr) throw new Error("No such payment.");
  if (pr.status !== "pending") return { status: pr.status, error: pr.error };
  const { data: acct } = await db.from("stripe_accounts").select("account_id").eq("salon_id", pr.salon_id).single();
  if (!acct) throw new Error("Salon has no Stripe account.");
  const opts = { stripeAccount: acct.account_id as string };

  let piId = pr.payment_intent;
  if (!piId && pr.checkout_session) {
    const cs = await st.checkout.sessions.retrieve(pr.checkout_session, {}, opts);
    if (cs.payment_status !== "paid" || !cs.payment_intent) return { status: "pending" };
    piId = typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent.id;
  }
  if (!piId) return { status: "pending" };

  const pi = await st.paymentIntents.retrieve(piId, { expand: ["latest_charge.balance_transaction"] }, opts);
  if (pr.method === "card_reader" && pi.status !== "succeeded") {
    // Reader declined / cancelled: tell the desk.
    if (pr.reader_id) {
      const rd = await st.terminal.readers.retrieve(pr.reader_id, {}, opts);
      const act = "action" in rd ? rd.action : null;
      if (act?.status === "failed") {
        await db.from("pay_requests").update({ status: "failed", error: act.failure_message ?? "Card declined", updated_at: new Date().toISOString() }).eq("id", pr.id);
        return { status: "failed", error: act.failure_message ?? "Card declined" };
      }
    }
    return { status: "pending" };
  }
  if (pi.status !== "succeeded") return { status: "pending" };

  const charge = pi.latest_charge as Stripe.Charge | null;
  const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  const card = charge?.payment_method_details?.card_present ?? charge?.payment_method_details?.card;
  const tip = pr.method === "card_reader" ? (pi.amount_details?.tip?.amount ?? Math.max(0, pi.amount_received - pr.amount_cents)) : Math.max(0, pi.amount_received - pr.amount_cents);

  // Tip split across the techs on this ticket by service price (owner default).
  const { data: lines } = await db.from("ticket_lines").select("staff_id,amount_cents").eq("ticket_id", pr.ticket_id).eq("kind", "service").is("removed_at", null);
  const byStaff = new Map<string, number>();
  for (const l of lines ?? []) if (l.staff_id) byStaff.set(l.staff_id, (byStaff.get(l.staff_id) ?? 0) + Number(l.amount_cents));
  const staff = [...byStaff.keys()];
  const parts = tip > 0 && staff.length ? splitCents(tip, staff.map((s) => byStaff.get(s) || 1)) : [];
  const tips = staff.map((s, i) => ({ staffId: s, cents: parts[i] ?? 0 }));

  const { error } = await db.rpc("settle_card", { p: {
    payRequestId: pr.id, paymentIntent: pi.id, amountCents: pi.amount_received, tipCents: tip, feeCents: bt?.fee ?? 0,
    brand: card?.brand ?? null, last4: card?.last4 ?? null, at: new Date((charge?.created ?? pi.created) * 1000).toISOString(), tips,
  } });
  if (error) throw new Error(error.message);
  return { status: "paid" };
}

/** Make sure the salon has a Stripe Terminal location (with on-reader tips 15/20/25%). */
export async function ensureLocation(salonId: string): Promise<{ accountId: string; locationId: string }> {
  const db = asServer(), st = getStripe();
  if (!db || !st) throw new Error("Payments aren't switched on yet.");
  const { data: a } = await db.from("stripe_accounts").select("account_id,location_id").eq("salon_id", salonId).single();
  if (!a) throw new Error("Connect Stripe first.");
  if (a.location_id) return { accountId: a.account_id, locationId: a.location_id };
  const opts = { stripeAccount: a.account_id as string };
  const { data: s } = await db.from("salons").select("name,state").eq("id", salonId).single();
  const config = await st.terminal.configurations.create({ tipping: { usd: { percentages: [15, 20, 25] } } }, opts);
  // TODO before pilot: use the salon's real street address (setup collects it as one line today).
  const loc = await st.terminal.locations.create({
    display_name: s?.name ?? "Salon", configuration_overrides: config.id,
    address: { line1: "1 Main St", city: "San Jose", state: s?.state ?? "CA", postal_code: "95112", country: "US" },
  }, opts);
  await db.from("stripe_accounts").update({ location_id: loc.id, updated_at: new Date().toISOString() }).eq("salon_id", salonId);
  return { accountId: a.account_id, locationId: loc.id };
}
