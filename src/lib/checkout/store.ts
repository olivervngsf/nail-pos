"use client";
// Tickets live on this device first (localStorage), then go to the server through the outbox.
// Same ticket id every time, so sending twice is safe. Paid tickets are frozen on the server.
import { useEffect, useState } from "react";
import { enqueue, registerHandler } from "@/lib/offline/outbox";
import { getSupabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/auth";
import { toPayload, type Ticket } from "./ticket";

const KEY = "nailpos.tickets.v1";
const listeners = new Set<() => void>();
let cache: Record<string, Ticket> | null = null;
let live = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Live = signed in to a real salon: changes are sent to the server. Off = test copy (this device only). */
export function setLive(on: boolean) { live = on; }

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
  load()[t.id] = { ...t, synced: false };
  persist();
  if (!live) return;
  clearTimeout(timers.get(t.id));
  const send = () => { timers.delete(t.id); const cur = getTicket(t.id); if (cur) void enqueue("ticket.save", JSON.parse(JSON.stringify(toPayload(cur)))); };
  if (opts.now) send(); else timers.set(t.id, setTimeout(send, 600));
}

/** Server copy merged in (another device's ticket); this device's own changes win. */
function merge(t: Ticket) {
  const c = load();
  const mine = c[t.id];
  if (!mine) c[t.id] = { ...t, synced: true };
  else if (!mine.number && t.number) c[t.id] = { ...mine, number: t.number };
  else if (mine.status === "open" && t.status === "paid") c[t.id] = { ...t, synced: true };
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
  id: string; number: number; status: "open" | "paid" | "voided"; created_at: string; note: string; opened_by: string | null;
  client: { phone: string | null; name: string } | null;
  ticket_lines: { id: string; kind: string; service_id: string | null; staff_id: string | null; name: string; minutes: number | null; amount_cents: number; price_from: boolean; reason: string | null; approval_id: string | null; removed_at: string | null; sort: number }[];
  payments: { id: string; given_cents: number | null; at: string; taken_by: string | null }[];
};

/** Today's tickets from the server (open ones from any desk + paid), merged into this device. */
export async function pullTickets(salonId: string, staffName: (id: string) => string, since: string) {
  const sb = getSupabase();
  if (!sb || !live) return;
  const { data, error } = await sb.from("tickets")
    .select("id,number,status,created_at,note,opened_by,client:clients(phone,name),ticket_lines(id,kind,service_id,staff_id,name,minutes,amount_cents,price_from,reason,approval_id,removed_at,sort),payments(id,given_cents,at,taken_by)")
    .eq("salon_id", salonId).neq("status", "voided").gte("created_at", since).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as unknown as Row[]) {
    const lines = r.ticket_lines.filter((l) => !l.removed_at).sort((a, b) => a.sort - b.sort);
    const disc = lines.find((l) => l.kind === "discount");
    const pay = r.payments[0];
    merge({
      id: r.id, salonId, number: r.number, status: r.status === "paid" ? "paid" : "open", createdAt: r.created_at, note: r.note,
      openedBy: r.opened_by ?? undefined,
      client: r.client?.phone ? { phone: r.client.phone, name: r.client.name } : undefined,
      lines: lines.filter((l) => l.kind === "service").map((l) => ({
        id: l.id, serviceId: l.service_id ?? undefined, name: l.name, minutes: l.minutes ?? 0, cents: l.amount_cents, priceFrom: l.price_from, priceSet: true,
        staffId: l.staff_id ?? undefined, staffName: l.staff_id ? staffName(l.staff_id) : undefined,
      })),
      discount: disc ? { id: disc.id, kind: "amt", value: -disc.amount_cents, reason: disc.reason ?? "", approvalId: disc.approval_id ?? undefined } : undefined,
      tips: Object.fromEntries(lines.filter((l) => l.kind === "tip" && l.staff_id).map((l) => [l.staff_id!, l.amount_cents])),
      payment: pay ? { id: pay.id, method: "cash", givenCents: pay.given_cents ?? 0, at: pay.at, takenBy: pay.taken_by ?? undefined } : undefined,
    });
  }
  persist();
}

registerHandler("ticket.save", async (item) => {
  const r = await rpc<{ id: string; number: number; status: string }>("save_ticket", { p: item.payload });
  const t = getTicket(r.id);
  if (t) { load()[r.id] = { ...t, number: r.number, synced: true }; persist(); }
});

registerHandler("ticket.receipt", async (item) => {
  const p = item.payload as { id: string; salonId: string; ticketId: string; channel: string; to?: string };
  await rpc("log_receipt", { p_id: p.id, p_salon: p.salonId, p_ticket: p.ticketId, p_channel: p.channel, p_to: p.to ?? null });
});

export function logReceipt(t: Ticket, channel: "print" | "text" | "email" | "none", to?: string) {
  putLocal({ ...t, receipt: channel });
  if (live) void enqueue("ticket.receipt", { id: crypto.randomUUID(), salonId: t.salonId, ticketId: t.id, channel, to });
}

/** Local-only change (no server send), e.g. which receipt was picked. */
function putLocal(t: Ticket) { load()[t.id] = t; persist(); }
