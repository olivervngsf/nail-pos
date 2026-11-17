// Owner numbers (M11): pure functions over raw facts from the server (numbers_facts). Every number traces back to rows;
// tested with fixed data in kpis.test.ts. Facts only — the owner decides.

export type FactLine = { staff: string | null; cents: number; kind: "service" | "tip" };
export type FactTicket = { id: string; paidAt: string; client: string | null; newClient: boolean; source: string | null; sales: number; tips: number; fees: number; giftSold: number; rebooked: boolean; lines: FactLine[] };
export type FactWalkIn = { came: string; seatedAt: string | null; walkedOut: boolean; service?: string };
export type FactShift = { staff: string; from: string; to: string };
export type FactNoShow = { at: string; cents: number };
export type Facts = {
  staff: { id: string; name: string }[];
  tickets: FactTicket[]; walkins: FactWalkIn[]; shifts: FactShift[]; noShows: FactNoShow[];
  visits: { client: string; at: string }[];               // paid visits (for "came back")
  giftUsed: { at: string; cents: number }[];
  lost: { name: string }[];                                // lost regulars right now
};
export type Range = { from: Date; to: Date };
export type Period = "day" | "week" | "month";

const DAY = 86_400_000;
const inR = (iso: string, r: Range) => { const t = new Date(iso).getTime(); return t >= r.from.getTime() && t < r.to.getTime(); };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The period that holds `now` and the one it is compared with (day: same weekday last week; week: last week; month: last month). */
export function periods(per: Period, now: Date): { cur: Range; cmp: Range; vs: "lastWeekday" | "lastWeek" | "lastMonth" } {
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (per === "day") return { cur: { from: d0, to: new Date(d0.getTime() + DAY) }, cmp: { from: new Date(d0.getTime() - 7 * DAY), to: new Date(d0.getTime() - 6 * DAY) }, vs: "lastWeekday" };
  if (per === "week") {
    const mon = new Date(d0); mon.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
    const next = new Date(mon); next.setDate(mon.getDate() + 7);
    const prev = new Date(mon); prev.setDate(mon.getDate() - 7);
    return { cur: { from: mon, to: next }, cmp: { from: prev, to: mon }, vs: "lastWeek" };
  }
  const m = new Date(now.getFullYear(), now.getMonth(), 1);
  return { cur: { from: m, to: new Date(now.getFullYear(), now.getMonth() + 1, 1) }, cmp: { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: m }, vs: "lastMonth" };
}

/** Same range cut at the same point in time ("by now"): compare a running day/week fairly. */
export function soFar(r: Range, cur: Range, now: Date): Range {
  const elapsed = Math.min(now.getTime(), cur.to.getTime()) - cur.from.getTime();
  return { from: r.from, to: new Date(Math.min(r.to.getTime(), r.from.getTime() + Math.max(0, elapsed))) };
}

/** Hours worked in a range (clock-in pairs, cut to the range). */
export function staffHours(shifts: FactShift[], r: Range, staff?: string) {
  let ms = 0;
  for (const s of shifts) {
    if (staff && s.staff !== staff) continue;
    const a = Math.max(new Date(s.from).getTime(), r.from.getTime()), b = Math.min(new Date(s.to).getTime(), r.to.getTime());
    if (b > a) ms += b - a;
  }
  return ms / 3_600_000;
}

/** "Came back": of clients seen 6–12 weeks before `end`, the share seen again in the last 6 weeks. */
export function cameBack(visits: Facts["visits"], end: Date) {
  const e = end.getTime(), a = e - 84 * DAY, b = e - 42 * DAY;
  const before = new Set<string>(), after = new Set<string>();
  for (const v of visits) { const t = new Date(v.at).getTime(); if (t >= a && t < b) before.add(v.client); else if (t >= b && t < e) after.add(v.client); }
  if (!before.size) return { pct: null as number | null, of: 0, back: 0 };
  let back = 0; before.forEach((c) => { if (after.has(c)) back++; });
  return { pct: Math.round((back / before.size) * 100), of: before.size, back };
}

export type Kpis = { sales: number; tickets: number; avgTicket: number; cameBack: number | null; perHour: number | null; hours: number; waitAvg: number | null; walkOuts: number; walkIns: number };
export function kpis(f: Facts, r: Range): Kpis {
  const t = f.tickets.filter((x) => inR(x.paidAt, r));
  const sales = sum(t.map((x) => x.sales));
  const hours = staffHours(f.shifts, r);
  const w = f.walkins.filter((x) => inR(x.came, r));
  const seated = w.filter((x) => x.seatedAt);
  const waits = seated.map((x) => (new Date(x.seatedAt!).getTime() - new Date(x.came).getTime()) / 60_000);
  return {
    sales, tickets: t.length, avgTicket: t.length ? Math.round(sales / t.length) : 0,
    cameBack: cameBack(f.visits, r.to).pct,
    perHour: hours > 0 ? Math.round(sales / hours) : null, hours,
    waitAvg: waits.length ? Math.round(sum(waits) / waits.length) : null,
    walkOuts: w.filter((x) => x.walkedOut).length, walkIns: w.length,
  };
}

/** Buckets for the chart: day → hours 9 AM–8 PM; week → Mon–Sun; month → each day. */
export function buckets(per: Period, r: Range): { label: string; from: Date; to: Date }[] {
  if (per === "day") return Array.from({ length: 11 }, (_, i) => {
    const h = 9 + i, from = new Date(r.from); from.setHours(h, 0, 0, 0);
    const to = new Date(from); to.setHours(h + 1);
    return { label: h === 12 ? "12" : String(((h + 11) % 12) + 1), from, to };
  });
  const n = Math.round((r.to.getTime() - r.from.getTime()) / DAY);
  return Array.from({ length: n }, (_, i) => {
    const from = new Date(r.from); from.setDate(r.from.getDate() + i);
    const to = new Date(from); to.setDate(from.getDate() + 1);
    return { label: per === "week" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] : String(from.getDate()), from, to };
  });
}

export type KpiKey = "sales" | "ticket" | "return" | "perhour" | "wait";
/** One value per bucket for the picked KPI (cents for money, % or minutes otherwise). */
export function series(f: Facts, key: KpiKey, bs: { from: Date; to: Date }[]): (number | null)[] {
  return bs.map((b) => {
    const k = kpis(f, b);
    if (key === "sales") return k.sales;
    if (key === "ticket") return k.tickets ? k.avgTicket : null;
    if (key === "return") return cameBack(f.visits, b.to).pct;
    if (key === "perhour") return k.perHour;
    return k.waitAvg;
  });
}

export type StaffRow = { id: string; name: string; sales: number; hours: number; perHour: number | null; avgTicket: number; rebookedPct: number | null; tips: number; turns: number };
/** Per staff (owner/manager only): sales = their service lines, tips = their tip lines, turns = their tickets. */
export function staffTable(f: Facts, r: Range): StaffRow[] {
  const t = f.tickets.filter((x) => inR(x.paidAt, r));
  return f.staff.map((s) => {
    const mine = t.filter((x) => x.lines.some((l) => l.kind === "service" && l.staff === s.id));
    const sales = sum(mine.flatMap((x) => x.lines.filter((l) => l.kind === "service" && l.staff === s.id).map((l) => l.cents)));
    const tips = sum(t.flatMap((x) => x.lines.filter((l) => l.kind === "tip" && l.staff === s.id).map((l) => l.cents)));
    const hours = staffHours(f.shifts, r, s.id);
    return { id: s.id, name: s.name, sales, hours: Math.round(hours * 10) / 10, perHour: hours > 0 ? Math.round(sales / hours) : null,
      avgTicket: mine.length ? Math.round(sales / mine.length) : 0, rebookedPct: mine.length ? Math.round((mine.filter((x) => x.rebooked).length / mine.length) * 100) : null,
      tips, turns: mine.length };
  }).filter((x) => x.turns > 0 || x.hours > 0).sort((a, b) => b.sales - a.sales);
}

export type More = { rebookedPct: number | null; noShows: number; noShowCents: number; newClients: number; topSource: string | null; tips: number; tipPct: number | null; fees: number; giftSold: number; giftUsed: number; busiest: { from: Date; cents: number } | null };
export function more(f: Facts, r: Range, per: Period): More {
  const t = f.tickets.filter((x) => inR(x.paidAt, r));
  const sales = sum(t.map((x) => x.sales)), tips = sum(t.map((x) => x.tips));
  const ns = f.noShows.filter((x) => inR(x.at, r));
  const newOnes = t.filter((x) => x.newClient);
  const src = new Map<string, number>();
  for (const x of newOnes) if (x.source) src.set(x.source, (src.get(x.source) ?? 0) + 1);
  const topSource = [...src.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  // Busiest hour (day) or busiest weekday-hour (week/month), by sales.
  const byKey = new Map<string, { from: Date; cents: number }>();
  for (const x of t) {
    const d = new Date(x.paidAt);
    const k = per === "day" ? String(d.getHours()) : `${d.getDay()}-${d.getHours()}`;
    const cur = byKey.get(k) ?? { from: new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()), cents: 0 };
    cur.cents += x.sales; byKey.set(k, cur);
  }
  const busiest = [...byKey.values()].sort((a, b) => b.cents - a.cents)[0] ?? null;
  return {
    rebookedPct: t.length ? Math.round((t.filter((x) => x.rebooked).length / t.length) * 100) : null,
    noShows: ns.length, noShowCents: sum(ns.map((x) => x.cents)), newClients: newOnes.length, topSource,
    tips, tipPct: sales ? Math.round((tips / sales) * 100) : null, fees: sum(t.map((x) => x.fees)),
    giftSold: sum(t.map((x) => x.giftSold)), giftUsed: sum(f.giftUsed.filter((x) => inR(x.at, r)).map((x) => x.cents)), busiest,
  };
}

/** Change vs compare, as a word + arrow (never colour alone). better = true when up is good. */
export function trend(cur: number | null, prev: number | null, better: "up" | "down" = "up"): { dir: "up" | "down" | "same"; good: boolean | null; delta: number | null; pct: number | null } {
  if (cur === null || prev === null) return { dir: "same", good: null, delta: null, pct: null };
  const delta = cur - prev;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  return { dir, good: dir === "same" ? null : (dir === "up") === (better === "up"), delta, pct: prev ? Math.round((delta / prev) * 100) : null };
}

/** CSV for the accountant: per staff rows for the period. */
export function staffCsv(rows: StaffRow[], label: string) {
  const $ = (c: number) => (c / 100).toFixed(2);
  const head = "period,staff,sales,hours,sales_per_hour,avg_ticket,rebooked_pct,tips,turns";
  return [head, ...rows.map((r) => [label, `"${r.name.replace(/"/g, '""')}"`, $(r.sales), r.hours, r.perHour === null ? "" : $(r.perHour), $(r.avgTicket), r.rebookedPct ?? "", $(r.tips), r.turns].join(","))].join("\n") + "\n";
}
