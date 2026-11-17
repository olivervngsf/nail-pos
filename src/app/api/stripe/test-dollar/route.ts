// Setup step 9: charge $1 on the salon's reader with the owner's own card, then refund it right away.
// Proves reader + Stripe + bank link work. Not a ticket; logged in audit_log. POST = start, GET = check.
import { asServer, asUser, fail, getStripe, testMode } from "@/lib/server/pay";

export const runtime = "nodejs";

async function ready(req: Request, salonId: string) {
  const st = getStripe(), db = asServer(), me = await asUser(req);
  if (!st || !db) return fail(503, "Card payments aren't switched on yet.");
  if (!me) return fail(401, "Sign in first.");
  const { data: ok } = await me.rpc("is_admin", { s: salonId });
  if (!ok) return fail(403, "Only the owner or a manager can do this.");
  const { data: a } = await db.from("stripe_accounts").select("account_id,charges_enabled").eq("salon_id", salonId).maybeSingle();
  if (!a?.charges_enabled) return fail(409, "Connect payments first (step 4).");
  return { st, db, opts: { stripeAccount: a.account_id as string } };
}

export async function POST(req: Request) {
  const { salonId = "" } = (await req.json().catch(() => ({}))) as { salonId?: string };
  const c = await ready(req, salonId);
  if (c instanceof Response) return c;
  const { data: r } = await c.db.from("card_readers").select("id,simulated").eq("salon_id", salonId).is("archived_at", null).order("created_at").limit(1).maybeSingle();
  if (!r) return fail(409, "Connect the card reader first (step 5).");
  try {
    const pi = await c.st.paymentIntents.create({ amount: 100, currency: "usd", allowed_payment_method_types: ["card_present"], description: "Setup test · refunded", metadata: { salon_id: salonId, setup_test: "1" } }, c.opts);
    await c.st.terminal.readers.processPaymentIntent(r.id, { payment_intent: pi.id }, c.opts);
    if (r.simulated && testMode()) await c.st.testHelpers.terminal.readers.presentPaymentMethod(r.id, { type: "card_present" }, c.opts);
    return Response.json({ intent: pi.id });
  } catch (e) {
    const m = (e as Error).message;
    return fail(502, /offline|unreachable/i.test(m) ? "The reader is offline. Check it's on and on Wi-Fi." : /busy/i.test(m) ? "The reader is busy. Finish or cancel on the reader, then try again." : "Stripe didn't answer. Try again.");
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const salonId = q.get("salonId") ?? "", intent = q.get("intent") ?? "";
  const c = await ready(req, salonId);
  if (c instanceof Response) return c;
  const pi = await c.st.paymentIntents.retrieve(intent, { expand: ["latest_charge.balance_transaction"] }, c.opts);
  if (pi.metadata.salon_id !== salonId || pi.metadata.setup_test !== "1") return fail(404, "Not found.");
  if (pi.status !== "succeeded") return Response.json({ status: pi.last_payment_error ? "failed" : "pending", error: pi.last_payment_error?.message });
  await c.st.refunds.create({ payment_intent: pi.id }, { ...c.opts, idempotencyKey: `setup-refund-${pi.id}` });
  const ch = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const fee = ch && typeof ch.balance_transaction === "object" && ch.balance_transaction ? ch.balance_transaction.fee : null;
  const card = ch?.payment_method_details?.card_present;
  await c.db.from("audit_log").insert({ salon_id: salonId, action: "setup.test_dollar", detail: { intent: pi.id, fee_cents: fee } });
  return Response.json({ status: "done", feeCents: fee, brand: card?.brand ?? null, last4: card?.last4 ?? null });
}
