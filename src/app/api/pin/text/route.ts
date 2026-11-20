// Text a "make your PIN" link to a team member who joined but has no PIN (owner/manager of that salon).
// Body { membership }. Link = /t/pin?s=<salon>: they sign in with their own phone, so a forwarded link is useless.
// PolishOS number (staff notice, kind "invite"); at most one text per person per day (clientKey pin:<id>:<day>).
import { asServer, asUser, fail, originOf } from "@/lib/server/pay";
import { sendText } from "@/lib/server/sms";
import { explainTextError, pinLinkBody } from "@/lib/texting/invite";

export const runtime = "nodejs";

type Row = {
  id: string; salon_id: string; phone: string | null; language: string | null; person_id: string | null;
  pin_hash: string | null; archived_at: string | null; salons: { name: string } | null;
};

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const db = asServer();
  if (!db) return fail(503, "Server key missing.");
  const { membership } = (await req.json().catch(() => ({}))) as { membership?: string };
  if (!membership) return fail(400, "Who?");

  const { data: m } = await db.from("memberships")
    .select("id,salon_id,phone,language,person_id,pin_hash,archived_at,salons(name)").eq("id", membership).maybeSingle<Row>();
  if (!m) return fail(404, "Not on the team.");
  const { data: ok } = await sb.rpc("is_admin", { s: m.salon_id });
  if (!ok) return fail(403, "Only the owner or a manager can send this.");
  if (m.archived_at) return fail(409, "That person was removed from the team.");
  if (!m.person_id) return fail(409, "They haven't joined yet. Send the invite instead.");
  if (m.pin_hash) return fail(409, "They already have a PIN.");
  if (!m.phone) return fail(400, "Add their mobile number first.");

  const origin = originOf(req);
  const day = new Date().toISOString().slice(0, 10);
  const r = await sendText(db, {
    clientKey: `pin:${m.id}:${day}`, kind: "invite", to: m.phone, salonId: m.salon_id,
    body: pinLinkBody({ salon: m.salons?.name ?? "", link: `${origin}/t/pin?s=${m.salon_id}`, lang: m.language }),
  }, origin);
  return Response.json({ ...r, why: explainTextError(r.error) });
}
