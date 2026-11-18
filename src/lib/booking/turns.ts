// Walk-ins + turn list: pure, tested (turns.test.ts). Facts only — the desk decides who takes the next client.
import type { Appt } from "./appts";
import { dayKey, minutesOf } from "./grid";

const WALK = new Set(["kiosk", "walk_in"]);
/** A walk-in still waiting (no tech, no ticket yet). */
export const isWaiting = (a: Appt) => WALK.has(a.source) && (a.status === "booked" || a.status === "confirmed") && !a.ticketId;
/** A booked client who checked in (kiosk or desk) and is waiting for their tech: arrived time set, no ticket yet. */
export const isHere = (a: Appt) => !WALK.has(a.source) && (a.status === "booked" || a.status === "confirmed") && !!a.arrivedAt && !a.ticketId;
/** Shown on the calendar grid (waiting walk-ins + walk-outs live in the waitlist instead; a walk-in moved to a later
 *  booking was never on the grid, so it isn't shown as a cancelled block either). */
export const onGrid = (a: Appt) => !isWaiting(a) && a.status !== "walked_out" && !(WALK.has(a.source) && a.status === "canceled" && !a.ticketId);
/** Minutes since they came in. */
export const waitedMin = (a: Pick<Appt, "start" | "arrivedAt">, now = Date.now()) => Math.max(0, Math.round((now - new Date(a.arrivedAt || a.start).getTime()) / 60_000));

/** Next ticket code for today's walk-ins: B1, B2, … (kiosk + desk share one line). */
export function nextWalkCode(appts: Appt[], day: string) {
  const n = appts.filter((a) => WALK.has(a.source) && dayKey(new Date(a.arrivedAt || a.start)) === day).length;
  return `B${n + 1}`;
}

/** Turns per tech = tickets they worked on that day (same as the server's desk_staff). */
export function turnCounts(tickets: { createdAt: string; status: string; lines: { staffId?: string }[] }[], day: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tickets) {
    if (t.status === "voided" || dayKey(new Date(t.createdAt)) !== day) continue;
    for (const id of new Set(t.lines.map((l) => l.staffId).filter(Boolean) as string[])) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

export type TurnFact = { id: string; name: string; clockedIn: boolean; turns: number; busyUntil: number | null; freeSince: number | null; nextAt: number | null };
/**
 * Turn order (facts, not a rule): free now first — fewest turns, then free the longest; then busy — soonest free;
 * then not clocked in. The first free one is "next turn".
 */
export function turnOrder(staff: { id: string; name: string; clockedIn: boolean; turns: number }[], dayAppts: Appt[], nowMin: number): TurnFact[] {
  const live = dayAppts.filter((a) => onGrid(a) && a.status !== "canceled" && a.status !== "no_show");
  const facts = staff.map((s) => {
    const mine = live.filter((a) => a.staffId === s.id).map((a) => ({ s: minutesOf(a.start), e: minutesOf(a.end) }));
    const busy = mine.find((x) => x.s <= nowMin && x.e > nowMin);
    const before = mine.filter((x) => x.e <= nowMin).map((x) => x.e);
    const next = mine.filter((x) => x.s > nowMin).map((x) => x.s).sort((a, b) => a - b)[0];
    return { ...s, busyUntil: busy ? busy.e : null, freeSince: busy ? null : before.length ? Math.max(...before) : 0, nextAt: next ?? null };
  });
  const rank = (f: TurnFact) => (!f.clockedIn ? 2 : f.busyUntil === null ? 0 : 1);
  return facts.sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 0 ? a.turns - b.turns || (a.freeSince ?? 0) - (b.freeSince ?? 0) : 0)
    || (rank(a) === 1 ? (a.busyUntil ?? 0) - (b.busyUntil ?? 0) : 0)
    || a.name.localeCompare(b.name));
}
