"use client";
// Gift cards at the desk: find a card, make a digital one for a sale, use one to pay, undo.
// Live = Supabase functions (all checks on the server). Test copy = cards kept on this device so staff can practice.
import { rpc } from "@/lib/auth";
import type { Desk } from "@/lib/desk";
import { patchLocal, saveNow } from "./store";
import { totals, type GiftPay, type Ticket } from "./ticket";

export type GiftCard = {
  id: string; last4: string; kind: "digital" | "plastic" | "paper"; status: "in_stock" | "active" | "used_up" | "locked" | "replaced" | "voided";
  balanceCents: number; soldAt?: string; sentTo?: string; fromName?: string; buyer?: string; replacedByLast4?: string;
};
/** reason: locked_out, typo, not_found, other_salon, not_sold, locked, replaced, voided, used_up */
export type GiftResult = { ok: boolean; reason?: string; card?: GiftCard };
type Raw = { ok: boolean; reason?: string | null; card?: { id: string; last4: string; kind: GiftCard["kind"]; status: GiftCard["status"]; balance_cents: number; sold_at?: string; sent_to?: string; from_name?: string; buyer?: string; replaced_by_last4?: string } };

const fromRaw = (r: Raw): GiftResult => ({
  ok: r.ok, reason: r.reason ?? undefined,
  card: r.card && { id: r.card.id, last4: r.card.last4, kind: r.card.kind, status: r.card.status, balanceCents: Number(r.card.balance_cents),
    soldAt: r.card.sold_at ?? undefined, sentTo: r.card.sent_to ?? undefined, fromName: r.card.from_name ?? undefined, buyer: r.card.buyer ?? undefined,
    replacedByLast4: r.card.replaced_by_last4 ?? undefined },
});
export const norm = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const pretty = (code: string) => {
  const c = norm(code);
  return /^\d{16}$/.test(c) ? c.replace(/(\d{4})(?=\d)/g, "$1 ") : c.replace(/(.{4})(?=.)/g, "$1-");
};

/* ---------- test copy (this device only) ---------- */
type DemoCard = GiftCard & { code: string; soldTicket?: string };
const KEY = "nailpos.demoGifts.v1";
const seed = (): DemoCard[] => [
  { id: "demo-gc-1", code: "MAIN7K3Q9XPA2T4F", last4: "2T4F", kind: "digital", status: "active", balanceCents: 5000, soldAt: "2026-11-02", sentTo: "+14085550199", fromName: "Lan", buyer: "Lan Tran" },
  { id: "demo-gc-2", code: "6012345678900147", last4: "0147", kind: "plastic", status: "in_stock", balanceCents: 0 },
  { id: "demo-gc-3", code: "6012345678900148", last4: "0148", kind: "plastic", status: "in_stock", balanceCents: 0 },
  { id: "demo-gc-4", code: "MAINQ4VC8MQD0102", last4: "0102", kind: "digital", status: "locked", balanceCents: 4000, replacedByLast4: "8MQD" },
];
function demoCards(): DemoCard[] {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* blocked */ }
  return seed();
}
function demoSave(c: DemoCard[]) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* blocked */ } }
const demoResult = (c: DemoCard): GiftResult => {
  const reason = { in_stock: "not_sold", active: undefined, used_up: "used_up", locked: "locked", replaced: "replaced", voided: "voided" }[c.status];
  const card: GiftCard = { id: c.id, last4: c.last4, kind: c.kind, status: c.status, balanceCents: c.balanceCents, soldAt: c.soldAt, sentTo: c.sentTo, fromName: c.fromName, buyer: c.buyer, replacedByLast4: c.replacedByLast4 };
  return { ok: c.status === "active", reason, card };
};
/** All test-copy cards (owner page in the test copy). */
export const demoGiftList = () => demoCards();

/** Test copy: when a ticket is paid, cards sold on it get their money (same rule as the server). */
export function demoSettle(t: Ticket) {
  if (t.status !== "paid" || !t.gifts?.length) return;
  const cards = demoCards();
  let changed = false;
  for (const g of t.gifts) {
    const c = cards.find((x) => x.id === g.cardId);
    if (!c || c.soldTicket === t.id) continue;
    c.balanceCents += g.cents; c.status = "active"; c.soldTicket = t.id; c.soldAt = new Date().toISOString(); c.buyer = c.buyer ?? t.client?.name;
    changed = true;
  }
  if (changed) demoSave(cards);
}

/* ---------- desk ---------- */
export async function giftLookup(desk: Desk, code: string): Promise<GiftResult> {
  if (desk.mode === "demo") {
    const c = demoCards().find((x) => x.code === norm(code));
    return c ? demoResult(c) : { ok: false, reason: norm(code).length === 16 ? "not_found" : "typo" };
  }
  return fromRaw(await rpc<Raw>("gift_lookup", { p_salon: desk.salonId, p_code: code }));
}

export async function giftFind(desk: Desk, phone: string, clientId?: string): Promise<GiftResult[]> {
  if (desk.mode === "demo") return demoCards().filter((c) => c.sentTo === phone && c.status !== "in_stock").map(demoResult);
  return (await rpc<Raw[]>("gift_find", { p_salon: desk.salonId, p_phone: phone, p_client: clientId ?? null })).map(fromRaw);
}

/** New digital card for a sale. The code shows on the receipt (and goes by text once texting is on). */
export async function giftPrepareDigital(desk: Desk, to: string, from: string, message: string): Promise<{ id: string; code: string; last4: string }> {
  if (desk.mode === "demo") {
    const a = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const code = "MAIN" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => a[b % 32]).join("");
    const card: DemoCard = { id: crypto.randomUUID(), code, last4: code.slice(-4), kind: "digital", status: "in_stock", balanceCents: 0, sentTo: to || undefined, fromName: from || undefined };
    demoSave([...demoCards(), card]);
    return { id: card.id, code: pretty(code), last4: card.last4 };
  }
  return rpc("gift_prepare_digital", { p_salon: desk.salonId, p_to: to, p_from: from, p_message: message });
}

type UseRes = { ok: boolean; reason?: string; used_cents?: number; balance_after?: number; left_cents?: number; status?: string; last4?: string; repeat?: boolean };

/** Pay with a gift card: money comes off now. Returns the refusal reason, or null when done. */
export async function giftUse(desk: Desk, t: Ticket, card: GiftCard, cents: number, takenBy?: string): Promise<string | null> {
  const id = crypto.randomUUID();
  if (desk.mode === "demo") {
    const cards = demoCards();
    const c = cards.find((x) => x.id === card.id);
    if (!c || c.status !== "active") return c ? demoResult(c).reason ?? "not_found" : "not_found";
    if (t.gifts?.some((g) => g.cardId === c.id)) return "same_ticket";
    const amt = Math.min(cents, c.balanceCents, leftAfter(t, t.giftPays ?? []));
    if (amt <= 0) return "used_up";
    c.balanceCents -= amt;
    if (!c.balanceCents) c.status = "used_up";
    demoSave(cards);
    const pays: GiftPay[] = [...(t.giftPays ?? []), { id, cardId: c.id, last4: c.last4, cents: amt, balanceAfter: c.balanceCents }];
    const paid = leftAfter(t, pays) <= 0;
    patchLocal(t.id, { giftPays: pays, ...(paid ? { status: "paid" as const } : {}) });
    return null;
  }
  const saved = await saveNow(t);
  const r = await rpc<UseRes>("gift_use", { p: { paymentId: id, salonId: desk.salonId, ticketId: t.id, cardId: card.id, cents, takenBy } });
  if (!r.ok) return r.reason ?? "not_found";
  const pays: GiftPay[] = [...(t.giftPays ?? []), { id, cardId: card.id, last4: r.last4 ?? card.last4, cents: Number(r.used_cents), balanceAfter: Number(r.balance_after) }];
  patchLocal(t.id, { number: saved.number, giftPays: pays, ...(r.status === "paid" ? { status: "paid" as const } : {}) });
  return null;
}

/** Undo a gift card payment on an open ticket: the money goes back on the card. */
export async function giftUndo(desk: Desk, t: Ticket, payId: string) {
  const p = t.giftPays?.find((x) => x.id === payId);
  if (!p) return;
  if (desk.mode === "demo") {
    const cards = demoCards();
    const c = cards.find((x) => x.id === p.cardId);
    if (c) { c.balanceCents += p.cents; c.status = "active"; demoSave(cards); }
  } else {
    await rpc("gift_undo", { p_payment: payId });
  }
  patchLocal(t.id, { giftPays: (t.giftPays ?? []).filter((x) => x.id !== payId) });
}

/** Cash/card still owed after these gift card payments (incl. cash tips). */
const leftAfter = (t: Ticket, pays: GiftPay[]) => totals({ ...t, giftPays: pays }).left;

/* ---------- owner / manager ---------- */
export type GiftRow = { id: string; last4: string; kind: string; status: GiftCard["status"]; made_by: string; balance_cents: number; sold_at: string | null; buyer: string | null; sent_to: string | null; replaced_by_last4: string | null; last_used: string | null };
export type GiftSummary = { owed_cents: number; active: number; in_stock_plastic: number; sold_month_cents: number; used_month_cents: number; settings: { on: boolean; amounts: number[]; min_cents: number; max_cents: number }; prefix: string };
