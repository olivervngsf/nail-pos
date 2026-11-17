// Close day step 3: card money we recorded vs what Stripe says came in on the salon's account that day ("zero surprises").
// Desk roles only (day_summary refuses anyone else). Lists every Stripe payment we have no record of.
import { asServer, asUser, fail, getStripe } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { salonId, day } = (await req.json().catch(() => ({}))) as { salonId?: string; day?: string };
  if (!salonId || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(400, "Pick a day.");
  const { data: sum, error } = await sb.rpc("day_summary", { p_salon: salonId, p_day: day });
  if (error || !sum) return fail(403, "Only the front desk, a manager or the owner can check this.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Card payments aren't switched on yet.");
  const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", salonId).maybeSingle();
  if (!a) return Response.json({ checked: false, reason: "Stripe isn't connected for this salon." });

  const [{ data: lo }, { data: hi }] = await Promise.all([
    db.rpc("_day_lo", { p_salon: salonId, p_day: day }),
    db.rpc("_day_lo", { p_salon: salonId, p_day: new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) }),
  ]);
  const gte = Math.floor(Date.parse(lo as string) / 1000), lt = Math.floor(Date.parse(hi as string) / 1000);
  let count = 0, cents = 0;
  const intents: string[] = [];
  for await (const c of st.charges.list({ created: { gte, lt }, limit: 100 }, { stripeAccount: a.account_id as string })) {
    if (c.status !== "succeeded" || !c.paid) continue;
    count++; cents += c.amount_captured;
    if (typeof c.payment_intent === "string") intents.push(c.payment_intent);
  }
  const { data: ours } = await db.from("payments").select("stripe_payment_intent,amount_cents,status").eq("salon_id", salonId).in("stripe_payment_intent", intents.length ? intents : ["-"]);
  const known = new Set((ours ?? []).map((p) => p.stripe_payment_intent as string));
  // Same basis as Stripe's captured amounts: every card payment we recorded that day, before refunds (extra ones included).
  const { data: rec } = await db.from("payments").select("amount_cents").eq("salon_id", salonId).in("method", ["card_reader", "pay_link"])
    .in("status", ["paid", "refunded", "extra"]).gte("at", lo as string).lt("at", hi as string);
  const recorded = (rec ?? []).reduce((a, p) => a + Number(p.amount_cents), 0);
  return Response.json({ checked: true, stripeCount: count, stripeCents: cents, recordedCents: recorded, matches: cents === recorded,
    missing: intents.filter((i) => !known.has(i)) });
}
