// Salon address after setup (Settings → Salon address). Stripe needs street, city, state and ZIP before any card
// reader or Tap to Pay works (it makes a "location" from it). GET ?salonId= (any member) → {address, state, ok}.
// POST {salonId, address} (owner/manager): checks it, saves it, logs it, and fixes the Stripe location if one exists.
import { asServer, asUser, fail, getStripe } from "@/lib/server/pay";
import { addressOk, parseAddress } from "@/lib/stripe/address";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const salonId = new URL(req.url).searchParams.get("salonId") ?? "";
  const { data: member } = await sb.rpc("is_member", { s: salonId });
  if (!salonId || !member) return fail(403, "Not your salon.");
  const db = asServer();
  if (!db) return fail(503, "Not switched on yet.");
  const { data: s } = await db.from("salons").select("address,state").eq("id", salonId).maybeSingle();
  if (!s) return fail(404, "No such salon.");
  return Response.json({ address: s.address ?? "", state: s.state ?? "CA", ok: addressOk(parseAddress(s.address, s.state ?? "CA")) });
}

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { salonId, address } = (await req.json().catch(() => ({}))) as { salonId?: string; address?: string };
  const { data: admin } = await sb.rpc("is_admin", { s: salonId });
  if (!salonId || !admin) return fail(403, "Only the owner or a manager can change the salon address.");
  const db = asServer();
  if (!db) return fail(503, "Not switched on yet.");
  const { data: s } = await db.from("salons").select("address,state").eq("id", salonId).maybeSingle();
  if (!s) return fail(404, "No such salon.");
  const text = String(address ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const parsed = parseAddress(text, s.state ?? "CA");
  if (!addressOk(parsed)) return fail(400, "Type street, city, state and ZIP, with commas (like: 1550 S Bascom Ave, Campbell, CA 95008).");
  const { error } = await db.from("salons").update({ address: text }).eq("id", salonId);
  if (error) return fail(500, "Couldn't save. Try again.");
  await db.from("audit_log").insert({ salon_id: salonId, action: "salon.address", detail: { from: s.address ?? null, to: text } }).then(() => null, () => null);
  // A Stripe location made earlier keeps the old address: update it (readers and Tap to Pay stay on it).
  const st = getStripe();
  const { data: a } = await db.from("stripe_accounts").select("account_id,location_id").eq("salon_id", salonId).maybeSingle();
  let stripe: "updated" | "none" | "failed" = "none";
  if (st && a?.location_id) {
    try { await st.terminal.locations.update(a.location_id, { address: parsed }, { stripeAccount: a.account_id }); stripe = "updated"; }
    catch { stripe = "failed"; }
  }
  return Response.json({ ok: true, address: text, stripe });
}
