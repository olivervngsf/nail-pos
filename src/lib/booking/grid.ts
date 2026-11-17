// Calendar math: pure, tested (grid.test.ts). Minutes since midnight in the salon's local day.

export const SNAP = 15;
export const snap = (min: number, step = SNAP) => Math.round(min / step) * step;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Local date "YYYY-MM-DD" for a Date. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromDayKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const minutesOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
/** ISO time for a local day + minutes since midnight. */
export const at = (day: string, min: number) => { const d = fromDayKey(day); d.setMinutes(min); return d.toISOString(); };
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)); // Monday
export const fmtMin = (min: number) => { const h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? "PM" : "AM"; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`; };

type Span = { id: string; start: number; end: number };
/** Side-by-side lanes for overlapping bookings in one column. Returns id → {lane, lanes}. Nothing is moved in time. */
export function lanes(items: Span[]): Record<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Record<string, { lane: number; lanes: number }> = {};
  let group: Span[] = [], groupEnd = -1, laneEnds: number[] = [];
  const flush = () => { const n = laneEnds.length; for (const g of group) out[g.id].lanes = n; group = []; laneEnds = []; };
  for (const it of sorted) {
    if (it.start >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
    out[it.id] = { lane, lanes: 1 };
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return out;
}

/** Ids that overlap another live item in the same column. */
export function overlapping(items: Span[]): Set<string> {
  const s = new Set<string>();
  for (const a of items) for (const b of items) if (a.id !== b.id && a.start < b.end && b.start < a.end) s.add(a.id);
  return s;
}

/** Repeat: the start dates (YYYY-MM-DD) for "every N weeks, T times", first one included. */
export const repeatDays = (first: string, everyWeeks: number, times: number) =>
  Array.from({ length: times }, (_, i) => dayKey(addDays(fromDayKey(first), i * everyWeeks * 7)));

/** Free at this time? (no live booking for that staff overlapping [start, end)). */
export const isFree = (busy: Span[], start: number, end: number) => !busy.some((b) => b.start < end && start < b.end);
