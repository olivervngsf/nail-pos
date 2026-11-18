// Owner connects payments: make (or reuse) the salon's own Stripe account (Standard-style), send them to Stripe's sign-up page.
import { asServer, asUser, fail, getStripe, originOf } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Payments aren't switched on yet.");
  const { salonId, back } = (await req.json().catch(() => ({}))) as { salonId?: string; back?: string };
  const page = back === "/today" || back === "/settings/payments" ? back : "/setup";
  const { data: admin } = await sb.rpc("is_admin", { s: salonId });
  if (!salonId || !admin) {
    const { data: exists } = await db.from("salons").select("id").eq("id", salonId).maybeSingle();
    return fail(exists ? 403 : 409, exists ? "Only the owner or a manager can connect payments." : "Your salon isn't saved yet. Check internet, wait a few seconds, then try again.");
  }

  let { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", salonId).maybeSingle();
  if (!a) {
    const { data: s } = await db.from("salons").select("name,phone").eq("id", salonId).single();
    // Prefill what the owner would otherwise fix by hand: industry = nail salon, statement name = salon name.
    const clean = (s?.name ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const merchant = {
      capabilities: { card_payments: { requested: true } },
      mcc: "7230", // beauty and barber shops (incl. nail salons)
      ...(clean.length >= 5 ? { statement_descriptor: { descriptor: clean.slice(0, 22), prefix: clean.replace(/ /g, "").slice(0, 10) } } : {}),
      ...(s?.phone ? { support: { phone: s.phone } } : {}),
    };
    // Accounts v2 (Stripe's current way). Salon = merchant on its own account (direct charges), Stripe collects
    // its fees from the salon and covers losses (Managed Risk). Full Stripe dashboard (the only setup Stripe allows when it collects fees + covers losses).
    const make = (m: typeof merchant | { capabilities: typeof merchant.capabilities; mcc: string }) => st.v2.core.accounts.create({
      display_name: s?.name ?? undefined,
      dashboard: "full",
      identity: { country: "US" },
      defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
      configuration: { merchant: m },
      metadata: { salon_id: salonId },
    });
    // If Stripe rejects the prefilled statement name / phone, create without them (owner fills them on Stripe's page).
    const acct = await make(merchant).catch(() => make({ capabilities: merchant.capabilities, mcc: merchant.mcc }));
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
