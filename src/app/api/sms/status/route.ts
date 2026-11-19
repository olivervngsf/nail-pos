// Twilio → delivery updates for texts we sent (StatusCallback set by sendText). Signed by Twilio, else 403.
import { asServer, originOf } from "@/lib/server/pay";
import { validTwilio } from "@/lib/texting/sms";

export const runtime = "nodejs";
const MAP: Record<string, string> = { queued: "sent", accepted: "sent", sending: "sent", sent: "sent", delivered: "delivered", undelivered: "failed", failed: "failed" };

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN, db = asServer();
  if (!token || !db) return new Response("not configured", { status: 503 });
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  const u = new URL(req.url);
  if (!validTwilio(`${originOf(req)}${u.pathname}${u.search}`, params, token, req.headers.get("x-twilio-signature"))) return new Response("bad signature", { status: 403 });
  const status = MAP[params.MessageStatus ?? ""];
  if (params.MessageSid && status) {
    await db.from("text_messages").update({ status, error: params.ErrorCode ? `twilio ${params.ErrorCode}` : null, updated_at: new Date().toISOString() })
      .eq("provider_sid", params.MessageSid).neq("status", "delivered");
  }
  return new Response(null, { status: 204 });
}
