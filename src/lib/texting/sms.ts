// Pure helpers for the text sender (no secrets here; tested in sms.test.ts).
import { createHmac, timingSafeEqual } from "node:crypto";

export type TextKind = "invite" | "salon_ready" | "confirm" | "reminder" | "receipt" | "promo" | "other";

/** Kinds that go out on the PolishOS number (our own messages), not the salon's. */
export const PLATFORM_KINDS: TextKind[] = ["invite", "salon_ready"];
/** Kinds that need the client's yes (clients.texts_ok) at that salon. Receipts are asked for at the desk. */
export const NEEDS_YES: TextKind[] = ["confirm", "reminder", "promo"];
/** Client kinds that may go to a TEST phone on the PolishOS number while a salon has no number of its own
 *  (TEXT_TEST_PHONES in Vercel: our own phones + Twilio's Virtual Phone). Never promos. */
export const TEST_KINDS: TextKind[] = ["confirm", "reminder", "receipt"];
export function testPhones(list: string | undefined | null): string[] {
  return (list ?? "").split(/[,;\n]+/).filter(Boolean).map((p) => e164(p)).filter((p): p is string => !!p);
}
export function onTestList(kind: TextKind, to: string, list: string | undefined | null): boolean {
  return TEST_KINDS.includes(kind) && testPhones(list).includes(to);
}

/** Carrier keywords. Only the whole reply counts ("stop", "STOP." → stop; "don't stop" → nothing). */
const STOP = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE", "DUNG", "HUY"];
const START = ["START", "YES", "UNSTOP", "SUBSCRIBE"];
const HELP = ["HELP", "INFO", "GIUP"];
export function keyword(body: string): "stop" | "start" | "help" | null {
  const w = body.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").trim().replace(/[.!?\s]+$/, "").toUpperCase();
  if (STOP.includes(w)) return "stop";
  if (START.includes(w)) return "start";
  if (HELP.includes(w)) return "help";
  return null;
}

/** US numbers to E.164: "(408) 555-0100" → "+14085550100". Anything else unchanged if it already has a +. */
export function e164(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+") && d.length >= 8) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/** Twilio's request signature: base64 HMAC-SHA1 of the full URL + every form field (sorted by name) as name+value. */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}
export function validTwilio(url: string, params: Record<string, string>, authToken: string, header: string | null): boolean {
  if (!header) return false;
  const want = Buffer.from(twilioSignature(url, params, authToken));
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The reply to HELP (carriers require one): who is texting + how to stop. */
export function helpReply(sender: string): string {
  return `${sender}: texts about your bookings and visits. Help: support@polishosapp.com. Reply STOP to stop.`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** TwiML answer: empty = no reply text. */
export const twiml = (reply?: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${reply ? `<Message>${esc(reply)}</Message>` : ""}</Response>`;
