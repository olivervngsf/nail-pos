// Timesheet (Settings → Team + time clock → Timesheet): turn clock punches into pairs, hours, breaks and flags.
// California rules as plain facts, not payroll: overtime after 8h a day or 40h a week; a meal break of 30 min
// before the 5th hour. The owner decides what to do; we only show it.
import type { Role } from "./auth";

export type Fix = { old_at: string | null; reason: string; note: string | null; by: string; at: string };
export type Punch = { id: number; kind: "in" | "out"; at: string; day: string; via: string | null; device: string | null; fix: Fix | null };
export type Refused = { at: string; day: string; reason: string | null };
export type TsRow = { membership_id: string; name: string; role: Role; events: Punch[]; refused: Refused[] };

export type Pair = { in: Punch | null; out: Punch | null; open?: boolean };
export type Day = {
  day: string;
  pairs: Pair[];
  workedMin: number;
  breakMin: number;
  openNow: boolean;      // clocked in right now (today only)
  missingOut: boolean;   // a past day still clocked in, or an out with no in: needs a fix
  mealLate: boolean;     // more than 5h of work before a 30-min break
  over8: boolean;
  refused: Refused[];
};

const MEAL_AFTER = 5 * 60, MEAL_MIN = 30, DAY_OT = 8 * 60, WEEK_OT = 40 * 60;
const mins = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));

/** One person's day: punches in order → pairs, worked + break minutes and flags. */
export function buildDay(day: string, punches: Punch[], today: string, nowIso: string, refused: Refused[] = []): Day {
  const list = punches.filter((p) => p.day === day).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const pairs: Pair[] = [];
  let cur: Punch | null = null;
  let missingOut = false;
  for (const p of list) {
    if (p.kind === "in") {
      if (cur) { pairs.push({ in: cur, out: null }); missingOut = true; }
      cur = p;
    } else if (cur) { pairs.push({ in: cur, out: p }); cur = null; }
    else { pairs.push({ in: null, out: p }); missingOut = true; }
  }
  let openNow = false;
  if (cur) {
    if (day === today) { pairs.push({ in: cur, out: null, open: true }); openNow = true; }
    else { pairs.push({ in: cur, out: null }); missingOut = true; }
  }
  let worked = 0, breaks = 0, mealLate = false, mealOk = false, lastOut: string | null = null;
  for (const pr of pairs) {
    if (!pr.in) continue;
    if (lastOut) {
      const gap = mins(lastOut, pr.in.at);
      breaks += gap;
      if (gap >= MEAL_MIN && worked <= MEAL_AFTER) mealOk = true;
    }
    const end = pr.out ? pr.out.at : pr.open ? nowIso : null;
    if (!end) { lastOut = null; continue; }
    const len = mins(pr.in.at, end);
    if (!mealOk && worked + len > MEAL_AFTER) mealLate = true;
    worked += len;
    lastOut = end;
  }
  return { day, pairs, workedMin: worked, breakMin: breaks, openNow, missingOut, mealLate, over8: worked > DAY_OT, refused: refused.filter((r) => r.day === day) };
}

/** All days in [from, to] for one person. */
export function buildDays(row: TsRow, days: string[], today: string, nowIso: string): Day[] {
  return days.map((d) => buildDay(d, row.events, today, nowIso, row.refused));
}

export const weekOver = (days: Day[]) => days.reduce((s, d) => s + d.workedMin, 0) > WEEK_OT;

/** "5h 13m", "45m", "0h". Hours with no space (Oliver, Nov 19). */
export function fmtMin(m: number): string {
  if (m <= 0) return "0h";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

/** Days from `from` to `to` (YYYY-MM-DD), inclusive. */
export function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end && out.length < 63) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Monday of the week holding `day`. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** CSV for payroll: one line per in/out pair. `time` formats a punch time. */
export function timesheetCsv(rows: TsRow[], days: string[], today: string, nowIso: string, time: (iso: string) => string): string {
  const head = ["Person", "Role", "Day", "In", "Out", "Hours", "Fixed", "Flags"];
  const lines: string[] = [head.join(",")];
  for (const r of rows) for (const d of buildDays(r, days, today, nowIso)) {
    const flags = [d.missingOut && "needs fix", d.mealLate && "late meal break", d.over8 && "over 8h"].filter(Boolean).join("; ");
    for (const p of d.pairs) {
      const len = p.in && (p.out || p.open) ? mins(p.in.at, p.out ? p.out.at : nowIso) : 0;
      lines.push([r.name, r.role, d.day, p.in ? time(p.in.at) : "", p.out ? time(p.out.at) : p.open ? "now" : "", (len / 60).toFixed(2),
        p.in?.fix || p.out?.fix ? "yes" : "", flags].map((x) => q(String(x))).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

/** Sample week for the test copy (no database): same people + story as the design board. */
export function demoTimesheet(today: string): TsRow[] {
  const at = (day: string, hm: string) => new Date(`${day}T${hm}:00`).toISOString();
  let id = 1;
  const p = (day: string, kind: "in" | "out", hm: string, via = "device", device: string | null = "Time clock", fix: Fix | null = null): Punch =>
    ({ id: id++, kind, at: at(day, hm), day, via, device, fix });
  const days = dayList(weekStart(today), today);
  const past = days.filter((d) => d < today);
  const full = (d: string, a: string, b: string, c: string, e: string) => [p(d, "in", a), p(d, "out", b), p(d, "in", c), p(d, "out", e)];
  const yest = past.at(-1);
  const rows: TsRow[] = [
    { membership_id: "m-bao", name: "Bao Tran", role: "manager", refused: [],
      events: [...past.flatMap((d) => full(d, "09:00", "12:30", "13:00", "18:10")), p(today, "in", "09:02", "device", "Front desk iPad"), p(today, "out", "12:30", "device", "Front desk iPad"), p(today, "in", "13:00", "device", "Front desk iPad")] },
    { membership_id: "m-hanh", name: "Hanh Le", role: "front_desk", refused: [],
      events: [...past.flatMap((d) => full(d, "09:15", "13:00", "13:30", "17:45")), p(today, "in", "09:15", "device", "Front desk iPad")] },
    { membership_id: "m-kim", name: "Kim Vo", role: "tech", refused: [],
      events: [...past.flatMap((d) => full(d, "09:30", "12:00", "12:30", "18:00")), p(today, "in", "09:30"), p(today, "out", "12:00"), p(today, "in", "12:30")] },
    { membership_id: "m-tuan", name: "Tuan Do", role: "tech", refused: [],
      events: [...past.filter((d) => d !== yest).flatMap((d) => full(d, "10:00", "13:00", "13:30", "18:30")),
        ...(yest ? [p(yest, "in", "10:00")] : []), p(today, "in", "10:00")] },
    { membership_id: "m-linh", name: "Linh Pham", role: "tech", events: past.flatMap((d) => full(d, "10:00", "13:00", "13:30", "16:00")),
      refused: [{ at: at(today, "11:40"), day: today, reason: "not_wifi" }] },
  ];
  return rows;
}
