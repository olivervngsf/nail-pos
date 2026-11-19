// The handheld app's reader kit (Stripe Terminal) needs a short-lived connection token to talk to the small card reader.
// Given only for a card payment this person may see (desk staff of that salon), on the salon's own Stripe account.
import { asServer, asUser, fail, getStripe } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Card payments aren't switched on yet.");
  const { pr: id } = (await req.json().catch(() => ({}))) as { pr?: string };
  // RLS: only desk staff of the salon see the pay request.
  const { data: pr } = await sb.from("pay_requests").select("id,salon_id").eq("id", id).maybeSingle();
  if (!pr) return fail(404, "No such payment.");
  const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", pr.salon_id).maybeSingle();
  if (!a) return fail(409, "Connect Stripe in setup first.");
  try {
    const token = await st.terminal.connectionTokens.create({}, { stripeAccount: a.account_id as string });
    return Response.json({ secret: token.secret });
  } catch (e) {
    return fail(503, (e as Error).message);
  }
}
