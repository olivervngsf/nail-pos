// Desk starts a card payment for a ticket: on the card reader (client tips + taps there), as a pay link / QR, or on the
// small reader next to a handheld terminal running our app ("app": the tip is picked on the terminal's screen first).
// Amount comes from the server's copy of the ticket, never from the device.
import { asServer, asUser, ensureLocation, fail, getStripe, originOf, stopTry, testMode } from "@/lib/server/pay";

export const runtime = "nodejs";

type Info = { salon_id: string; number: number; status: string; due_cents: number; account_id: string | null; charges_enabled: boolean; salon_name: string };

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Card payments aren't switched on yet.");
  const { ticketId, method, readerId, by, tipCents } = (await req.json().catch(() => ({}))) as { ticketId?: string; method?: "reader" | "link" | "app"; readerId?: string; by?: string; tipCents?: number };
  const { data, error } = await sb.rpc("pay_info", { p_ticket: ticketId });
  const info = (data as Info[] | null)?.[0];
  if (error || !info) return fail(403, "Can't charge this ticket.");
  if (info.status !== "open") return fail(409, "This ticket is already paid.");
  if (!info.account_id || !info.charges_enabled) return fail(409, "Connect Stripe in setup first.");
  if (info.due_cents < 50) return fail(400, "Card payments start at $0.50.");
  const opts = { stripeAccount: info.account_id };
  const meta = { ticket_id: ticketId!, salon_id: info.salon_id, ticket_number: String(info.number) };
  // Stop older tries in Stripe too (reader, pay page) so the client can't pay twice. If one was already paid, stop here.
  const { data: old } = await db.from("pay_requests").select("id").eq("ticket_id", ticketId).eq("status", "pending");
  for (const o of old ?? []) {
    if ((await stopTry(o.id, "replaced by a new try")) === "paid") return fail(409, "This ticket is already paid.");
  }
  const createdBy = by ? (await db.from("memberships").select("id").eq("id", by).eq("salon_id", info.salon_id).maybeSingle()).data?.id ?? null : null;

  if (method === "app") {
    // The app's reader kit takes the card for this payment; it gets only the client secret. Amount = ticket + tip.
    const tip = Math.round(Number(tipCents) || 0);
    if (tip < 0 || tip > Math.max(info.due_cents * 2, 50000)) return fail(400, "That tip doesn't look right.");
    let locationId: string;
    try { locationId = (await ensureLocation(info.salon_id)).locationId; } catch (e) { return fail(409, (e as Error).message); }
    const { data: pr } = await db.from("pay_requests").insert({ salon_id: info.salon_id, ticket_id: ticketId, method: "card_reader", amount_cents: info.due_cents, created_by: createdBy }).select("id").single();
    const pi = await st.paymentIntents.create({
      amount: info.due_cents + tip, currency: "usd", allowed_payment_method_types: ["card_present"], capture_method: "automatic",
      description: `${info.salon_name} · ticket #${info.number}`, metadata: { ...meta, pay_request: pr!.id, tip_cents: String(tip) },
    }, { ...opts, idempotencyKey: `pi-${pr!.id}` });
    await db.from("pay_requests").update({ payment_intent: pi.id }).eq("id", pr!.id);
    return Response.json({ id: pr!.id, secret: pi.client_secret, locationId, test: testMode() });
  }

  if (method === "reader") {
    const { data: rd } = await db.from("card_readers").select("id").eq("id", readerId).eq("salon_id", info.salon_id).is("archived_at", null).maybeSingle();
    if (!rd) return fail(400, "Pick a card reader.");
    const { data: pr } = await db.from("pay_requests").insert({ salon_id: info.salon_id, ticket_id: ticketId, method: "card_reader", amount_cents: info.due_cents, reader_id: rd.id, created_by: createdBy }).select("id").single();
    const pi = await st.paymentIntents.create({
      amount: info.due_cents, currency: "usd", allowed_payment_method_types: ["card_present"], capture_method: "automatic",
      description: `${info.salon_name} · ticket #${info.number}`, metadata: { ...meta, pay_request: pr!.id },
    }, { ...opts, idempotencyKey: `pi-${pr!.id}` });
    await db.from("pay_requests").update({ payment_intent: pi.id }).eq("id", pr!.id);
    try {
      await st.terminal.readers.processPaymentIntent(rd.id, { payment_intent: pi.id }, opts);
    } catch (e) {
      await db.from("pay_requests").update({ status: "failed", error: (e as Error).message }).eq("id", pr!.id);
      return fail(409, /busy|in progress/i.test((e as Error).message) ? "The reader is busy. Cancel on the reader, then try again." : "Can't reach the card reader. Check it's on and online.");
    }
    return Response.json({ id: pr!.id });
  }

  const { data: pr } = await db.from("pay_requests").insert({ salon_id: info.salon_id, ticket_id: ticketId, method: "pay_link", amount_cents: info.due_cents, created_by: createdBy }).select("id").single();
  return Response.json({ id: pr!.id, url: `${originOf(req)}/pay/${pr!.id}` });
}
