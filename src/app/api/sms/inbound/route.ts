// Twilio → a reply to one of our numbers. Point each Messaging Service's "incoming message" webhook here.
// STOP (or Vietnamese DUNG/HUY) = no more texts from that number; START = back on; HELP = who we are + how to stop.
// Twilio's own opt-out handling also blocks the number at their end; this keeps our records + clients.texts_ok in step.
// Every request must carry Twilio's signature (TWILIO_AUTH_TOKEN), else 403.
import { asServer, originOf } from "@/lib/server/pay";
import { setOptOut } from "@/lib/server/sms";
import { e164, helpReply, keyword, twiml, validTwilio } from "@/lib/texting/sms";

export const runtime = "nodejs";
const xml = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/xml" } });

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN, db = asServer();
  if (!token || !db) return new Response("not configured", { status: 503 });
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  const u = new URL(req.url);
  if (!validTwilio(`${originOf(req)}${u.pathname}${u.search}`, params, token, req.headers.get("x-twilio-signature"))) return new Response("bad signature", { status: 403 });

  const from = e164(params.From ?? ""), to = e164(params.To ?? "");
  const word = keyword(params.Body ?? "");
  if (!from || !to || !word) return xml(twiml());
  // Which salon owns the number they replied to (none = the PolishOS number).
  const { data: num } = await db.from("text_numbers").select("salon_id").eq("phone", to).maybeSingle();
  const salonId = (num?.salon_id as string | null) ?? null;
  if (word === "help") {
    const { data: s } = salonId ? await db.from("salons").select("name").eq("id", salonId).maybeSingle() : { data: null };
    return xml(twiml(helpReply(s?.name ?? "PolishOS")));
  }
  await setOptOut(db, from, salonId, word === "stop");
  await db.from("audit_log").insert({ salon_id: salonId, action: word === "stop" ? "text.stop" : "text.start", detail: { last4: from.slice(-4) } }).then(() => null, () => null);
  return xml(twiml()); // Twilio sends the carrier's standard STOP/START confirmation itself
}
