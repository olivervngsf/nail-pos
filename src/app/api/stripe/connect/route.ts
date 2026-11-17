// Owner connects payments: make (or reuse) the salon's own Stripe account (Standard-style), send them to Stripe's sign-up page.
import { asServer, asUser, fail, getStripe, originOf } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Payments aren't switched on yet.");
  const { salonId, back } = (await req.json().catch(() => ({}))) as { salonId?: string; back?: string };
  const page = back === "/today" ? "/today" : "/setup";
  const { data: admin } = await sb.rpc("is_admin", { s: salonId });
  if (!salonId || !admin) return fail(403, "Only the owner or a manager can connect payments.");

  let { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", salonId).maybeSingle();
  if (!a) {
    const { data: s } = await db.from("salons").select("name").eq("id", salonId).single();
    const acct = await st.accounts.create({
      // Standard-style (Stripe's Managed Risk for SaaS): salon owns a full Stripe account + dashboard, pays its own
      // Stripe fees, Stripe covers losses. (Express needs the platform to carry losses, which we don't.)
      controller: { stripe_dashboard: { type: "full" }, fees: { payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe" },
      country: "US",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { name: s?.name ?? undefined, mcc: "7230" }, // 7230 = beauty and barber shops
      metadata: { salon_id: salonId },
    });
    await db.from("stripe_accounts").insert({ salon_id: salonId, account_id: acct.id });
    a = { account_id: acct.id };
  }
  const origin = originOf(req);
  const link = await st.accountLinks.create({
    account: a.account_id, type: "account_onboarding",
    refresh_url: `${origin}${page}?stripe=retry`, return_url: `${origin}${page}?stripe=return`,
  });
  return Response.json({ url: link.url });
}
