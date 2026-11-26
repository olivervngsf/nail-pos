// The ONE way PolishOS sends a text (server only). Every caller (invites, confirms, reminders, receipts, promos) uses sendText.
// - Picks the number: our PolishOS number for our own messages (invites), else the salon's own registered number.
// - Never sends twice: same clientKey = same text (text_messages.client_key is unique).
// - Never texts someone who replied STOP to that number, or a client who hasn't said yes (confirm/reminder/promo).
// - No Twilio settings, or the salon's number isn't registered yet = logged as 'skipped' (nothing sent, nothing breaks).
// Env (Vercel, server only): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (also checks Twilio's webhook signatures),
// TWILIO_MESSAGING_SERVICE_SID = the PolishOS Messaging Service (MG…) (or TWILIO_FROM = a plain number while testing);
// salon numbers live in text_numbers.
import type { SupabaseClient } from "@supabase/supabase-js";
import { textParts } from "@/lib/texting/parts";
import { e164, NEEDS_YES, onTestList, PLATFORM_KINDS, type TextKind } from "@/lib/texting/sms";

export type SendInput = { clientKey: string; kind: TextKind; to: string; body: string; salonId?: string | null };
export type SendResult = { id?: string; status: "queued" | "sent" | "failed" | "skipped" | "blocked"; error?: string; duplicate?: boolean };

export const smsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

/** Which Messaging Service sends this text, or why none can yet. */
async function senderFor(db: SupabaseClient, kind: TextKind, salonId: string | null, to: string): Promise<{ service?: string; phone?: string; from?: string; why?: string; test?: boolean }> {
  if (PLATFORM_KINDS.includes(kind) || !salonId) {
    const service = process.env.TWILIO_MESSAGING_SERVICE_SID, phone = process.env.TWILIO_FROM;
    // TWILIO_FROM = a plain Twilio number, for testing before the Messaging Service is registered (trial accounts too:
    // a trial only texts numbers verified in Twilio, with "Sent from your Twilio trial account" added).
    return service ? { service, from: "polishos" } : phone ? { phone, from: phone } : { why: "PolishOS number not set up yet" };
  }
  const { data } = await db.from("text_numbers").select("phone,messaging_service_sid").eq("salon_id", salonId).eq("status", "active").maybeSingle();
  if (data) return { service: data.messaging_service_sid, from: data.phone };
  // Test mode (before go-live): a confirm / reminder / receipt to a phone on TEXT_TEST_PHONES goes out on the PolishOS
  // number, marked "(Test)". Only our own phones + Twilio's Virtual Phone; real clients still wait for the salon's number.
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (service && onTestList(kind, to, process.env.TEXT_TEST_PHONES)) return { service, from: "polishos-test", test: true };
  return { why: "salon's texting number not registered yet" };
}

export async function sendText(db: SupabaseClient, input: SendInput, origin?: string): Promise<SendResult> {
  const to = e164(input.to);
  const salonId = input.salonId ?? null;
  const usesPlatform = PLATFORM_KINDS.includes(input.kind) || !salonId;
  const record = async (status: SendResult["status"], extra: Record<string, unknown> = {}): Promise<SendResult> => {
    const { data, error } = await db.from("text_messages").insert({
      client_key: input.clientKey, salon_id: salonId, kind: input.kind, to_phone: to ?? input.to, body: input.body,
      parts: Math.max(1, textParts(input.body).parts), status, ...extra,
    }).select("id").single();
    if (error?.code === "23505") {
      const { data: old } = await db.from("text_messages").select("id,status,error").eq("client_key", input.clientKey).single();
      return { id: old?.id, status: old?.status, error: old?.error ?? undefined, duplicate: true };
    }
    if (error) throw new Error(error.message);
    return { id: data.id, status, error: extra.error as string | undefined };
  };

  if (!to) return record("blocked", { error: "not a mobile number" });
  if (!input.body.trim()) return record("blocked", { error: "empty text" });

  // Said STOP to this number?
  const { data: stopped } = await db.from("text_optouts").select("id").eq("phone", to)
    .filter("salon_id", usesPlatform ? "is" : "eq", usesPlatform ? null : salonId).maybeSingle();
  if (stopped) return record("blocked", { error: "replied STOP" });

  // Client said yes to texts at this salon, and we can prove it? The latest recorded answer (text_consents: when,
  // where, the words they saw) must be yes. A yes on file without a record counts as no: ask the client again.
  if (salonId && NEEDS_YES.includes(input.kind)) {
    const { data: ok, error: cErr } = await db.rpc("consent_ok", { p_salon: salonId, p_phone: to });
    if (cErr) throw new Error(cErr.message);
    if (!ok) return record("blocked", { error: "no recorded yes to texts from this client" });
  }

  const from = await senderFor(db, input.kind, salonId, to);
  if (from.test && !input.body.startsWith("(Test) ")) input = { ...input, body: `(Test) ${input.body}` };
  if (!smsConfigured()) return record("skipped", { error: "texting not switched on (no Twilio settings)" });
  if (!from.service && !from.phone) return record("skipped", { error: from.why });

  // Save first (one row per clientKey), then send: a retry with the same key never sends again.
  const row = await record("queued", { from_number: from.from });
  if (row.duplicate) return row;

  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!;
  const form = new URLSearchParams({ To: to, Body: input.body });
  if (from.service) form.set("MessagingServiceSid", from.service); else form.set("From", from.phone!);
  if (origin) form.set("StatusCallback", `${origin}/api/sms/status`);
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const j = (await r.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
    if (!r.ok || !j.sid) {
      const error = `${j.code ?? r.status}: ${j.message ?? "Twilio refused the text"}`;
      await db.from("text_messages").update({ status: "failed", error, updated_at: new Date().toISOString() }).eq("id", row.id);
      return { id: row.id, status: "failed", error };
    }
    await db.from("text_messages").update({ status: "sent", provider_sid: j.sid, updated_at: new Date().toISOString() }).eq("id", row.id);
    return { id: row.id, status: "sent" };
  } catch (e) {
    // Network trouble: the row stays 'queued' with the reason, so it can be sent again with the same key later.
    const error = `network: ${(e as Error).message}`;
    await db.from("text_messages").update({ error, updated_at: new Date().toISOString() }).eq("id", row.id);
    return { id: row.id, status: "queued", error };
  }
}

/** STOP / START from a reply: remember it per number, and keep the salon's client "said yes" in step. */
export async function setOptOut(db: SupabaseClient, phone: string, salonId: string | null, stop: boolean) {
  if (stop) {
    const { error } = await db.from("text_optouts").insert({ phone, salon_id: salonId });
    if (error && error.code !== "23505") throw new Error(error.message);
  } else {
    await db.from("text_optouts").delete().eq("phone", phone).filter("salon_id", salonId ? "eq" : "is", salonId);
  }
  // Through the database so the reply is recorded as proof (text_consents: source text_reply, the word they sent).
  if (salonId) {
    const { error } = await db.rpc("consent_text_reply", { p_salon: salonId, p_phone: phone, p_stop: stop, p_words: stop ? "STOP" : "START" });
    if (error) throw new Error(error.message);
  }
}
