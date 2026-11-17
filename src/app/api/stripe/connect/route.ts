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
  if (!salonId || !admin) {
    const { data: exists } = await db.from("salons").select("id").eq("id", salonId).maybeSingle();
    return fail(exists ? 403 : 409, exists ? "Only the owner or a manager can connect payments." : "Your salon isn't saved yet. Check internet, wait a few seconds, then try again.");
  }

  let { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", salonId).maybeSingle();
  if (!a) {
    const { data: s } = await db.from("salons").select("name").eq("id", salonId).single();
    // Accounts v2 (Stripe's current way). Salon = merchant on its own account (direct charges), Stripe collects
    // its fees from the salon and covers losses (Managed Risk). Full Stripe dashboard (the only setup Stripe allows when it collects fees + covers losses).
    const acct = await st.v2.core.accounts.create({
      display_name: s?.name ?? undefined,
      dashboard: "full",
      identity: { country: "US" },
      defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      metadata: { salon_id: salonId },
    });
    await db.from("stripe_accounts").insert({ salon_id: salonId, account_id: acct.id });
    a = { account_id: acct.id };
  }
  const origin = originOf(req);
  const link = await st.v2.core.accountLinks.create({
    account: a.account_id,
    use_case: { type: "account_onboarding", account_onboarding: { refresh_url: `${origin}${page}?stripe=retry`, return_url: `${origin}${page}?stripe=return` } },
  });
  return Response.json({ url: link.url });
}
