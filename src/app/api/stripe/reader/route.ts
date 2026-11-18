// Card readers (Stripe S710). POST {code}: pair by the 3-word code on its screen (test mode: "simulated-s710" = pretend reader).
// POST {remove}: take a reader off the salon. GET ?salonId=: the salon's readers + online/offline from Stripe (Settings).
import { asServer, asUser, ensureLocation, fail, getStripe, testMode } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Payments aren't switched on yet.");
  const { salonId, code, label, remove } = (await req.json().catch(() => ({}))) as { salonId?: string; code?: string; label?: string; remove?: string };
  const { data: admin } = await sb.rpc("is_admin", { s: salonId });
  if (!salonId || !admin) return fail(403, "Only the owner or a manager can change card readers.");
  if (remove) {
    const { data: r } = await db.from("card_readers").select("id,simulated").eq("id", remove).eq("salon_id", salonId).is("archived_at", null).maybeSingle();
    if (!r) return fail(404, "That reader isn't on this salon.");
    const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", salonId).maybeSingle();
    if (a) await st.terminal.readers.del(r.id, {}, { stripeAccount: a.account_id }).catch(() => null); // already gone on Stripe = fine
    await db.from("card_readers").update({ archived_at: new Date().toISOString() }).eq("id", r.id);
    return Response.json({ ok: true });
  }
  const simulated = code === "simulated-s710";
  if (simulated && !testMode()) return fail(400, "Test readers only work in test mode.");
  if (!code || (!simulated && code.trim().split(/[-\s]+/).length !== 3)) return fail(400, "Type the 3 words the reader shows.");
  try {
    const { accountId, locationId } = await ensureLocation(salonId);
    const r = await st.terminal.readers.create({ registration_code: simulated ? code : code.trim().toLowerCase().split(/[-\s]+/).join("-"), label: label || "Front desk", location: locationId }, { stripeAccount: accountId });
    await db.from("card_readers").insert({ id: r.id, salon_id: salonId, label: r.label, simulated });
    return Response.json({ id: r.id, label: r.label, simulated });
  } catch (e) {
    return fail(400, (e as Error).message.includes("registration") ? "That code didn't work. Make a new code on the reader and try again." : (e as Error).message);
  }
}

export async function GET(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const salonId = new URL(req.url).searchParams.get("salonId") ?? "";
  const { data: member } = await sb.rpc("is_member", { s: salonId });
  if (!salonId || !member) return fail(403, "Not your salon.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return Response.json({ on: false, readers: [] });
  const { data: rows } = await db.from("card_readers").select("id,label,simulated,created_at").eq("salon_id", salonId).is("archived_at", null).order("created_at");
  const { data: a } = await db.from("stripe_accounts").select("account_id").eq("salon_id", salonId).maybeSingle();
  const readers = await Promise.all((rows ?? []).map(async (r) => {
    let status = "unknown", device = "Stripe Reader S710";
    if (a) try {
      const x = await st.terminal.readers.retrieve(r.id, {}, { stripeAccount: a.account_id });
      if (!("deleted" in x && x.deleted)) { status = x.status ?? "unknown"; device = x.device_type === "stripe_s700" ? "Stripe Reader S700" : x.device_type?.startsWith("simulated") ? "Test reader" : device; }
    } catch { status = "unknown"; }
    return { id: r.id, label: r.label, simulated: r.simulated, status, device, added: r.created_at };
  }));
  return Response.json({ on: true, connected: !!a, test: testMode(), readers });
}
