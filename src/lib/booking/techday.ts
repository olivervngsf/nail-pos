// Tech app · My day (Tech App board T2): the rows of one day in time order, with free gaps of 30+ min between my
// clients and a "now" line on today. Pure, so it is tested and the same on every phone.
import type { Appt } from "./appts";

export type DayRow = { kind: "appt"; a: Appt } | { kind: "gap"; from: string; to: string } | { kind: "now" };

const ms = (iso: string) => new Date(iso).getTime();

/** Rows for one day. `now` (ms) = draw the now line (only pass it for today). Gaps of `gapMin`+ minutes. */
export function dayRows(list: Appt[], now?: number, gapMin = 30): DayRow[] {
  const sorted = [...list].sort((x, y) => ms(x.start) - ms(y.start));
  const rows: DayRow[] = [];
  let nowPlaced = now === undefined;
  const placeNow = (beforeMs: number) => {
    if (!nowPlaced && now! < beforeMs) { rows.push({ kind: "now" }); nowPlaced = true; }
  };
  sorted.forEach((a, i) => {
    placeNow(ms(a.start));
    rows.push({ kind: "appt", a });
    const nx = sorted[i + 1];
    if (nx && ms(nx.start) - ms(a.end) >= gapMin * 60000) {
      // Now falls in this free time: the line goes just above the gap (the gap is still open to book).
      placeNow(ms(nx.start));
      rows.push({ kind: "gap", from: a.end, to: nx.start });
    }
  });
  if (!nowPlaced && sorted.length) rows.push({ kind: "now" });
  return rows;
}

/** Whole minutes from `fromIso` to now (never below 0). */
export const minsSince = (fromIso: string, now = Date.now()) => Math.max(0, Math.round((now - ms(fromIso)) / 60000));

/** Whole minutes until `iso` (negative = already started). */
export const minsUntil = (iso: string, now = Date.now()) => Math.round((ms(iso) - now) / 60000);

/** "45 min", "1h 20 min", "2h" (no space before h: house style). `min` = the word for minutes ("phút" in Vietnamese). */
export function fmtMins(m: number, min = "min"): string {
  const n = Math.max(0, Math.round(m));
  const h = Math.floor(n / 60), r = n % 60;
  if (!h) return `${r} ${min}`;
  return r ? `${h}h ${r} ${min}` : `${h}h`;
}
