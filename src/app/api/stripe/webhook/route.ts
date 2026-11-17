// Stripe tells us what happened on salon accounts (Connect webhook). Every event is saved once (by event id),
// then: payment succeeded → ticket paid; account updated → ready flags. Safe to receive twice.
import type Stripe from "stripe";
import { asServer, getStripe, settle } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const st = getStripe(), db = asServer(), secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!st || !db || !secret) return new Response("not configured", { status: 503 });
  let ev: Stripe.Event;
  try {
    ev = st.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  const obj = ev.data.object as { metadata?: Record<string, string> };
  const meta = obj.metadata ?? {};
  const { error: dup } = await db.from("stripe_events").insert({ id: ev.id, salon_id: meta.salon_id ?? null, ticket_id: meta.ticket_id ?? null, type: ev.type, payload: ev });
  if (dup && dup.code !== "23505") return new Response(dup.message, { status: 500 });

  if ((ev.type === "payment_intent.succeeded" || ev.type === "payment_intent.payment_failed") && meta.pay_request) {
    await settle(meta.pay_request);
  } else if (ev.type === "checkout.session.completed" && meta.pay_request) {
    await settle(meta.pay_request);
  } else if (ev.type === "account.updated") {
    const a = ev.data.object as Stripe.Account;
    await db.from("stripe_accounts").update({ charges_enabled: !!a.charges_enabled, payouts_enabled: !!a.payouts_enabled, details_submitted: !!a.details_submitted, updated_at: new Date().toISOString() }).eq("account_id", a.id);
  }
  return Response.json({ received: true });
}
