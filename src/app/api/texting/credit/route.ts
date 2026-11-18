// Text credit paid by card (Stripe, our platform account). One route, one action per call:
//   add {cents, back, requestId}  owner: charge the plan's saved card now → credit; no card / card needs a check → Stripe Checkout (saves the card)
//   confirm {sessionId}           owner/manager: back from Checkout → credit once (the webhook does the same)
//   auto                          owner/manager: after a promo send — if auto add is on, credit is below the warn line and the
//                                 month cap allows it, charge the saved card for the auto-add amount (once per spend row)
import type Stripe from "stripe";
import { asServer, asUser, fail, getStripe, originOf } from "@/lib/server/pay";
import { customerFor } from "@/lib/server/billing";
import { chargeSaved, creditFromIntent, MAX_CENTS, MIN_CENTS, savedCard } from "@/lib/server/textcredit";

export const runtime = "nodejs";

type Body = { salonId?: string; action?: "add" | "confirm" | "auto"; cents?: number; back?: string; requestId?: string; sessionId?: string };
const BACK = new Set(["/settings/texting", "/settings/billing"]);
const cardErr = (e: unknown) => (e as Stripe.errors.StripeError)?.type === "StripeCardError" || (e as { code?: string })?.code === "authentication_required";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { salonId, action = "add", cents, back, requestId, sessionId } = (await req.json().catch(() => ({}))) as Body;
  if (!salonId) return fail(400, "Missing salon.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return Response.json({ on: false });
  const { data: admin } = await sb.rpc("is_admin", { s: salonId });
  if (!admin) return fail(403, "Only the owner or a manager can see text credit.");
  const { data: personId } = await sb.rpc("my_person_id");

  try {
    if (action === "add") {
      const { data: owner } = await sb.rpc("is_owner", { s: salonId });
      if (!owner) return fail(403, "Only the owner can add text credit.");
      if (!Number.isInteger(cents) || cents! < MIN_CENTS || cents! > MAX_CENTS) return fail(400, "Credit must be $5 to $500.");
      if (!requestId || requestId.length < 8) return fail(400, "Missing request id.");
      const customer = await customerFor(db, st, salonId);
      const card = await savedCard(st, customer);
      if (card) {
        try {
          const pi = await chargeSaved(st, { customer, card, salonId, cents: cents!, personId: personId ?? null, auto: false, key: `credit-${salonId}-${requestId}` });
          if (pi.status === "succeeded") return Response.json({ paid: true, balanceCents: await creditFromIntent(db, st, pi), card: `${card.brand} ••${card.last4}` });
        } catch (e) {
          if (!cardErr(e)) throw e; // declined or needs a check: let the owner pay on Stripe's page instead
        }
      }
      const page = `${originOf(req)}${BACK.has(back ?? "") ? back : "/settings/texting"}`;
      const cs = await st.checkout.sessions.create({
        mode: "payment",
        customer,
        client_reference_id: salonId,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents!, product_data: { name: "PolishOS text credit", description: `${Math.floor(cents! / 2)} promo texts at 2¢` } } }],
        payment_intent_data: { setup_future_usage: "off_session", description: "PolishOS text credit", metadata: { kind: "text_credit", salon_id: salonId, person_id: personId ?? "", auto: "0" } },
        metadata: { kind: "text_credit", salon_id: salonId },
        success_url: `${page}?credit_session={CHECKOUT_SESSION_ID}`,
        cancel_url: page,
      }, { idempotencyKey: `credit-cs-${salonId}-${requestId}` });
      return Response.json({ url: cs.url });
    }

    if (action === "confirm") {
      if (!sessionId?.startsWith("cs_")) return fail(400, "Missing payment.");
      const cs = await st.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
      if (cs.metadata?.salon_id !== salonId || cs.metadata?.kind !== "text_credit") return fail(404, "Not this salon's payment.");
      const pi = cs.payment_intent as Stripe.PaymentIntent | null;
      if (cs.payment_status !== "paid" || !pi) return Response.json({ paid: false });
      // Keep this card for next time (one tap + auto add), unless the salon already has one.
      if (pi.payment_method && cs.customer) {
        const cust = await st.customers.retrieve(cs.customer as string);
        if (!("deleted" in cust && cust.deleted) && !(cust as Stripe.Customer).invoice_settings?.default_payment_method) {
          await st.customers.update(cs.customer as string, { invoice_settings: { default_payment_method: pi.payment_method as string } }).catch(() => null);
        }
      }
      return Response.json({ paid: true, balanceCents: await creditFromIntent(db, st, pi) });
    }

    if (action === "auto") {
      const { data: s } = await db.from("text_credit_settings").select("warn_pct,auto_add_on,auto_add_cents,auto_add_max_cents").eq("salon_id", salonId).maybeSingle();
      if (!s?.auto_add_on) return Response.json({ auto: "off" });
      const { data: bal } = await db.rpc("_text_credit_balance", { p_salon: salonId });
      if (Number(bal) * 100 >= s.warn_pct * s.auto_add_cents) return Response.json({ auto: "not_low" });
      const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
      const { data: autos } = await db.from("text_credit_ledger").select("cents").eq("salon_id", salonId).eq("kind", "add").like("label", "Auto add%").gte("at", month.toISOString());
      const used = (autos ?? []).reduce((n, r) => n + Number(r.cents), 0);
      if (used + s.auto_add_cents > s.auto_add_max_cents) return Response.json({ auto: "cap" });
      const { data: last } = await db.from("text_credit_ledger").select("id").eq("salon_id", salonId).order("id", { ascending: false }).limit(1).maybeSingle();
      const customer = await customerFor(db, st, salonId);
      const card = await savedCard(st, customer);
      if (!card) return Response.json({ auto: "no_card" });
      try {
        const pi = await chargeSaved(st, { customer, card, salonId, cents: s.auto_add_cents, personId: null, auto: true, key: `credit-auto-${salonId}-${last?.id ?? 0}` });
        return Response.json({ auto: pi.status === "succeeded" ? "added" : "pending", balanceCents: await creditFromIntent(db, st, pi) });
      } catch (e) {
        if (cardErr(e)) return Response.json({ auto: "declined" });
        throw e;
      }
    }
    return fail(400, "Unknown action.");
  } catch (e) {
    return fail(502, (e as { message?: string }).message ?? "Stripe didn't answer. Try again.");
  }
}
