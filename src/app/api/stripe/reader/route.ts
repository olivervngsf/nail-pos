// Pair a card reader (Stripe S710) by the 3-word code on its screen. Test mode: code "simulated-s710" makes a pretend reader.
import { asServer, asUser, ensureLocation, fail, getStripe, testMode } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Payments aren't switched on yet.");
  const { salonId, code, label } = (await req.json().catch(() => ({}))) as { salonId?: string; code?: string; label?: string };
  const { data: admin } = await sb.rpc("is_admin", { s: salonId });
  if (!salonId || !admin) return fail(403, "Only the owner or a manager can add a reader.");
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
