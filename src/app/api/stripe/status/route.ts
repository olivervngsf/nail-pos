// Is the salon's Stripe account ready to take payments? Refreshes our copy from Stripe.
import { asServer, asUser, fail, getStripe, testMode } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { salonId } = (await req.json().catch(() => ({}))) as { salonId?: string };
  const { data: member } = await sb.rpc("is_member", { s: salonId });
  if (!salonId || !member) return fail(403, "Not your salon.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return Response.json({ on: false });
  const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", salonId).maybeSingle();
  if (!a) return Response.json({ on: true, connected: false, test: testMode() });
  const acct = await st.accounts.retrieve(a.account_id);
  const row = { charges_enabled: !!acct.charges_enabled, payouts_enabled: !!acct.payouts_enabled, details_submitted: !!acct.details_submitted, updated_at: new Date().toISOString() };
  await db.from("stripe_accounts").update(row).eq("salon_id", salonId);
  return Response.json({ on: true, connected: true, test: testMode(), chargesEnabled: row.charges_enabled, detailsSubmitted: row.details_submitted, payoutsEnabled: row.payouts_enabled });
}
