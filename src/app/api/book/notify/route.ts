// Send a booking's confirmation: email (Resend) and/or text (Twilio). No sign-in: the booking's secret link token is
// the key, and a message only ever goes to the contact typed for that booking, once (the database hands each queued
// message out a single time). Says honestly what happened per channel: sent / off (not switched on) / failed.
//   Email needs RESEND_API_KEY (sender BOOKING_EMAIL_FROM, default PolishOS <no-reply@mail.polishosapp.com>).
//   Text needs the salon's texting = approved (Founder Admin) + TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
//   TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM.
import { asServer, originOf } from "@/lib/server/pay";
import { manageUrl, noticeEmail, noticeSms, type Notice } from "@/lib/booking/notice";

export const runtime = "nodejs";

type Send = { id: number; channel: "email" | "sms"; to: string | null };
type Claim = Notice & { sends: Send[]; salon: Notice["salon"] & { texting: string } };
type Outcome = "sent" | "off" | "failed";

async function sendEmail(to: string, m: { subject: string; text: string; html: string }, replyName: string): Promise<[Outcome, string?]> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return ["off", "email not switched on"];
  const from = process.env.BOOKING_EMAIL_FROM || "PolishOS <no-reply@mail.polishosapp.com>";
  const sender = from.replace(/^[^<]*</, `${replyName.replace(/[<>"]/g, "")} via PolishOS <`);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: sender, to: [to], subject: m.subject, text: m.text, html: m.html }),
  });
  return r.ok ? ["sent"] : ["failed", `resend ${r.status}: ${(await r.text()).slice(0, 200)}`];
}

async function sendSms(to: string, body: string, texting: string): Promise<[Outcome, string?]> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID, from = process.env.TWILIO_FROM;
  if (texting !== "approved") return ["off", `salon texting ${texting}`];
  if (!sid || !token || !(service || from)) return ["off", "texting not switched on"];
  const form = new URLSearchParams({ To: to, Body: body, ...(service ? { MessagingServiceSid: service } : { From: from! }) });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return r.ok ? ["sent"] : ["failed", `twilio ${r.status}: ${(await r.text()).slice(0, 200)}`];
}

export async function POST(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || !/^[0-9a-f]{24,64}$/i.test(token)) return Response.json({ error: "Booking not found." }, { status: 404 });
  const db = asServer();
  if (!db) return Response.json({ email: null, sms: null, off: true });
  const { data, error } = await db.rpc("booking_notice_claim", { p_token: token });
  if (error) return Response.json({ error: "Couldn't send right now." }, { status: 500 });
  const c = data as Claim | null;
  if (!c) return Response.json({ error: "Booking not found." }, { status: 404 });

  const link = manageUrl(originOf(req), token);
  const out: { email: Outcome | null; sms: Outcome | null } = { email: null, sms: null };
  for (const s of c.sends) {
    let res: [Outcome, string?];
    try {
      res = !s.to ? ["failed", "no address"] : s.channel === "email" ? await sendEmail(s.to, noticeEmail(c, link), c.salon.name) : await sendSms(s.to, noticeSms(c, link), c.salon.texting);
    } catch (e) { res = ["failed", (e as Error).message]; }
    out[s.channel] = res[0];
    await db.rpc("booking_notice_done", { p_id: s.id, p_status: res[0] === "off" ? "skipped" : res[0], p_error: res[1] ?? null });
  }
  return Response.json(out);
}
