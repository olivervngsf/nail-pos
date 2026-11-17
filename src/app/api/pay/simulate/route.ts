// Test mode only: pretend the client tapped a card on the (simulated) reader, with an optional tip or a declined card.
import { asServer, asUser, fail, getStripe, testMode } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!testMode()) return fail(404, "Not found.");
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { id, tipCents, decline } = (await req.json().catch(() => ({}))) as { id?: string; tipCents?: number; decline?: boolean };
  const { data: pr } = await sb.from("pay_requests").select("id,salon_id,reader_id,status").eq("id", id).maybeSingle();
  if (!pr?.reader_id || pr.status !== "pending") return fail(400, "Nothing waiting on the reader.");
  const db = asServer(), st = getStripe();
  const { data: a } = await db!.from("stripe_accounts").select("account_id").eq("salon_id", pr.salon_id).single();
  await st!.testHelpers.terminal.readers.presentPaymentMethod(pr.reader_id, {
    amount_tip: Math.max(0, Math.round(tipCents ?? 0)) || undefined,
    card_present: { number: decline ? "4000000000009995" : "4242424242424242" }, type: "card_present",
  }, { stripeAccount: a!.account_id });
  return Response.json({ ok: true });
}
