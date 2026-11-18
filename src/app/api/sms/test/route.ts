// Platform admins only: send one test text to a phone, through the real sender (logged in text_messages, kind 'other').
// Trial Twilio accounts can only text numbers verified in the Twilio console.
import { asServer, asUser, fail, originOf } from "@/lib/server/pay";
import { sendText, smsConfigured } from "@/lib/server/sms";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { data: admin } = await sb.rpc("is_platform_admin");
  if (!admin) return fail(403, "PolishOS team only.");
  const db = asServer();
  if (!db) return fail(503, "Server key missing.");
  if (!smsConfigured()) return fail(503, "Texting isn't switched on: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM in Vercel.");
  const { to } = (await req.json().catch(() => ({}))) as { to?: string };
  if (!to) return fail(400, "Type a mobile number.");
  const r = await sendText(db, { clientKey: `test:${crypto.randomUUID()}`, kind: "other", to, body: "PolishOS test text: texting works. Reply STOP to stop." }, originOf(req));
  return Response.json(r);
}
