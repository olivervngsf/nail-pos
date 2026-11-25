// Server-only helpers for card payments: Stripe client, Supabase as the signed-in user / as the server,
// and settle() — the one place a card payment becomes a paid ticket (called by status checks and the webhook).
import "server-only";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { asSplit, firstName, techTotals, tipShares, type PayLine } from "@/lib/checkout/paypage";
import { addressOk, parseAddress } from "@/lib/stripe/address";

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

type PayRequest = { id: string; salon_id: string; ticket_id: string; method: "card_reader" | "pay_link"; amount_cents: number; payment_intent: string | null; checkout_session: string | null; reader_id: string | null; status: string; error: string | null; tip_split?: string | null };

/** The services on a ticket (name, tech first name, price) in ticket order, and each tech's service total.
 *  Used by the client pay page (what it shows) and by settle() (who gets the tip), so both always agree. */
export async function ticketWork(db: SupabaseClient, ticketId: string): Promise<{ lines: PayLine[]; techs: { key: string; name: string; cents: number }[] }> {
  const { data, error } = await db.from("ticket_lines").select("name,staff_id,amount_cents,sort,staff:memberships(display_name)")
    .eq("ticket_id", ticketId).eq("kind", "service").is("removed_at", null).order("sort").order("id");
  if (error) throw new Error(error.message); // never guess who gets a tip
  type L = { name: string; staff_id: string | null; amount_cents: number; staff: { display_name: string } | null };
  const rows = ((data ?? []) as unknown as L[]).map((l) => ({ key: l.staff_id, name: firstName(l.staff?.display_name), label: l.name, cents: Number(l.amount_cents) }));
  return { lines: rows.map((r) => ({ name: r.label, tech: r.name || null, cents: r.cents })), techs: techTotals(rows) };
}

/** Look at Stripe for this pay request; when paid, record it (safe to call many times). Returns the pay request status.
 *  A try that was cancelled or failed is still checked: if the card went through anyway, settle_card records it as
 *  'extra' (flagged to refund) so money is never taken without a record. */
export async function settle(prId: string, seenIntent?: string | null): Promise<{ status: string; error?: string | null }> {
  const db = asServer(), st = getStripe();
  if (!db || !st) throw new Error("Payments aren't switched on yet.");
  const { data: pr } = await db.from("pay_requests").select("*").eq("id", prId).single<PayRequest>();
  if (!pr) throw new Error("No such payment.");
  const pending = pr.status === "pending";
  // A payment Stripe told us about (webhook) that isn't the one on file, e.g. an older pay page the client still had open:
  // look at that one, so it's recorded (settle_card flags it 'extra' to refund if the ticket doesn't need it).
  const other = seenIntent && seenIntent !== pr.payment_intent ? seenIntent : null;
  if (!other && (pr.status === "paid" || (!pending && !pr.payment_intent && !pr.checkout_session))) return { status: pr.status, error: pr.error };
  const { data: acct } = await db.from("stripe_accounts").select("account_id").eq("salon_id", pr.salon_id).single();
  if (!acct) throw new Error("Salon has no Stripe account.");
  const opts = { stripeAccount: acct.account_id as string };
  const still = { status: pr.status, error: pr.error };

  let piId = other ?? pr.payment_intent;
  if (!piId && pr.checkout_session) {
    const cs = await st.checkout.sessions.retrieve(pr.checkout_session, {}, opts);
    if (cs.payment_status !== "paid" || !cs.payment_intent) return still;
    piId = typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent.id;
  }
  if (!piId) return still;

  const pi = await st.paymentIntents.retrieve(piId, { expand: ["latest_charge.balance_transaction"] }, opts);
  if (other && pi.metadata?.pay_request !== pr.id) return still; // not this try's money
  if (pr.method === "card_reader" && pi.status !== "succeeded") {
    // Reader declined / cancelled: tell the desk.
    if (pending && pr.reader_id) {
      const rd = await st.terminal.readers.retrieve(pr.reader_id, {}, opts);
      const act = "action" in rd ? rd.action : null;
      if (act?.status === "failed") {
        await db.from("pay_requests").update({ status: "failed", error: act.failure_message ?? "Card declined", updated_at: new Date().toISOString() }).eq("id", pr.id);
        return { status: "failed", error: act.failure_message ?? "Card declined" };
      }
    }
    return still;
  }
  if (pi.status !== "succeeded") return still;

  const charge = pi.latest_charge as Stripe.Charge | null;
  const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  const card = charge?.payment_method_details?.card_present ?? charge?.payment_method_details?.card;
  // Tip: picked on the Wi-Fi reader's own screen (Stripe reports it), else picked on our screen and already in the
  // amount (pay link, or the handheld's small reader = card_reader with no reader_id): the part above the ticket.
  const over = Math.max(0, pi.amount_received - pr.amount_cents);
  const tip = pr.method === "card_reader" && pr.reader_id ? (pi.amount_details?.tip?.amount ?? over) : over;

  // One tip shared across the techs on this ticket: by service price (default), or evenly when the client picked
  // that on the Quick pay page. Same rule the pay page showed them (tipShares).
  const { techs } = await ticketWork(db, pr.ticket_id);
  const staff = techs.map((t) => t.key);
  const parts = tipShares(tip, techs.map((t) => t.cents), asSplit(pr.tip_split));
  // No tech on the ticket (e.g. only a gift card sold) but the client tipped on the reader: keep the tip on the ticket
  // with no name, so the ticket total still equals the money taken.
  const tips: { staffId: string | null; cents: number }[] = staff.length ? staff.map((s, i) => ({ staffId: s, cents: parts[i] ?? 0 })) : tip > 0 ? [{ staffId: null, cents: tip }] : [];

  const { data, error } = await db.rpc("settle_card", { p: {
    payRequestId: pr.id, paymentIntent: pi.id, amountCents: pi.amount_received, tipCents: tip, feeCents: bt?.fee ?? 0,
    brand: card?.brand ?? null, last4: card?.last4 ?? null, at: new Date((charge?.created ?? pi.created) * 1000).toISOString(), tips,
  } });
  if (error) throw new Error(error.message);
  if ((data as { extra?: boolean } | null)?.extra) return { status: pr.status === "pending" ? "canceled" : pr.status, error: "Card paid after this try stopped. Refund it." };
  return { status: "paid" };
}

/** Stop a card try in Stripe (reader cleared, payment cancelled, pay page expired), then mark it cancelled.
 *  Checks Stripe first: if the client already paid, that payment is recorded instead. Returns the final status. */
export async function stopTry(prId: string, why = "canceled by desk"): Promise<string> {
  const db = asServer(), st = getStripe();
  if (!db || !st) throw new Error("Payments aren't switched on yet.");
  const first = await settle(prId);
  if (first.status !== "pending") return first.status;
  const { data: pr } = await db.from("pay_requests").select("*").eq("id", prId).single<PayRequest>();
  if (!pr) return "canceled";
  const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", pr.salon_id).single();
  if (a) {
    const opts = { stripeAccount: a.account_id as string };
    if (pr.reader_id) await st.terminal.readers.cancelAction(pr.reader_id, {}, opts).catch(() => null);
    if (pr.payment_intent) await st.paymentIntents.cancel(pr.payment_intent, {}, opts).catch(() => null);
    if (pr.checkout_session) await st.checkout.sessions.expire(pr.checkout_session, {}, opts).catch(() => null);
  }
  // Paid in the gap? Record it rather than cancel.
  const again = await settle(prId);
  if (again.status !== "pending") return again.status;
  await db.from("pay_requests").update({ status: "canceled", error: why, updated_at: new Date().toISOString() }).eq("id", prId).eq("status", "pending");
  return "canceled";
}

/** Can this signed-in person (or salon device) take cards for this salon? Desk roles only: owner, manager, front desk. */
export async function isDeskOf(sb: SupabaseClient, salonId: string): Promise<boolean> {
  const { data } = await sb.rpc("my_memberships");
  return ((data ?? []) as { salon_id: string; role: string }[])
    .some((m) => m.salon_id === salonId && ["owner", "manager", "front_desk"].includes(m.role));
}

/** Make sure the salon has a Stripe Terminal location (with on-reader tips 15/20/25%). */
export async function ensureLocation(salonId: string): Promise<{ accountId: string; locationId: string }> {
  const db = asServer(), st = getStripe();
  if (!db || !st) throw new Error("Payments aren't switched on yet.");
  const { data: a } = await db.from("stripe_accounts").select("account_id,location_id").eq("salon_id", salonId).single();
  if (!a) throw new Error("Connect Stripe first.");
  if (a.location_id) return { accountId: a.account_id, locationId: a.location_id };
  const opts = { stripeAccount: a.account_id as string };
  const { data: s } = await db.from("salons").select("name,state,address").eq("id", salonId).single();
  const config = await st.terminal.configurations.create({ tipping: { usd: { percentages: [15, 20, 25] } } }, opts);
  // The salon's real address (setup step 1). Stripe needs street + city + ZIP for a reader location.
  const address = parseAddress(s?.address, s?.state ?? "CA");
  if (!addressOk(address)) throw new Error("The salon's address needs street, city, state and ZIP (like: 1550 S Bascom Ave, Campbell, CA 95008) before a card reader can be used. The owner adds it in salon setup, step 1.");
  const loc = await st.terminal.locations.create({ display_name: s?.name ?? "Salon", configuration_overrides: config.id, address }, opts);
  await db.from("stripe_accounts").update({ location_id: loc.id, updated_at: new Date().toISOString() }).eq("salon_id", salonId);
  return { accountId: a.account_id, locationId: loc.id };
}
