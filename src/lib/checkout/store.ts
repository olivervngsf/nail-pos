"use client";
// Tickets live on this device first (localStorage), then go to the server through the outbox.
// Same ticket id every time, so sending twice is safe. Paid tickets are frozen on the server.
import { useEffect, useState } from "react";
import { enqueue, registerHandler } from "@/lib/offline/outbox";
import { getSupabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/auth";
import { api } from "@/lib/api";
import type { ReceiptOutcome } from "./receiptSend";
import { mergeOpen, seenIds, toPayload, type Ticket } from "./ticket";

const KEY = "nailpos.tickets.v1";
const listeners = new Set<() => void>();
let cache: Record<string, Ticket> | null = null;
let live = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Live = signed in to a real salon: changes are sent to the server. Off = test copy (this device only).
 *  Turning live on re-sends tickets changed on this device that never reached the server (e.g. closed mid-edit). */
export function setLive(on: boolean) {
  const was = live;
  live = on;
  if (on && !was) for (const t of Object.values(load())) if (!t.synced && t.status === "open") void enqueue("ticket.save", JSON.parse(JSON.stringify(toPayload(t))));
}

/** Send edits still waiting out their 600 ms now (page is closing or going to the background). */
function flushTimers() {
  for (const [id, h] of timers) { clearTimeout(h); timers.delete(id); const cur = getTicket(id); if (cur && live) void enqueue("ticket.save", JSON.parse(JSON.stringify(toPayload(cur)))); }
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushTimers);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushTimers(); });
}
export const isLive = () => live;

function load(): Record<string, Ticket> {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { cache = {}; }
  return cache!;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

export const getTicket = (id: string): Ticket | undefined => load()[id];

/** Save a ticket change on this device and queue it for the server (edits wait 600 ms; payment goes now). */
export function putTicket(t: Ticket, opts: { now?: boolean } = {}) {
  load()[t.id] = { ...t, seenLineIds: seenIds(t), synced: false };
  persist();
  if (!live) return;
  clearTimeout(timers.get(t.id));
  const send = () => { timers.delete(t.id); const cur = getTicket(t.id); if (cur) void enqueue("ticket.save", JSON.parse(JSON.stringify(toPayload(cur)))); };
  if (opts.now) send(); else timers.set(t.id, setTimeout(send, 600));
}

/** Server copy merged in (another device's ticket); this device's own changes win. */
function merge(t: Ticket, techRemoved: string[]) {
  const c = load();
  const mine = c[t.id];
  if (!mine) c[t.id] = { ...t, synced: true };
  else if (t.status !== "open" && mine.status !== t.status) c[t.id] = { ...t, synced: true };
  else if (mine.status === "open" && t.status === "open") {
    const m = mergeOpen(mine, t, techRemoved);
    if (m) c[t.id] = m;
    else if (!mine.number && t.number) c[t.id] = { ...mine, number: t.number };
  } else if (!mine.number && t.number) c[t.id] = { ...mine, number: t.number };
}

export function useTicket(id: string) {
  const [t, setT] = useState<Ticket | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = () => setT(getTicket(id));
    f(); setReady(true);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, [id]);
  return [t, ready] as const;
}

export function useTickets(salonId: string) {
  const [list, setList] = useState<Ticket[]>([]);
  useEffect(() => {
    const f = () => setList(Object.values(load()).filter((t) => t.salonId === salonId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    f();
    listeners.add(f);
    return () => void listeners.delete(f);
  }, [salonId]);
  return list;
}

type Row = {
  id: string; number: number; status: "open" | "paid" | "refunded" | "voided"; created_at: string; note: string; opened_by: string | null;
  client: { id: string; phone: string | null; name: string; email: string | null } | null; client_name: string | null;
  ticket_lines: { id: string; kind: string; service_id: string | null; staff_id: string | null; name: string; minutes: number | null; amount_cents: number; price_from: boolean; reason: string | null; approval_id: string | null; removed_at: string | null; sort: number; gift_card_id: string | null;
    source: "desk" | "phone"; desk_seen_at: string | null; tech_removed_at: string | null; price_open: boolean }[];
  payments: { id: string; method: "cash" | "card_reader" | "pay_link" | "gift_card"; status: string; gift_card_id: string | null; given_cents: number | null; amount_cents: number; fee_cents: number; card_brand: string | null; card_last4: string | null; at: string; taken_by: string | null }[];
};

/** Today's tickets from the server (open ones from any desk + paid), merged into this device. */
export async function pullTickets(salonId: string, staffName: (id: string) => string, since: string, onlyId?: string) {
  const sb = getSupabase();
  if (!sb || !live) return;
  let q = sb.from("tickets")
    .select("id,number,status,created_at,note,opened_by,client_name,client:clients(id,phone,name,email),ticket_lines(id,kind,service_id,staff_id,name,minutes,amount_cents,price_from,reason,approval_id,removed_at,sort,gift_card_id,source,desk_seen_at,tech_removed_at,price_open),payments(id,method,status,gift_card_id,given_cents,amount_cents,fee_cents,card_brand,card_last4,at,taken_by)")
    .eq("salon_id", salonId).neq("status", "voided");
  q = onlyId ? q.eq("id", onlyId) : q.gte("created_at", since);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as unknown as Row[]) {
    const lines = r.ticket_lines.filter((l) => !l.removed_at).sort((a, b) => a.sort - b.sort);
    const disc = lines.find((l) => l.kind === "discount");
    // 'extra' = card money that came in for a stopped try (flagged to refund), not this ticket's payment.
    // Open ticket: cash already taken = parts of a split payment, not the final payment.
    const pay = r.status === "open" ? undefined
      : r.payments.filter((p) => p.method !== "gift_card" && p.status !== "canceled" && p.status !== "extra").sort((a, b) => b.at.localeCompare(a.at))[0];
    // Paid/refunded ticket: every other cash payment was a part of a split.
    const cashParts = r.payments.filter((p) => p.method === "cash" && p.id !== pay?.id && (p.status === "paid" || (r.status !== "open" && p.status === "refunded")))
      .map((p) => ({ id: p.id, cents: Number(p.amount_cents), givenCents: Number(p.given_cents ?? p.amount_cents), at: p.at }));
    const gifts = lines.filter((l) => l.kind === "gift_sale" && l.gift_card_id).map((l) => {
      const mine = getTicket(r.id)?.gifts?.find((g) => g.id === l.id);
      return mine ?? { id: l.id, cardId: l.gift_card_id!, last4: l.name.slice(-4), kind: "plastic" as const, cents: Number(l.amount_cents) };
    });
    const giftPays = r.payments.filter((p) => p.method === "gift_card" && p.status === "paid")
      .map((p) => ({ id: p.id, cardId: p.gift_card_id ?? "", last4: p.card_last4 ?? "", cents: Number(p.amount_cents) }));
    merge({
      id: r.id, salonId, number: r.number, status: r.status === "voided" ? "open" : r.status, createdAt: r.created_at, note: r.note,
      openedBy: r.opened_by ?? undefined,
      client: r.client ? { id: r.client.id, phone: r.client.phone ?? "", name: r.client.name || r.client_name || "", ...(r.client.email ? { email: r.client.email } : {}) }
        : r.client_name ? { phone: "", name: r.client_name } : undefined,
      lines: lines.filter((l) => l.kind === "service").map((l) => ({
        id: l.id, serviceId: l.service_id ?? undefined, name: l.name, minutes: l.minutes ?? 0, cents: l.amount_cents, priceFrom: l.price_from,
        // A "$45+" service a tech added from the slip: the desk sets its final price first (on any desk).
        priceSet: !(l.price_from && l.price_open),
        staffId: l.staff_id ?? undefined, staffName: l.staff_id ? staffName(l.staff_id) : undefined,
      })),
      discount: disc ? { id: disc.id, kind: "amt", value: -disc.amount_cents, reason: disc.reason ?? "", approvalId: disc.approval_id ?? undefined } : undefined,
      tips: Object.fromEntries(lines.filter((l) => l.kind === "tip" && l.staff_id).map((l) => [l.staff_id!, l.amount_cents])),
      gifts, giftPays, cashParts,
      reward: (() => { const rl = lines.find((l) => l.kind === "loyalty_reward"); return rl ? { id: rl.id, cents: -Number(rl.amount_cents), points: getTicket(r.id)?.reward?.points ?? 0 } : undefined; })(),
      payment: pay ? { id: pay.id, method: pay.method as "cash" | "card_reader" | "pay_link", givenCents: pay.given_cents ?? undefined, at: pay.at, takenBy: pay.taken_by ?? undefined,
        amountCents: Number(pay.amount_cents), feeCents: Number(pay.fee_cents), brand: pay.card_brand ?? undefined, last4: pay.card_last4 ?? undefined } : undefined,
    }, r.ticket_lines.filter((l) => l.tech_removed_at).map((l) => l.id));
    // Phone lines this desk now has but hasn't confirmed yet: tell the server, so the desk may remove them like any line.
    // Runs on every pull, so a failed ack is simply tried again next time.
    const have = getTicket(r.id);
    const unacked = r.status === "open" && have?.status === "open"
      ? lines.filter((l) => l.source === "phone" && !l.desk_seen_at && have.lines.some((x) => x.id === l.id)).map((l) => l.id) : [];
    if (unacked.length) void rpc("ack_ticket_lines", { p_ticket: r.id, p_ids: unacked }).catch(() => null);
  }
  persist();
}

registerHandler("ticket.save", async (item) => {
  const r = await rpc<{ id: string; number: number; status: string }>("save_ticket", { p: item.payload });
  const t = getTicket(r.id);
  if (t) { load()[r.id] = { ...t, number: r.number, synced: true }; persist(); }
});

registerHandler("ticket.cashPart", async (item) => {
  const p = item.payload as { paymentId: string; salonId: string; ticketId: string; cents: number; givenCents: number; takenBy?: string; at: string };
  const r = await rpc<{ ok: boolean; reason?: string }>("cash_part", { p });
  // Ticket got paid another way before this part reached the server: drop the part on this device.
  if (r && r.ok === false) { const t = getTicket(p.ticketId); if (t) { load()[t.id] = { ...t, cashParts: (t.cashParts ?? []).filter((c) => c.id !== p.paymentId) }; persist(); } }
});
registerHandler("ticket.cashPartUndo", async (item) => {
  await rpc("cash_part_undo", { p_payment: (item.payload as { paymentId: string }).paymentId });
});

/** Split payment: take part of an open ticket in cash now (saved on this device, sent in order after the ticket). */
export function takeCashPart(t: Ticket, cents: number, givenCents: number, takenBy?: string) {
  const part = { id: crypto.randomUUID(), cents, givenCents, at: new Date().toISOString() };
  putTicket({ ...t, cashParts: [...(t.cashParts ?? []), part] }, { now: true });
  if (live) void enqueue("ticket.cashPart", { paymentId: part.id, salonId: t.salonId, ticketId: t.id, cents, givenCents, takenBy, at: part.at });
  return part;
}
/** Take a cash part back (give the cash back to the client). */
export function undoCashPart(t: Ticket, partId: string) {
  putLocal({ ...t, cashParts: (t.cashParts ?? []).filter((c) => c.id !== partId) });
  if (live) void enqueue("ticket.cashPartUndo", { paymentId: partId });
}

registerHandler("ticket.receipt", async (item) => {
  const p = item.payload as { id: string; salonId: string; ticketId: string; channel: string; to?: string };
  await rpc("log_receipt", { p_id: p.id, p_salon: p.salonId, p_ticket: p.ticketId, p_channel: p.channel, p_to: p.to ?? null });
  // Text / email: send it now (once; the server records sent / skipped / failed on the receipt). Never blocks the outbox.
  if (p.channel === "text" || p.channel === "email") await api("/api/receipt/send", { id: p.id }).catch(() => undefined);
});

/** Text / email the receipt now and say what happened (one send per call). Offline or ticket not on the server yet:
 *  saved in the outbox, sends later. Test copy: nothing is sent. */
export async function sendReceipt(t: Ticket, channel: "text" | "email", to: string): Promise<ReceiptOutcome> {
  const keep = (r: ReceiptOutcome) => {
    const cur = getTicket(t.id) ?? t;
    // An email typed here also fills the client's empty email on file (server: log_receipt), so show it right away.
    const client = channel === "email" && cur.client && !cur.client.email ? { ...cur.client, email: to } : cur.client;
    putLocal({ ...cur, client, receipt: channel, receiptTo: to, receiptSent: { channel, to, ...r, at: new Date().toISOString() } });
    return r;
  };
  if (!live) return keep({ status: "demo" });
  const id = crypto.randomUUID();
  const payload = { id, salonId: t.salonId, ticketId: t.id, channel, to };
  if (typeof navigator !== "undefined" && navigator.onLine === false) { void enqueue("ticket.receipt", payload); return keep({ status: "queued" }); }
  try { await rpc("log_receipt", { p_id: id, p_salon: t.salonId, p_ticket: t.id, p_channel: channel, p_to: to }); }
  catch { void enqueue("ticket.receipt", payload); return keep({ status: "queued" }); }
  try { const r = await api<ReceiptOutcome>("/api/receipt/send", { id }); return keep({ status: r.status, error: r.error ?? null }); }
  catch (e) { return keep({ status: "failed", error: (e as Error).message }); }
}

export function logReceipt(t: Ticket, channel: "print" | "text" | "email" | "none", to?: string) {
  // An email typed here also fills the client's empty email on file (server: log_receipt), so show it right away.
  const client = channel === "email" && to && t.client && !t.client.email ? { ...t.client, email: to } : t.client;
  putLocal({ ...t, client, receipt: channel, receiptTo: channel === "text" || channel === "email" ? to : undefined });
  if (live) void enqueue("ticket.receipt", { id: crypto.randomUUID(), salonId: t.salonId, ticketId: t.id, channel, to });
}

/** Save the ticket on the server right now (card payments need the server's copy first). */
export async function saveNow(t: Ticket) {
  clearTimeout(timers.get(t.id));
  const r = await rpc<{ id: string; number: number; status: string }>("save_ticket", { p: JSON.parse(JSON.stringify(toPayload(t))) });
  load()[t.id] = { ...t, number: r.number, synced: true };
  persist();
  return r;
}

/** Server already has this change (gift card used, ticket paid by gift card): save it on the device only. */
export function patchLocal(id: string, patch: Partial<Ticket>) {
  const t = getTicket(id);
  if (t) putLocal({ ...t, ...patch, synced: true });
}

/** Local-only change (no server send), e.g. which receipt was picked. */
function putLocal(t: Ticket) { load()[t.id] = t; persist(); }
