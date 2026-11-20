// Stripe tells us what happened on salon accounts (Connect webhook). Every event is saved once (by event id),
// then: payment succeeded → ticket paid; account updated → ready flags. Safe to receive twice.
import type Stripe from "stripe";
import { verifyEvent } from "@/lib/server/webhooks";
import { asServer, getStripe, settle } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const st = getStripe(), db = asServer();
  if (!st || !db) return new Response("not configured", { status: 503 });
  // Signed with the Vercel env secret or the one Admin → System saved when it made this webhook.
  const ev = await verifyEvent(st, db, "payments", await req.text(), req.headers.get("stripe-signature") ?? "");
  if (!ev) return new Response("bad signature", { status: 400 });
  const obj = ev.data.object as { metadata?: Record<string, string> };
  const meta = obj.metadata ?? {};
  const { error: dup } = await db.from("stripe_events").insert({ id: ev.id, salon_id: meta.salon_id ?? null, ticket_id: meta.ticket_id ?? null, type: ev.type, payload: ev });
  if (dup && dup.code !== "23505") return new Response(dup.message, { status: 500 });

  if ((ev.type === "payment_intent.succeeded" || ev.type === "payment_intent.payment_failed") && meta.pay_request) {
    await settle(meta.pay_request, (ev.data.object as Stripe.PaymentIntent).id);
  } else if (ev.type === "checkout.session.completed" && meta.pay_request) {
    const cs = ev.data.object as Stripe.Checkout.Session;
    await settle(meta.pay_request, typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent?.id);
  } else if (ev.type === "charge.refunded") {
    // Refund made in the Stripe dashboard (or ours, seen again): record it once, full or part.
    const ch = ev.data.object as Stripe.Charge;
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    const last = ch.refunds?.data?.[0]?.id ?? `${ch.id}-${ch.amount_refunded}`;
    if (pi) await db.rpc("stripe_refund_seen", { p_intent: pi, p_refund: last, p_refunded: ch.amount_refunded });
  } else if (ev.type === "charge.updated") {
    // Card fee wasn't ready when the payment was saved: fill it in now.
    const ch = ev.data.object as Stripe.Charge;
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (pi && typeof ch.balance_transaction === "string" && ev.account) {
      const bt = await st.balanceTransactions.retrieve(ch.balance_transaction, {}, { stripeAccount: ev.account });
      await db.rpc("stripe_set_fee", { p_intent: pi, p_fee: bt.fee });
    }
  } else if (ev.type === "account.updated") {
    const a = ev.data.object as Stripe.Account;
    await db.from("stripe_accounts").update({ charges_enabled: !!a.charges_enabled, payouts_enabled: !!a.payouts_enabled, details_submitted: !!a.details_submitted, updated_at: new Date().toISOString() }).eq("account_id", a.id);
  }
  return Response.json({ received: true });
}
