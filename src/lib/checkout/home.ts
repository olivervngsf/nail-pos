// Checkout home (open tickets + paid today): the two layouts an owner can pick, and the facts both show.
// Pure functions (tested in home.test.ts).
import { blockers, totals, type Ticket } from "./ticket";

/** "list" = clean rows for a computer. "cards" = one big card per ticket for a touch screen. */
export type HomeLayout = "list" | "cards";
export const HOME_LAYOUTS: HomeLayout[] = ["list", "cards"];
export const asHomeLayout = (v: unknown): HomeLayout => (v === "cards" ? "cards" : "list");

/** Whole minutes a ticket has been open (never negative: clocks on two devices can differ a little). */
export const openMinutes = (createdAt: string, now: number) => Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
/** 8 → {m: 8}; 73 → {h: 1, m: 13}. The screen words it ("8 min", "1h 13 min"). */
export const hoursMins = (mins: number) => ({ h: Math.floor(mins / 60), m: mins % 60 });

/** Tech first names on a ticket, in ticket order, no repeats. */
export const techsOn = (t: Ticket) => [...new Set(t.lines.map((l) => (l.staffName ?? "").trim().split(/\s+/)[0]).filter(Boolean))];

/** Ready to charge from the list: nothing missing on the ticket and money still to take. */
export const canCharge = (t: Ticket) => t.status === "open" && blockers(t).length === 0 && totals(t).toPay > 0;

/** Open tickets, longest open first (the ones most likely waiting to pay). */
export const longestFirst = (open: Ticket[]) => [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** Tech filter chips: every tech with an open ticket + how many. */
export function techCounts(open: Ticket[]): { name: string; n: number }[] {
  const m = new Map<string, number>();
  for (const t of open) for (const name of techsOn(t)) m.set(name, (m.get(name) ?? 0) + 1);
  return [...m].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The top strip: what's still to collect, what was paid today (card vs cash), and tips. */
export function homeFacts(open: Ticket[], paid: Ticket[]) {
  const toCollect = open.reduce((a, t) => a + Math.max(0, totals(t).left), 0);
  let paidCents = 0, card = 0, cash = 0, tips = 0;
  for (const t of paid) {
    const s = totals(t);
    paidCents += s.total; tips += s.tip;
    // Split payment: cash parts are cash; the rest follows the final payment's method. Gift card money is neither.
    const rest = Math.max(0, s.total - s.giftPaid - s.cashPaid);
    cash += s.cashPaid + (t.payment?.method === "cash" ? rest : 0);
    card += t.payment && t.payment.method !== "cash" ? rest : 0;
  }
  return { toCollect, paidCents, card, cash, tips };
}
