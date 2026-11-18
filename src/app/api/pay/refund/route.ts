// Refund a paid ticket in full. Needs an owner/manager OK (approve_discount: their PIN on the salon device, or their own login).
// Card: Stripe refunds to the card (the salon's Stripe account pays it back). Cash: recorded; give the cash back.
import { asServer, asUser, fail, getStripe } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const db = asServer();
  if (!db) return fail(503, "Refunds aren't switched on yet.");
  const { ticketId, approvalId, reason } = (await req.json().catch(() => ({}))) as { ticketId?: string; approvalId?: string; reason?: string };
  // Desk staff only (RLS hides tickets from techs; pay_info refuses anyone else).
  const { data: t } = await sb.from("tickets").select("id,salon_id,status").eq("id", ticketId).maybeSingle();
  if (!t) return fail(404, "No such ticket.");
  const { error: notDesk } = await sb.rpc("pay_info", { p_ticket: t.id });
  if (notDesk) return fail(403, "Only the front desk, a manager or the owner can refund.");
  if (t.status === "refunded") return Response.json({ status: "refunded" });
  if (t.status !== "paid") return fail(409, "Only a paid ticket can be refunded.");
  // Owner/manager OK for this ticket, used once, within 15 minutes.
  const { data: approver } = await db.rpc("use_refund_ok", { p_approval: approvalId ?? null, p_ticket: t.id });
  if (!approver) return fail(403, "A refund needs an owner or manager OK.");
  const ok = { membership_id: approver as string };
  const { data: pay } = await db.from("payments").select("method,stripe_payment_intent").eq("ticket_id", t.id).eq("status", "paid").neq("method", "gift_card").order("at", { ascending: false }).limit(1).maybeSingle();
  let refundId: string | null = null;
  if (pay?.stripe_payment_intent) {
    const st = getStripe();
    const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", t.salon_id).single();
    if (!st || !a) return fail(503, "Card refunds aren't switched on yet.");
    const r = await st.refunds.create({ payment_intent: pay.stripe_payment_intent, reason: "requested_by_customer", metadata: { ticket_id: t.id } },
      { stripeAccount: a.account_id, idempotencyKey: `refund-${t.id}` });
    refundId = r.id;
  }
  const { data, error } = await db.rpc("settle_refund", { p_ticket: t.id, p_stripe_refund: refundId, p_reason: reason ?? "", p_by: ok.membership_id });
  if (error) return fail(400, error.message);
  return Response.json({ ...data, method: pay?.method });
}
