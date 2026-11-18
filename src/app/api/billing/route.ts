// Salon plan (Stripe Billing on our platform account). One route, one action per call:
//   status          owner/manager: read Stripe, save the copy, return the page view
//   start {cycle}   owner: Stripe Checkout for a new plan (30-day free pilot the first time, card on file)
//   cycle {cycle}   owner: switch monthly ↔ yearly on the current plan (prorated)
//   cancel / resume owner: cancel at period end / undo that
//   portal          owner: Stripe's billing page (card, invoices, address)
import { asServer, asUser, fail, getStripe, originOf, testMode } from "@/lib/server/pay";
import { currentSub, customerFor, isLive, portalConfig, prices, sync, TRIAL_DAYS, type Cycle } from "@/lib/server/billing";

export const runtime = "nodejs";

type Body = { salonId?: string; action?: "status" | "start" | "cycle" | "cancel" | "resume" | "portal"; cycle?: Cycle };

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { salonId, action = "status", cycle } = (await req.json().catch(() => ({}))) as Body;
  if (!salonId) return fail(400, "Missing salon.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return Response.json({ on: false });

  const { data: admin } = await sb.rpc("is_admin", { s: salonId });
  if (!admin) return fail(403, "Only the owner or a manager can see billing.");
  if (action !== "status") {
    const { data: owner } = await sb.rpc("is_owner", { s: salonId });
    if (!owner) return fail(403, "Only the owner can change billing.");
  }
  if ((action === "start" || action === "cycle") && cycle !== "monthly" && cycle !== "yearly") return fail(400, "Pick monthly or yearly.");

  try {
    const page = `${originOf(req)}/settings/billing`;
    if (action === "status") return Response.json(await sync(db, st, salonId, testMode()));

    const customer = await customerFor(db, st, salonId);
    const sub = await currentSub(st, customer);
    const p = await prices(st);

    if (action === "start") {
      if (sub && isLive(sub.status)) return fail(409, "This salon already has a plan. Use Switch or Manage.");
      const cs = await st.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: salonId,
        line_items: [{ price: p[cycle!].id, quantity: 1 }],
        payment_method_collection: "always",
        subscription_data: { metadata: { salon_id: salonId }, ...(sub ? {} : { trial_period_days: TRIAL_DAYS }) },
        metadata: { salon_id: salonId, kind: "plan" },
        customer_update: { address: "auto", name: "auto" },
        billing_address_collection: "auto",
        success_url: `${page}?billing=done`,
        cancel_url: `${page}?billing=cancel`,
      });
      return Response.json({ url: cs.url });
    }

    if (action === "portal") {
      const cfg = await portalConfig(st, p);
      const s = await st.billingPortal.sessions.create({ customer, configuration: cfg, return_url: `${page}?billing=back` });
      return Response.json({ url: s.url });
    }

    if (!sub || !isLive(sub.status)) return fail(409, "No plan yet. Start one first.");
    if (action === "cycle") {
      const item = sub.items.data[0];
      if (item.price.id !== p[cycle!].id) {
        await st.subscriptions.update(sub.id, { items: [{ id: item.id, price: p[cycle!].id }], proration_behavior: "create_prorations", cancel_at_period_end: false });
      }
    } else if (action === "cancel") {
      await st.subscriptions.update(sub.id, { cancel_at_period_end: true });
    } else if (action === "resume") {
      await st.subscriptions.update(sub.id, { cancel_at_period_end: false });
    } else return fail(400, "Unknown action.");
    return Response.json(await sync(db, st, salonId, testMode()));
  } catch (e) {
    const msg = (e as { message?: string }).message ?? "Stripe didn't answer. Try again.";
    return fail(502, msg);
  }
}
