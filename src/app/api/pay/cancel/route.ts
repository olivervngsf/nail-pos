// Desk cancels a card payment that's waiting (wrong amount, client changed mind): clears the reader.
import { asServer, asUser, fail, getStripe } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const { data: pr } = await sb.from("pay_requests").select("id,salon_id,reader_id,payment_intent,status").eq("id", id).maybeSingle();
  if (!pr) return fail(404, "No such payment.");
  if (pr.status !== "pending") return Response.json({ status: pr.status });
  const db = asServer()!, st = getStripe()!;
  const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", pr.salon_id).single();
  const opts = { stripeAccount: a!.account_id as string };
  if (pr.reader_id) await st.terminal.readers.cancelAction(pr.reader_id, {}, opts).catch(() => null);
  if (pr.payment_intent) await st.paymentIntents.cancel(pr.payment_intent, {}, opts).catch(() => null);
  await db.from("pay_requests").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", pr.id).eq("status", "pending");
  return Response.json({ status: "canceled" });
}
