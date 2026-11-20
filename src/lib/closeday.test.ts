import { describe, expect, it } from "vitest";
import { addDays, countCents, demoPayout, demoTipMonth, lastMonth, nums, payoutCsv, tipSignState, weekStart } from "./closeday";

describe("close day helpers", () => {
  it("counts the drawer in cents (bills + coins, no negatives)", () => {
    expect(countCents({ 100: 2, 20: 1, 5: 1 })).toBe(22500);
    expect(countCents({ 100: 2, 50: 2, 20: 8, 10: 5, 5: 6, 1: 20 }, 37)).toBe(56037);
    expect(countCents({ 20: -3 }, -5)).toBe(0);
  });
  it("reads server bigints as numbers but keeps names", () => {
    expect(nums({ name: "1001", total_cents: "8100", pct: "60.00" })).toEqual({ name: "1001", total_cents: 8100, pct: 60 });
  });
  it("works out weeks from Monday", () => {
    expect(weekStart("2026-11-18")).toBe("2026-11-16");
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
  it("builds a payroll CSV in dollars, quoting names with commas", () => {
    const rows = demoPayout();
    rows[0] = { ...rows[0], name: "Kim, Tran" };
    const csv = payoutCsv(rows, "2026-11-16", "2026-11-22").trim().split("\n");
    expect(csv[0]).toBe("Name,Pay type,Period start,Period end,Hours,Services,Commission %,Commission / wages,Card tips,Cash tips,Card fee on tips,Total pay,By check,In cash");
    expect(csv[1]).toBe('"Kim, Tran",commission,2026-11-16,2026-11-22,0.00,1860.00,60,1116.00,410.00,90.00,0.00,1616.00,969.60,646.40');
    expect(csv).toHaveLength(4);
  });
  it("check + cash always add up to the total", () => {
    for (const r of demoPayout()) expect(r.check_cents + r.cash_cents).toBe(r.total_cents);
  });
});

describe("monthly tip report", () => {
  it("last month wraps the year", () => {
    expect(lastMonth("2026-11-19")).toBe("2026-10-01");
    expect(lastMonth("2027-01-05")).toBe("2026-12-01");
  });
  it("signed / not signed / changed since signed", () => {
    expect(demoTipMonth().map(tipSignState)).toEqual(["signed", "unsigned", "changed"]);
  });
});
