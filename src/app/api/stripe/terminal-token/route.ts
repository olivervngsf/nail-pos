// The handheld app's reader kit (Stripe Terminal) needs a short-lived connection token to talk to the small card reader.
// Given only for a card payment this person may see (desk staff of that salon), on the salon's own Stripe account.
// {salonId} instead of {pr}: Tap to Pay warm-up before any ticket (iPhone app), desk roles of that salon only.
import { asServer, asUser, fail, getStripe, isDeskOf } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Card payments aren't switched on yet.");
  const { pr: id, salonId } = (await req.json().catch(() => ({}))) as { pr?: string; salonId?: string };
  let salon: string;
  if (id) {
    // RLS: only desk staff of the salon see the pay request.
    const { data: pr } = await sb.from("pay_requests").select("id,salon_id").eq("id", id).maybeSingle();
    if (!pr) return fail(404, "No such payment.");
    salon = pr.salon_id as string;
  } else {
    if (!salonId || !(await isDeskOf(sb, salonId))) return fail(403, "Only the front desk, a manager or the owner can take cards.");
    salon = salonId;
  }
  const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", salon).maybeSingle();
  if (!a) return fail(409, "Connect Stripe in setup first.");
  try {
    const token = await st.terminal.connectionTokens.create({}, { stripeAccount: a.account_id as string });
    return Response.json({ secret: token.secret });
  } catch (e) {
    return fail(503, (e as Error).message);
  }
}
