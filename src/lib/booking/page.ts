"use client";
// Public booking page data (polishosapp.com/<salon>): no sign-in. The server re-checks every booking under a lock,
// so the page can never double-book. Slug "demo" (or no Supabase) = the test salon, booked into this device's calendar.
import { rpc } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { DEMO_DESK } from "@/lib/desk";
import { defaultHours, toMin } from "@/lib/onboarding/data";
import { allAppts, putAppt, type ApptSource } from "./appts";
import { addDays, at, dayKey, freeStarts, fromDayKey, minutesOf } from "./grid";

export const DEMO_SLUG = "demo";
export type PageService = { id: string; cat: string; name: string; minutes: number; cents: number; from: boolean };
export type PageStaff = { id: string; name: string };
export type PageHours = { weekday: number; open: boolean; opens: string | null; closes: string | null };
export type PageRules = { on?: boolean; days_ahead: number; latest_before_close: number; group_max: number; cancel_hours: number; min_notice: number; calendar_note?: string };
export type BookPage = {
  salon: { name: string; phone: string | null; address: string | null; slug: string; timeZone?: string; settings: PageRules };
  hours: PageHours[]; photos: { path: string; label: string }[]; services: PageService[]; staff: PageStaff[];
};
export type Guest = { name?: string; serviceIds: string[]; staffId?: string | null };
export type BookResult = { ok: true; ids: string[]; staff: string[] } | { ok: false; reason: "taken" | "closed" | "too_many" | "bad" };

const RULES: PageRules = { days_ahead: 30, latest_before_close: 60, group_max: 6, cancel_hours: 2, min_notice: 30 };
const isDemo = (slug: string) => slug === DEMO_SLUG || !getSupabase();
export const photoUrl = (path: string) => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return path.startsWith("demo:") || !base ? "" : `${base}/storage/v1/object/public/salon-photos/${path}`;
};
/** Where this visit came from (?src=google|website|instagram|qr|text), kept on the booking. */
export const sourceOf = (src: string | null): ApptSource =>
  (["google", "website", "instagram", "qr", "text"] as const).find((s) => s === src) ?? "web";

/** Test version: the note the owner typed in Settings → Booking page (saved on this device). */
const demoNote = () => {
  try { const c = JSON.parse(localStorage.getItem("nailpos.demoBookPage.v1") || "null"); if (typeof c?.settings?.calendar_note === "string") return c.settings.calendar_note; } catch { /* */ }
  return "Parking: free lot behind the salon. Running late? Call us.";
};

function demoPage(): BookPage {
  return {
    salon: { name: DEMO_DESK.salonName, phone: "(408) 555-0100", address: "1234 Story Rd, San Jose, CA", slug: DEMO_SLUG, timeZone: "America/Los_Angeles", settings: { ...RULES, calendar_note: demoNote() } },
    hours: defaultHours().map((h, i) => ({ weekday: i, open: h.on, opens: h.open, closes: h.close })),
    photos: [{ path: "demo:1", label: "Salon" }, { path: "demo:2", label: "Gel art" }, { path: "demo:3", label: "Pedi chairs" }, { path: "demo:4", label: "Nail art" }],
    services: DEMO_DESK.services.map((s) => ({ id: s.id, cat: s.cat, name: s.name, minutes: s.minutes, cents: s.cents, from: s.priceFrom })),
    staff: DEMO_DESK.staff.filter((s) => s.role === "tech").map((s) => ({ id: s.id, name: s.name })),
  };
}

export async function loadPage(slug: string): Promise<BookPage | null> {
  if (isDemo(slug)) return slug === DEMO_SLUG ? demoPage() : null;
  const p = await rpc<BookPage | null>("book_page", { p_slug: slug });
  return p && { ...p, salon: { ...p.salon, settings: { ...RULES, ...p.salon.settings } } };
}

/** Hours for a day (weekday 0 = Monday). */
export const hoursOn = (page: BookPage, day: string) => {
  const w = (fromDayKey(day).getDay() + 6) % 7;
  const h = page.hours.find((x) => x.weekday === w);
  return h?.open && h.opens && h.closes ? { open: toMin(h.opens), close: toMin(h.closes) } : null;
};

/** Days a client can pick (today … days_ahead), open days only. */
export function bookDays(page: BookPage, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i <= page.salon.settings.days_ahead && out.length < 21; i++) {
    const d = dayKey(addDays(from, i));
    if (hoursOn(page, d)) out.push(d);
  }
  return out;
}

/** Busy spans for one tech on a day, from this device's calendar (test salon). */
function demoBusy(staffId: string, day: string) {
  return allAppts().filter((a) => a.staffId === staffId && a.status !== "canceled" && a.status !== "no_show" && dayKey(new Date(a.start)) === day)
    .map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) }));
}
function demoFree(page: BookPage, day: string, staffId: string | null, minutes: number, publicPage = true): Record<number, string[]> {
  const h = hoursOn(page, day);
  if (!h) return {};
  const now = new Date();
  const notBefore = day === dayKey(now) ? now.getHours() * 60 + now.getMinutes() + (publicPage ? page.salon.settings.min_notice : 0) : 0;
  const close = day === dayKey(now) && publicPage ? Math.min(h.close, h.close - page.salon.settings.latest_before_close + minutes) : h.close;
  const out: Record<number, string[]> = {};
  for (const s of page.staff) {
    if (staffId && s.id !== staffId) continue;
    for (const m of freeStarts(demoBusy(s.id, day), h.open, close, minutes, notBefore)) (out[m] ??= []).push(s.id);
  }
  return out;
}

/** Free start times (minutes) that fit every guest (each guest needs a different tech). */
export async function loadSlots(page: BookPage, day: string, guests: { staffId?: string | null; minutes: number }[]): Promise<number[]> {
  if (isDemo(page.salon.slug)) {
    const per = guests.map((g) => demoFree(page, day, g.staffId ?? null, g.minutes));
    const starts = Object.keys(per[0] ?? {}).map(Number).sort((a, b) => a - b);
    return starts.filter((m) => assign(per.map((p) => p[m] ?? [])) !== null);
  }
  const lists = await Promise.all(guests.map((g) => rpc<number[]>("book_slots", { p_slug: page.salon.slug, p_day: day, p_staff: g.staffId ?? null, p_minutes: g.minutes })));
  return lists.reduce((a, b) => a.filter((m) => b.includes(m)));
}

/** One different tech per guest (in order), or null. */
function assign(options: string[][]): string[] | null {
  const used: string[] = [];
  for (const o of options) { const s = o.find((x) => !used.includes(x)); if (!s) return null; used.push(s); }
  return used;
}

/** Returning client: first name only. */
export async function hello(slug: string, phone: string): Promise<string | null> {
  if (isDemo(slug)) return phone === "+14085550142" ? "Lan" : null;
  const r = await rpc<{ first: string } | null>("book_hello", { p_slug: slug, p_phone: phone }).catch(() => null);
  return r?.first ?? null;
}

export async function book(page: BookPage, p: { src: ApptSource; day: string; start: number; phone: string; name: string; textsOk: boolean; note: string; guests: Guest[] }): Promise<BookResult> {
  if (!isDemo(page.salon.slug)) return rpc<BookResult>("book_create", { p: { ...p, slug: page.salon.slug } });
  const svc = (g: Guest) => page.services.filter((s) => g.serviceIds.includes(s.id));
  const mins = (g: Guest) => svc(g).reduce((a, s) => a + s.minutes, 0);
  const staff = assign(p.guests.map((g) => demoFree(page, p.day, g.staffId ?? null, mins(g))[p.start] ?? []));
  if (!staff) return { ok: false, reason: "taken" };
  const ids = p.guests.map((g, i) => {
    const id = crypto.randomUUID();
    putAppt({ id, salonId: DEMO_DESK.salonId, start: at(p.day, p.start), end: at(p.day, p.start + mins(g)), staffId: staff[i],
      client: { name: i === 0 ? p.name : g.name || `${p.name} (guest)`, phone: i === 0 ? p.phone : "", textsOk: p.textsOk },
      services: svc(g).map((s) => ({ serviceId: s.id, name: s.name, minutes: s.minutes, cents: s.cents })), status: "booked", source: p.src, note: p.note, updatedAt: "" });
    return id;
  });
  return { ok: true, ids, staff: staff.map((s) => page.staff.find((x) => x.id === s)?.name ?? "") };
}
