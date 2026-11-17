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
  // Accounts v2: card payments are on when the merchant card_payments capability is "active".
  let row: { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; updated_at: string };
  let missing: string[] = [];
  let state = "";
  try {
    const acct = await st.v2.core.accounts.retrieve(a.account_id, { include: ["configuration.merchant", "requirements"] });
    const cap = acct.configuration?.merchant?.capabilities?.card_payments;
    state = cap?.status ?? "";
    const entries = acct.requirements?.entries ?? [];
    missing = entries.filter((e) => e.awaiting_action_from === "user").map((e) => e.description).slice(0, 4);
    row = { charges_enabled: state === "active", payouts_enabled: state === "active", details_submitted: entries.every((e) => e.awaiting_action_from !== "user"), updated_at: new Date().toISOString() };
  } catch {
    const acct = await st.accounts.retrieve(a.account_id);
    row = { charges_enabled: !!acct.charges_enabled, payouts_enabled: !!acct.payouts_enabled, details_submitted: !!acct.details_submitted, updated_at: new Date().toISOString() };
  }
  await db.from("stripe_accounts").update(row).eq("salon_id", salonId);
  return Response.json({ on: true, connected: true, test: testMode(), chargesEnabled: row.charges_enabled, detailsSubmitted: row.details_submitted, payoutsEnabled: row.payouts_enabled, state, missing });
}
