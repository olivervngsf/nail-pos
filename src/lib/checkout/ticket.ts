// Checkout ticket: shape + money math. Pure functions, all integer cents (tested in ticket.test.ts).
// The server works the totals out again (save_ticket); these are for the screen.
import { percentOf, splitCents } from "@/lib/money";

export type ServiceLine = {
  id: string;
  serviceId?: string;
  name: string;
  minutes: number;
  cents: number;
  /** "$45+" service: final price set by the desk. */
  priceFrom?: boolean;
  priceSet?: boolean;
  staffId?: string;
  staffName?: string;
  /** The tech added this from their phone (ticket slip); addedAt = when. */
  fromPhone?: boolean;
  addedAt?: string;
};
export type Discount = { id: string; kind: "amt" | "pct"; value: number; reason: string; approvalId?: string; approvedBy?: string };
export type Payment = {
  id: string;
  method: "cash" | "card_reader" | "pay_link";
  /** Cash only: what the client handed over. */
  givenCents?: number;
  at: string;
  takenBy?: string;
  /** Card only (from Stripe): total charged incl. tip, the card fee the salon pays, card brand + last 4. */
  amountCents?: number;
  feeCents?: number;
  brand?: string;
  last4?: string;
};
/** @deprecated use Payment */
export type CashPayment = Payment;
/** Gift card sold (new digital / new plastic) or money added (reload) on this ticket. $0 until the ticket is paid. */
export type GiftSale = { id: string; cardId: string; last4: string; kind: "digital" | "plastic" | "reload"; cents: number; to?: string; from?: string; message?: string; code?: string };
/** Gift card used to pay part (or all) of this ticket. Money already off the card (server). */
export type LoyaltyReward = { id: string; cents: number; points: number };
export type GiftPay = { id: string; cardId: string; last4: string; cents: number; balanceAfter?: number };
/** Cash taken for part of an open ticket (split payment); the rest is paid by card, QR, gift card or more cash. No tip. */
export type CashPart = { id: string; cents: number; givenCents: number; at: string };
export type Ticket = {
  id: string;
  salonId: string;
  /** Every line id this desk has had on the ticket (incl. removed ones). The server only removes lines from this list,
   *  so services a tech adds from their phone (ticket slip) are never wiped by a desk save. */
  seenLineIds?: string[];
  number?: number;
  status: "open" | "paid" | "refunded";
  createdAt: string;
  /** Who the ticket is for. Phone is the normal key; `id` links a client picked from Clients who has no phone; name is kept on the ticket either way. */
  client?: { id?: string; phone: string; name: string; email?: string };
  lines: ServiceLine[];
  discount?: Discount;
  /** Cash tip per staff id, cents. */
  tips: Record<string, number>;
  note: string;
  payment?: Payment;
  gifts?: GiftSale[];
  giftPays?: GiftPay[];
  cashParts?: CashPart[];
  /** Loyalty reward the client asked to use (off the salon's share; techs paid on full price). */
  reward?: LoyaltyReward;
  openedBy?: string;
  deviceId?: string;
  /** Server has this exact version. */
  synced?: boolean;
  receipt?: "print" | "text" | "email" | "none";
  /** Where the last text / email receipt went (shown on the paid screen). */
  receiptTo?: string;
  /** Where the last text/email receipt went + what happened (shown on the paid screen). */
  receiptSent?: { channel: "text" | "email"; to: string; status: "sent" | "skipped" | "failed" | "queued" | "demo"; error?: string | null; at: string };
};

export function discountCents(subtotal: number, d?: Discount): number {
  if (!d) return 0;
  const raw = d.kind === "pct" ? percentOf(subtotal, d.value) : d.value;
  return Math.max(0, Math.min(subtotal, raw));
}

/**
 * subtotal (services) − discount = due (services after discount). Gift card sales are added on top (no discount, no tip).
 * toPay = what the client still pays before any tip (after gift cards used and cash parts taken). left = still owed incl. cash tips.
 */
export function totals(t: Pick<Ticket, "lines" | "discount" | "tips"> & { gifts?: GiftSale[]; giftPays?: GiftPay[]; cashParts?: CashPart[]; reward?: LoyaltyReward }) {
  const subtotal = t.lines.reduce((a, l) => a + l.cents, 0);
  const discount = discountCents(subtotal, t.discount);
  const reward = Math.min(t.reward?.cents ?? 0, subtotal - discount);
  const due = subtotal - discount - reward;
  const tip = Object.values(t.tips).reduce((a, c) => a + Math.max(0, c), 0);
  const gift = (t.gifts ?? []).reduce((a, g) => a + g.cents, 0);
  const giftPaid = (t.giftPays ?? []).reduce((a, g) => a + g.cents, 0);
  const cashPaid = (t.cashParts ?? []).reduce((a, c) => a + c.cents, 0);
  const total = due + gift + tip;
  return { subtotal, discount, reward, due, tip, gift, giftPaid, cashPaid, total, toPay: due + gift - giftPaid - cashPaid, left: total - giftPaid - cashPaid };
}

/** Cash: positive = change to give back, negative = still due. */
export const changeCents = (total: number, given: number) => given - total;

/** Quick "client gave" amounts: exact, then the next round bills. 4 unique, ascending. */
export function quickCash(total: number): number[] {
  const up = (step: number) => Math.ceil(total / step) * step;
  // Always offer the next big bill ($50 under $50, else $100) as the last choice.
  const big = total < 5000 ? up(5000) : up(10000);
  const mids = [...new Set([500, 1000, 2000, 5000].map(up))].filter((v) => v > total && v < big);
  const out = [...new Set([total, ...mids.slice(0, 2), big])];
  let x = out[out.length - 1];
  while (out.length < 4) { x = (Math.floor(x / 10000) + 1) * 10000; out.push(x); }
  return out;
}

/** People working on this ticket, in the order they first appear. */
export function staffOn(lines: ServiceLine[]): { id: string; name: string; cents: number }[] {
  const m = new Map<string, { id: string; name: string; cents: number }>();
  for (const l of lines) {
    if (!l.staffId) continue;
    const s = m.get(l.staffId) ?? { id: l.staffId, name: l.staffName ?? "", cents: 0 };
    s.cents += l.cents;
    m.set(l.staffId, s);
  }
  return [...m.values()];
}

/** Split one tip across staff by their service price (owner default). No cent lost. */
export function splitTipByPrice(tip: number, lines: ServiceLine[]): Record<string, number> {
  const staff = staffOn(lines);
  if (!staff.length || tip <= 0) return {};
  const weights = staff.map((s) => s.cents || 1);
  const parts = splitCents(tip, weights);
  return Object.fromEntries(staff.map((s, i) => [s.id, parts[i]]));
}

/** What still blocks "Charge": every service needs a person and a final price. */
export function blockers(t: Ticket): ("empty" | "staff" | "price")[] {
  const b: ("empty" | "staff" | "price")[] = [];
  if (!t.lines.length && !(t.gifts ?? []).length) b.push("empty");
  if (t.lines.some((l) => !l.staffId)) b.push("staff");
  if (t.lines.some((l) => l.priceFrom && !l.priceSet)) b.push("price");
  return b;
}

/** Payload for save_ticket (server checks + totals again). */
export function toPayload(t: Ticket) {
  const { subtotal } = totals(t);
  const lines: Record<string, unknown>[] = t.lines.map((l) => ({
    id: l.id, kind: "service", serviceId: l.serviceId, staffId: l.staffId, name: l.name, minutes: l.minutes, cents: l.cents, priceFrom: !!l.priceFrom,
  }));
  if (t.discount) {
    lines.push({ id: t.discount.id, kind: "discount", name: `${t.discount.reason} discount`, reason: t.discount.reason, cents: -discountCents(subtotal, t.discount), approvalId: t.discount.approvalId });
  }
  if (t.reward) lines.push({ id: t.reward.id, kind: "loyalty_reward", name: "Loyalty reward", cents: -t.reward.cents });
  for (const g of t.gifts ?? []) {
    lines.push({ id: g.id, kind: "gift_sale", giftCardId: g.cardId, name: `Gift card •••• ${g.last4}`, cents: g.cents });
  }
  for (const [staffId, cents] of Object.entries(t.tips)) {
    if (cents > 0) lines.push({ id: tipLineId(t.id, staffId), kind: "tip", staffId, name: "Cash tip", cents });
  }
  return {
    id: t.id, salonId: t.salonId, createdAt: t.createdAt, note: t.note, openedBy: t.openedBy, deviceId: t.deviceId,
    client: t.client && (t.client.phone || t.client.id || t.client.name.trim()) ? t.client : undefined, lines, payment: t.payment?.method === "cash" ? t.payment : undefined,
    seen: seenIds(t),
  };
}

/** Stable id for a staff member's tip line on a ticket (same ticket + person = same row). */
export function tipLineId(ticketId: string, staffId: string): string {
  // Mix the two uuids' hex into a new v4-shaped uuid, deterministic.
  const a = ticketId.replace(/-/g, ""), b = staffId.replace(/-/g, "");
  let h = "";
  for (let i = 0; i < 32; i++) h += ((parseInt(a[i] || "0", 16) ^ parseInt(b[31 - i] || "0", 16) ^ (i % 16)) & 15).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Short label until the server gives a number (offline ticket). */
export const ticketLabel = (t: Pick<Ticket, "id" | "number">) => (t.number ? `#${t.number}` : `· ${t.id.slice(0, 4).toUpperCase()}`);

/** Line ids this desk knows about: what it ever had + what it has now (services, discount, cash tips). */
export function seenIds(t: Ticket): string[] {
  const now = [...t.lines.map((l) => l.id), ...(t.discount ? [t.discount.id] : []), ...(t.reward ? [t.reward.id] : []), ...Object.keys(t.tips).map((s) => tipLineId(t.id, s))];
  return [...new Set([...(t.seenLineIds ?? []), ...now])];
}

/** Ticket slip: merge the server's copy of an open ticket into this desk's copy (this desk's own edits win).
 *  - Lines the server has that this desk never had (a tech added them from the slip QR) are added.
 *  - Lines a tech removed from their phone (techRemoved) are dropped here too, so a later desk save can't bring them back.
 *  A "$45+" line from a phone keeps priceSet=false (from the server's price_open) until the desk sets its final price. */
export function mergeOpen(mine: Ticket, server: Ticket, techRemoved: string[]): Ticket | null {
  const gone = new Set(techRemoved);
  const seen = new Set(mine.seenLineIds ?? []);
  const fresh = server.lines.filter((l) => !gone.has(l.id) && !seen.has(l.id) && !mine.lines.some((m) => m.id === l.id));
  const kept = mine.lines.filter((l) => !gone.has(l.id));
  // Cash parts taken on another desk: add them (a part this desk took stays, even before the server has it).
  const parts = [...(mine.cashParts ?? []), ...(server.cashParts ?? []).filter((c) => !(mine.cashParts ?? []).some((m) => m.id === c.id))];
  const newParts = parts.length !== (mine.cashParts ?? []).length;
  if (!fresh.length && kept.length === mine.lines.length && !newParts) return null;
  return { ...mine, number: mine.number ?? server.number, lines: [...kept, ...fresh], seenLineIds: [...new Set([...seen, ...fresh.map((l) => l.id)])],
    ...(newParts ? { cashParts: parts } : {}) };
}
