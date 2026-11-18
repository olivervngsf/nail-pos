// Client's own phone (pay link / QR): no sign-in. GET shows what to pay; POST picks a tip and opens Stripe's pay page.
// The link id is a random uuid made for this one payment; it shows only salon name, ticket # and amounts.
import { asServer, fail, getStripe, originOf, settle } from "@/lib/server/pay";

export const runtime = "nodejs";

async function load(id: string | null) {
  const db = asServer();
  if (!db || !id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: pr } = await db.from("pay_requests").select("id,salon_id,ticket_id,method,amount_cents,tip_cents,status,checkout_session").eq("id", id).eq("method", "pay_link").maybeSingle();
  if (!pr) return null;
  const [{ data: s }, { data: t }, { data: a }] = await Promise.all([
    db.from("salons").select("name").eq("id", pr.salon_id).single(),
    db.from("tickets").select("number").eq("id", pr.ticket_id).single(),
    db.from("stripe_accounts").select("account_id").eq("salon_id", pr.salon_id).single(),
  ]);
  return { pr, salon: s?.name ?? "", number: t?.number, account: a?.account_id as string };
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const x = await load(id);
  if (!x) return fail(404, "This pay link isn't valid.");
  let status = x.pr.status;
  if (status === "pending" && x.pr.checkout_session) status = (await settle(x.pr.id).catch(() => ({ status }))).status;
  return Response.json({ salon: x.salon, number: x.number, amountCents: Number(x.pr.amount_cents), tipCents: x.pr.tip_cents, status });
}

export async function POST(req: Request) {
  const { id, tipCents } = (await req.json().catch(() => ({}))) as { id?: string; tipCents?: number };
  const x = await load(id ?? null);
  if (!x) return fail(404, "This pay link isn't valid.");
  if (x.pr.status !== "pending") return fail(409, x.pr.status === "paid" ? "Already paid. Thank you!" : "This pay link was cancelled. Ask the front desk.");
  const st = getStripe();
  if (!st) return fail(503, "Payments aren't switched on yet.");
  // Tapped Pay before (went back, changed the tip, two tabs): close the older pay page first so only one can take money.
  // If that one was already paid, record it and stop here.
  if (x.pr.checkout_session) {
    await st.checkout.sessions.expire(x.pr.checkout_session, {}, { stripeAccount: x.account }).catch(() => null);
    const now = await settle(x.pr.id).catch(() => null);
    if (!now) return fail(503, "Can't check your payment right now. Try again in a moment.");
    if (now.status !== "pending") return fail(409, now.status === "paid" ? "Already paid. Thank you!" : "This pay link was cancelled. Ask the front desk.");
  }
  const tip = Math.max(0, Math.min(Math.round(tipCents ?? 0), Number(x.pr.amount_cents) * 2));
  const origin = originOf(req);
  const items = [{ quantity: 1, price_data: { currency: "usd", unit_amount: Number(x.pr.amount_cents), product_data: { name: `${x.salon} · ticket #${x.number}` } } }];
  if (tip > 0) items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: tip, product_data: { name: "Tip for your nail tech" } } });
  const cs = await st.checkout.sessions.create({
    mode: "payment", line_items: items,
    success_url: `${origin}/pay/${x.pr.id}?done=1`, cancel_url: `${origin}/pay/${x.pr.id}`,
    payment_intent_data: { metadata: { ticket_id: x.pr.ticket_id, salon_id: x.pr.salon_id, pay_request: x.pr.id, tip_cents: String(tip) } },
    metadata: { pay_request: x.pr.id },
  }, { stripeAccount: x.account });
  await asServer()!.from("pay_requests").update({ checkout_session: cs.id, tip_cents: tip, updated_at: new Date().toISOString() }).eq("id", x.pr.id);
  return Response.json({ url: cs.url });
}
