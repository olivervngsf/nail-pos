// Live board (calendar left panel, Live board design): each tech's state right now, as facts. The desk decides.
// busy = a client in the chair now (or on a break) · soon = next booking within 15 min (or late, or client here)
// free = clocked in, nothing now · out = not clocked in. Times are seconds since midnight so countdowns tick.
import type { Appt } from "./appts";
import { isBlocked } from "./appts";
import { isHere, onGrid } from "./turns";

export type BoardState = "busy" | "break" | "soon" | "free" | "out";
export type BoardRow = {
  id: string; name: string; state: BoardState; turns: number;
  /** The booking this row is about: in the chair now (busy/break) or next up (soon). */
  appt: Appt | null;
  /** busy/break: seconds left. soon: seconds until start (negative = late). */
  secs: number | null;
  /** busy: 0–100 done. */
  pct: number;
  /** free: next booking start (seconds), null = free rest of day. soon: true when the client is already here. */
  nextAt: number | null; here: boolean;
};

const secOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); };
const SOON = 15 * 60;

export function liveBoard(staff: { id: string; name: string; clockedIn: boolean; turns: number }[], dayAppts: Appt[], nowSec: number): BoardRow[] {
  const live = dayAppts.filter((a) => onGrid(a) && a.status !== "canceled" && a.status !== "no_show" && a.status !== "done");
  const rows = staff.map((s): BoardRow => {
    const mine = live.filter((a) => a.staffId === s.id).sort((a, b) => a.start.localeCompare(b.start));
    const base = { id: s.id, name: s.name, turns: s.turns, appt: null, secs: null, pct: 0, nextAt: null, here: false };
    if (!s.clockedIn) return { ...base, state: "out" };
    // In the chair until the booked end; after that it's "ready for bill" on the grid and the tech counts as free (same as turns).
    const cur = mine.find((a) => secOf(a.start) <= nowSec && secOf(a.end) > nowSec && (a.status === "arrived" || isBlocked(a)));
    if (cur) {
      const st = secOf(cur.start), en = secOf(cur.end);
      return { ...base, state: isBlocked(cur) ? "break" : "busy", appt: cur, secs: en - nowSec, pct: Math.min(100, Math.max(0, Math.round(((nowSec - st) / Math.max(1, en - st)) * 100))) };
    }
    const next = mine.find((a) => !isBlocked(a) && a.status !== "arrived" && secOf(a.end) > nowSec);
    if (next && secOf(next.start) - nowSec <= SOON) return { ...base, state: "soon", appt: next, secs: secOf(next.start) - nowSec, here: isHere(next) };
    return { ...base, state: "free", nextAt: next ? secOf(next.start) : null };
  });
  const rank: Record<BoardState, number> = { busy: 0, break: 1, soon: 2, free: 3, out: 4 };
  return rows.sort((a, b) => rank[a.state] - rank[b.state]
    || (a.state === "busy" || a.state === "break" || a.state === "soon" ? (a.secs ?? 0) - (b.secs ?? 0) : 0)
    || (a.state === "free" ? a.turns - b.turns : 0)
    || a.name.localeCompare(b.name));
}

/** "36m" / "1h 05m" for waits; "12:04" / "+3:10" countdowns. */
export const mmss = (sec: number) => { const s = Math.abs(Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${sec < 0 ? "+" : ""}${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(x).padStart(2, "0")}`; };
export const waitLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${min}m`);
