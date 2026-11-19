// How did one text end? GET ?id=<text_messages.id>. Platform admins see any; a salon's owner/manager sees that salon's.
// Status comes from Twilio's delivery updates (/api/sms/status): sent → delivered, or failed with a code we explain.
import { asServer, asUser, fail } from "@/lib/server/pay";
import { explainTextError } from "@/lib/texting/invite";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const db = asServer();
  if (!db) return fail(503, "Server key missing.");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail(400, "No text id.");
  const { data } = await db.from("text_messages").select("id,salon_id,status,error,updated_at").eq("id", id).maybeSingle();
  if (!data) return fail(404, "Text not found.");
  const { data: admin } = await sb.rpc("is_platform_admin");
  if (!admin) {
    const { data: ok } = data.salon_id ? await sb.rpc("is_admin", { s: data.salon_id }) : { data: false };
    if (!ok) return fail(403, "Not your text.");
  }
  return Response.json({ id: data.id, status: data.status, why: explainTextError(data.error), at: data.updated_at });
}
