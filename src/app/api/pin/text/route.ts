// Text someone their personal "make your PIN" link (owner/manager of that salon). Body { code } = a pin_links code
// made by pin_link_make. Link = /t/pin?c=<code>: one use, 7 days, and they still sign in with their own phone.
// PolishOS number (staff notice, kind "invite"); never texts the same link twice (clientKey pin:<code>).
import { asServer, asUser, fail, originOf } from "@/lib/server/pay";
import { sendText } from "@/lib/server/sms";
import { explainTextError, pinLinkBody } from "@/lib/texting/invite";

export const runtime = "nodejs";

type Row = {
  code: string; salon_id: string; expires_at: string; used_at: string | null;
  memberships: { phone: string | null; language: string | null; archived_at: string | null } | null;
  salons: { name: string } | null;
};

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const db = asServer();
  if (!db) return fail(503, "Server key missing.");
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return fail(400, "No link code.");

  const { data: l } = await db.from("pin_links")
    .select("code,salon_id,expires_at,used_at,memberships(phone,language,archived_at),salons(name)").eq("code", c).maybeSingle<Row>();
  if (!l || !l.memberships) return fail(404, "Link not found. Make a new one.");
  const { data: ok } = await sb.rpc("is_admin", { s: l.salon_id });
  if (!ok) return fail(403, "Only the owner or a manager can send this.");
  if (l.memberships.archived_at) return fail(409, "That person was removed from the team.");
  if (l.used_at || new Date(l.expires_at) < new Date()) return fail(409, "This link ended. Make a new one.");
  if (!l.memberships.phone) return fail(400, "Add their mobile number first.");

  const origin = originOf(req);
  const r = await sendText(db, {
    clientKey: `pin:${c}`, kind: "invite", to: l.memberships.phone, salonId: l.salon_id,
    body: pinLinkBody({ salon: l.salons?.name ?? "", link: `${origin}/t/pin?c=${c}`, lang: l.memberships.language }),
  }, origin);
  return Response.json({ ...r, why: explainTextError(r.error) });
}
