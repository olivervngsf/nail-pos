import { describe, expect, it } from "vitest";
import { buckets, cameBack, kpis, more, periods, series, soFar, staffCsv, staffHours, staffTable, trend, type Facts } from "./kpis";

// A fixed little salon week: Mon Nov 16 2026 … (local time).
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const facts: Facts = {
  staff: [{ id: "k", name: "Kim" }, { id: "t", name: "Tuyet" }, { id: "n", name: "Ngoc" }],
  tickets: [
    { id: "1", paidAt: at(16, 10), client: "a", newClient: false, source: null, sales: 4500, tips: 900, fees: 127, giftSold: 0, rebooked: true,
      lines: [{ staff: "k", cents: 4500, kind: "service" }, { staff: "k", cents: 900, kind: "tip" }] },
    { id: "2", paidAt: at(16, 12, 30), client: "b", newClient: true, source: "google", sales: 9000, tips: 1500, fees: 0, giftSold: 5000, rebooked: false,
      lines: [{ staff: "k", cents: 3000, kind: "service" }, { staff: "t", cents: 6000, kind: "service" }, { staff: "t", cents: 1500, kind: "tip" }] },
    { id: "3", paidAt: at(17, 15), client: null, newClient: false, source: null, sales: 3000, tips: 0, fees: 0, giftSold: 0, rebooked: false,
      lines: [{ staff: "t", cents: 3000, kind: "service" }] },
    { id: "old", paidAt: at(9, 11), client: "a", newClient: false, source: null, sales: 4000, tips: 500, fees: 0, giftSold: 0, rebooked: false,
      lines: [{ staff: "k", cents: 4000, kind: "service" }] },
  ],
  walkins: [
    { came: at(16, 11, 0), seatedAt: at(16, 11, 12), walkedOut: false },
    { came: at(16, 12, 0), seatedAt: at(16, 12, 20), walkedOut: false },
    { came: at(16, 12, 10), seatedAt: null, walkedOut: true },
  ],
  shifts: [
    { staff: "k", from: at(16, 9), to: at(16, 17) },       // 8h
    { staff: "t", from: at(16, 10), to: at(16, 14) },      // 4h
    { staff: "t", from: at(17, 9), to: at(17, 13) },       // 4h (Tue)
  ],
  noShows: [{ at: at(16, 16), cents: 5500 }],
  visits: [
    // seen 6–12 weeks before Nov 23: a, c, d. Back in the last 6 weeks: a, c.
    { client: "a", at: at(1, 10) }, { client: "c", at: at(2, 10) }, { client: "d", at: at(3, 10) },
    { client: "a", at: at(16, 10) }, { client: "c", at: at(18, 10) },
  ].map((v) => ({ ...v, at: new Date(new Date(v.at).getTime() - (v.at < at(10, 0) ? 35 * 86_400_000 : 0)).toISOString() })),
  giftUsed: [{ at: at(17, 10), cents: 1800 }],
  lost: [{ name: "Jen Park" }],
};
const monday = { from: new Date(2026, 10, 16), to: new Date(2026, 10, 17) };
const week = { from: new Date(2026, 10, 16), to: new Date(2026, 10, 23) };

describe("periods", () => {
  it("day vs same weekday last week; week vs last week (Mon start); month vs last month", () => {
    const now = new Date(2026, 10, 18, 13, 40);   // Wed
    const d = periods("day", now), w = periods("week", now), m = periods("month", now);
    expect(d.cur.from).toEqual(new Date(2026, 10, 18)); expect(d.cmp.from).toEqual(new Date(2026, 10, 11));
    expect(w.cur.from).toEqual(new Date(2026, 10, 16)); expect(w.cmp.from).toEqual(new Date(2026, 10, 9));
    expect(m.cur.from).toEqual(new Date(2026, 10, 1)); expect(m.cmp.from).toEqual(new Date(2026, 9, 1));
    // compare "by now": last Wednesday up to 1:40 PM
    expect(soFar(d.cmp, d.cur, now).to).toEqual(new Date(2026, 10, 11, 13, 40));
  });
});

describe("kpis from fixed rows", () => {
  it("Monday: sales, avg ticket, per staff hour, walk-in wait + walk-outs", () => {
    const k = kpis(facts, monday);
    expect(k.sales).toBe(13500);            // 4500 + 9000
    expect(k.tickets).toBe(2);
    expect(k.avgTicket).toBe(6750);
    expect(k.hours).toBe(12);               // Kim 8 + Tuyet 4
    expect(k.perHour).toBe(1125);           // $135 / 12h
    expect(k.waitAvg).toBe(16);             // (12 + 20) / 2
    expect(k.walkOuts).toBe(1);
  });
  it("came back = seen 6–12 weeks ago and again in the last 6", () => {
    const c = cameBack(facts.visits, new Date(2026, 10, 23));
    expect(c.of).toBe(3); expect(c.back).toBe(2); expect(c.pct).toBe(67);
  });
  it("staff hours cut to the range", () => {
    expect(staffHours(facts.shifts, { from: new Date(2026, 10, 16, 12), to: new Date(2026, 10, 16, 13) })).toBe(2);
  });
  it("per staff: own service lines, own tips, turns = own tickets", () => {
    const rows = staffTable(facts, week);
    const kim = rows.find((r) => r.name === "Kim")!, tu = rows.find((r) => r.name === "Tuyet")!;
    expect(kim).toMatchObject({ sales: 7500, tips: 900, turns: 2, hours: 8, perHour: 938, avgTicket: 3750, rebookedPct: 50 });
    expect(tu).toMatchObject({ sales: 9000, tips: 1500, turns: 2, hours: 8 });
    expect(rows.map((r) => r.name)).toEqual(["Tuyet", "Kim"]);   // Ngoc: no tickets, no hours → left out
    expect(staffCsv(rows, "week").split("\n")[1]).toBe('week,"Tuyet",90.00,8,11.25,45.00,0,15.00,2');
  });
  it("more numbers", () => {
    const m = more(facts, week, "week");
    expect(m).toMatchObject({ rebookedPct: 33, noShows: 1, noShowCents: 5500, newClients: 1, topSource: "google", tips: 2400, tipPct: 15, fees: 127, giftSold: 5000, giftUsed: 1800 });
    expect(m.busiest?.cents).toBe(9000);
  });
  it("chart buckets + series", () => {
    const bs = buckets("week", week);
    expect(bs.map((b) => b.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(series(facts, "sales", bs).slice(0, 3)).toEqual([13500, 3000, 0]);
    expect(buckets("day", monday)).toHaveLength(11);
    expect(series(facts, "sales", buckets("day", monday))[1]).toBe(4500);   // 10–11 AM
  });
  it("trend: word + arrow; walk-in wait down is good", () => {
    expect(trend(110, 100)).toMatchObject({ dir: "up", good: true, pct: 10 });
    expect(trend(8, 12, "down")).toMatchObject({ dir: "down", good: true, delta: -4 });
    expect(trend(null, 5).dir).toBe("same");
  });
});
