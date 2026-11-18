// Stripe tells us about salon plans on OUR platform account (renewals, failed cards, cancels, portal changes).
// Separate from the Connect webhook (/api/stripe/webhook): different Stripe endpoint + secret STRIPE_BILLING_WEBHOOK_SECRET.
// Each event saved once, then the salon's copy is refreshed from Stripe (so order of events never matters).
import type Stripe from "stripe";
import { asServer, getStripe, testMode } from "@/lib/server/pay";
import { salonOfCustomer, sync } from "@/lib/server/billing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const st = getStripe(), db = asServer(), secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!st || !db || !secret) return new Response("not configured", { status: 503 });
  let ev: Stripe.Event;
  try {
    ev = st.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  const obj = ev.data.object as { customer?: string | { id: string } | null; metadata?: Record<string, string> | null };
  const customer = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
  const salonId = obj.metadata?.salon_id ?? (await salonOfCustomer(db, customer));
  const { error: dup } = await db.from("stripe_events").insert({ id: ev.id, salon_id: salonId, ticket_id: null, type: ev.type, payload: ev });
  if (dup && dup.code !== "23505") return new Response(dup.message, { status: 500 });
  if (salonId && (ev.type.startsWith("customer.subscription.") || ev.type.startsWith("invoice.") || ev.type === "checkout.session.completed" || ev.type === "customer.updated" || ev.type === "payment_method.attached")) {
    await sync(db, st, salonId, testMode());
  }
  return Response.json({ received: true });
}
