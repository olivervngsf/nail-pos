// Text a staff invite link (owner/manager of that salon). Body { code }. Goes through the one sender (sendText):
// PolishOS number, logged in text_messages, never twice for the same code (clientKey invite:<code>).
import { asServer, asUser, fail, originOf } from "@/lib/server/pay";
import { sendText } from "@/lib/server/sms";
import { explainTextError, inviteBody } from "@/lib/texting/invite";

export const runtime = "nodejs";

type Row = {
  code: string; salon_id: string; expires_at: string; used_at: string | null;
  memberships: { display_name: string; phone: string | null; language: string | null; person_id: string | null; archived_at: string | null } | null;
  salons: { name: string } | null;
};

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const db = asServer();
  if (!db) return fail(503, "Server key missing.");
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const c = (code ?? "").trim().toUpperCase().replace(/-/g, "");
  if (!c) return fail(400, "No invite code.");

  const { data } = await db.from("invites")
    .select("code,salon_id,expires_at,used_at,memberships(display_name,phone,language,person_id,archived_at),salons(name)")
    .eq("code", c).maybeSingle<Row>();
  // Not saved yet (setup saves from the device a moment later): the caller tries again.
  if (!data || !data.memberships) return fail(404, "Invite not saved yet. Try again in a moment.");
  const { data: ok } = await sb.rpc("is_admin", { s: data.salon_id });
  if (!ok) return fail(403, "Only the owner or a manager can send invites.");
  const m = data.memberships;
  if (m.archived_at) return fail(409, "That person was removed from the team.");
  if (data.used_at || m.person_id) return fail(409, "They already joined.");
  if (new Date(data.expires_at) < new Date()) return fail(409, "This invite ended. Make a new one.");
  if (!m.phone) return fail(400, "Add their mobile number first.");

  const { data: owner } = await db.from("memberships").select("display_name")
    .eq("salon_id", data.salon_id).eq("role", "owner").is("archived_at", null).order("created_at").limit(1).maybeSingle<{ display_name: string }>();
  const origin = originOf(req);
  const r = await sendText(db, {
    clientKey: `invite:${c}`, kind: "invite", to: m.phone, salonId: data.salon_id,
    body: inviteBody({ salon: data.salons?.name ?? "", owner: owner?.display_name, link: `${origin}/join/${c}`, lang: m.language }),
  }, origin);
  return Response.json({ ...r, why: explainTextError(r.error) });
}
