"use client";
// Bookings live on this device first, then go to the server through the outbox (works offline: drag, book, cancel).
// Whole booking sent each time with the device's edit time; the server keeps the newest edit.
import { useEffect, useState } from "react";
import { enqueue, registerHandler } from "@/lib/offline/outbox";
import { rpc } from "@/lib/auth";
import { isLive } from "@/lib/checkout/store";
import { DEMO_DESK } from "@/lib/desk";
import { at, dayKey } from "./grid";

export type ApptStatus = "booked" | "confirmed" | "arrived" | "done" | "no_show" | "canceled" | "walked_out" | "blocked";
/** A break / blocked time on a tech's column (no client). Counts as busy everywhere, never as a booking. */
export const isBlocked = (a: { status: string }) => a.status === "blocked";
export type ApptSource = "desk" | "phone" | "walk_in" | "web" | "google" | "text" | "staff" | "website" | "instagram" | "qr" | "kiosk" | "staff_phone";
export type ApptService = { serviceId?: string; name: string; minutes: number; cents: number };
export type Appt = {
  id: string; salonId: string; start: string; end: string; staffId?: string | null;
  client?: { id?: string; name: string; phone: string; care?: boolean; textsOk?: boolean;
    /** Number for the Call / Text buttons only (never shown): sent only to roles the owner allowed. */
    dial?: string };
  services: ApptService[]; status: ApptStatus; source: ApptSource; note: string;
  ticketId?: string | null; ticketStatus?: string | null; repeatRuleId?: string | null;
  repeat?: { id: string; everyWeeks: number; times: number };
  /** Walk-in: when they came in (start moves to when seated). */
  arrivedAt?: string | null;
  /** Optional: why the desk didn't give it to the next turn. */
  seatReason?: string | null;
  updatedAt: string; synced?: boolean;
};

const KEY = "nailpos.appts.v1";
const listeners = new Set<() => void>();
let cache: Record<string, Appt> | null = null;

function load(): Record<string, Appt> {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { cache = null; }
  if (!cache) cache = isLive() ? {} : demoSeed();
  return cache!;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

export const getAppt = (id: string) => load()[id];
export const allAppts = () => Object.values(load());

/** Save on this device and queue for the server. */
export function putAppt(a: Appt) {
  const next = { ...a, updatedAt: new Date().toISOString(), synced: false };
  load()[a.id] = next;
  persist();
  if (isLive()) void enqueue("appt.save", toPayload(next));
}

function toPayload(a: Appt) {
  return JSON.parse(JSON.stringify({
    id: a.id, salonId: a.salonId, start: a.start, end: a.end, staffId: a.staffId ?? null,
    client: a.client?.phone || a.client?.name || a.client?.id ? { id: a.client.id, phone: a.client.phone, name: a.client.name } : undefined,
    services: a.services, status: a.status, source: a.source, note: a.note, ticketId: a.ticketId ?? null, repeat: a.repeat, arrivedAt: a.arrivedAt ?? null, seatReason: a.seatReason ?? null, updatedAt: a.updatedAt,
  }));
}

/** Bookings that touch [from, to) for this salon, live-updating. */
export function useAppts(salonId: string, from: string, to: string) {
  const [list, setList] = useState<Appt[]>([]);
  useEffect(() => {
    const f = () => setList(Object.values(load()).filter((a) => a.salonId === salonId && a.start < to && a.end > from).sort((a, b) => a.start.localeCompare(b.start)));
    f();
    listeners.add(f);
    return () => void listeners.delete(f);
  }, [salonId, from, to]);
  return list;
}

/** Server copy merged in (other desks, booking page). This device's unsent edits win. */
export async function pullAppts(salonId: string, from: string, to: string) {
  if (!isLive()) return;
  merge(salonId, from, to, await rpc<Appt[]>("appt_list", { p_salon: salonId, p_from: from, p_to: to }));
}

/** Tech's phone: only my own bookings (no client phone numbers), via `my_appts`. */
export async function pullMyAppts(salonId: string, from: string, to: string, staffId: string) {
  if (!isLive()) return;
  merge(salonId, from, to, await rpc<Appt[]>("my_appts", { p_salon: salonId, p_from: from, p_to: to }), staffId);
}

function merge(salonId: string, from: string, to: string, rows: Appt[], onlyStaff?: string) {
  const c = load();
  const seen = new Set<string>();
  for (const r of rows) {
    seen.add(r.id);
    const mine = c[r.id];
    if (mine && !mine.synced && mine.updatedAt > r.updatedAt) continue;
    c[r.id] = { ...r, salonId, client: r.client ?? undefined, synced: true };
  }
  // Gone on the server (another salon / range edge): keep only unsent local ones.
  for (const a of Object.values(c)) if (a.salonId === salonId && a.start < to && a.end > from && a.synced && !seen.has(a.id) && (!onlyStaff || a.staffId === onlyStaff)) delete c[a.id];
  persist();
}

registerHandler("appt.save", async (item) => {
  const p = item.payload as { id: string; updatedAt: string };
  await rpc("appt_save", { p });
  const a = getAppt(p.id);
  if (a && a.updatedAt === p.updatedAt) { load()[p.id] = { ...a, synced: true }; persist(); }
});

/* ---------- test copy: a believable day for the sample salon ---------- */
function demoSeed(): Record<string, Appt> {
  const today = dayKey(new Date());
  const [kim, tuyet, ngoc] = DEMO_DESK.staff.map((s) => s.id);
  const svc = (name: string, minutes: number, cents: number): ApptService => ({ name, minutes, cents });
  const mk = (n: number, staffId: string, min: number, name: string, phone: string, s: ApptService[], status: ApptStatus, source: ApptSource, extra: Partial<Appt> = {}): Appt => {
    const dur = s.reduce((x, y) => x + y.minutes, 0);
    return { id: `demo-appt-${n}`, salonId: DEMO_DESK.salonId, start: at(today, min), end: at(today, min + dur), staffId, services: s, status, source, note: "",
      client: { name, phone, textsOk: true }, updatedAt: new Date(0).toISOString(), synced: true, ...extra };
  };
  const list = [
    mk(1, kim, 9 * 60 + 30, "Lan Tran", "+14085550142", [svc("Gel color manicure", 45, 4500)], "confirmed", "phone", { client: { name: "Lan Tran", phone: "+14085550142", care: true, textsOk: true } }),
    mk(2, kim, 11 * 60, "Mai Pham", "+14085550170", [svc("Acrylic full set", 75, 6000)], "booked", "web"),
    mk(3, tuyet, 10 * 60, "Sara Lopez", "+14085550155", [svc("Deluxe spa pedicure", 60, 5500)], "arrived", "desk"),
    mk(4, tuyet, 13 * 60 + 15, "Jen Park", "+14085550131", [svc("Spa pedicure", 45, 3500), svc("Gel color change - hands", 30, 3000)], "confirmed", "text"),
    mk(5, ngoc, 12 * 60, "Thu Le", "+14085550166", [svc("Dip powder", 60, 5000)], "booked", "google"),
    mk(6, kim, 11 * 60 + 30, "Rosa Diaz", "+14085550121", [svc("Fill", 45, 4000)], "booked", "phone"),
  ];
  return Object.fromEntries(list.map((a) => [a.id, a]));
}

/** New break on a tech's column (default 30 min). Saved like any booking: on the device first, then the server. */
export function newBreak(salonId: string, staffId: string, day: string, startMin: number, minutes = 30): Appt {
  return { id: crypto.randomUUID(), salonId, start: at(day, startMin), end: at(day, startMin + minutes), staffId,
    client: { name: "", phone: "" }, services: [], status: "blocked", source: "desk", note: "", updatedAt: "" };
}
