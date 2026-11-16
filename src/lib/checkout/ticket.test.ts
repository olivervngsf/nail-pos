import { describe, expect, it } from "vitest";
import { blockers, changeCents, discountCents, quickCash, splitTipByPrice, staffOn, tipLineId, toPayload, totals, type Ticket } from "./ticket";

const base = (): Ticket => ({
  id: "11111111-1111-4111-8111-111111111111", salonId: "s", status: "open", createdAt: "2026-11-18T10:00:00Z", note: "", tips: {},
  lines: [
    { id: "a", name: "Gel manicure", minutes: 45, cents: 3500, staffId: "k", staffName: "Kim" },
    { id: "b", name: "Deluxe pedicure", minutes: 60, cents: 5500, staffId: "n", staffName: "Ngọc" },
  ],
});

describe("checkout money", () => {
  it("adds services, takes off the discount, adds tips", () => {
    const t = { ...base(), discount: { id: "d", kind: "amt" as const, value: 500, reason: "Regular client" }, tips: { k: 700, n: 1100 } };
    expect(totals(t)).toEqual({ subtotal: 9000, discount: 500, due: 8500, tip: 1800, total: 10300 });
  });
  it("percent discount rounds to the cent and never goes below $0", () => {
    expect(discountCents(9000, { id: "d", kind: "pct", value: 15, reason: "x" })).toBe(1350);
    expect(discountCents(3333, { id: "d", kind: "pct", value: 10, reason: "x" })).toBe(333);
    expect(discountCents(500, { id: "d", kind: "amt", value: 1000, reason: "x" })).toBe(500);
  });
  it("cash change and short", () => {
    expect(changeCents(6500, 10000)).toBe(3500);
    expect(changeCents(6500, 6000)).toBe(-500);
  });
  it("quick cash amounts are exact then round bills", () => {
    expect(quickCash(6500)).toEqual([6500, 7000, 8000, 10000]);
    expect(quickCash(6200)).toEqual([6200, 6500, 7000, 10000]);
    expect(quickCash(10300)).toEqual([10300, 10500, 11000, 20000]);
    expect(quickCash(2000)).toEqual([2000, 5000, 10000, 20000]);
    expect(quickCash(10000)).toEqual([10000, 20000, 30000, 40000]);
  });
  it("tip split by service price loses no cent", () => {
    const s = splitTipByPrice(1800, base().lines);
    expect(s.k + s.n).toBe(1800);
    expect(s).toEqual({ k: 700, n: 1100 });
    expect(splitTipByPrice(1001, base().lines).k + splitTipByPrice(1001, base().lines).n).toBe(1001);
  });
  it("groups staff on the ticket", () => {
    const t = base();
    t.lines.push({ id: "c", name: "Nail design", minutes: 15, cents: 500, staffId: "k", staffName: "Kim" });
    expect(staffOn(t.lines)).toEqual([{ id: "k", name: "Kim", cents: 4000 }, { id: "n", name: "Ngọc", cents: 5500 }]);
  });
  it("blocks charge until every service has a person and a final price", () => {
    const t = base();
    expect(blockers(t)).toEqual([]);
    t.lines.push({ id: "c", name: "Waxing", minutes: 15, cents: 4500, priceFrom: true });
    expect(blockers(t)).toEqual(["staff", "price"]);
    expect(blockers({ ...t, lines: [] })).toEqual(["empty"]);
  });
  it("payload: discount negative, one tip line per person with a stable id", () => {
    const t = { ...base(), discount: { id: "d", kind: "pct" as const, value: 10, reason: "Birthday", approvalId: "ap" }, tips: { k: 700, n: 0 } };
    const p = toPayload(t);
    expect(p.lines.find((l) => l.kind === "discount")).toMatchObject({ cents: -900, approvalId: "ap" });
    expect(p.lines.filter((l) => l.kind === "tip")).toHaveLength(1);
    expect(tipLineId(t.id, "22222222-2222-4222-8222-222222222222")).toBe(tipLineId(t.id, "22222222-2222-4222-8222-222222222222"));
    expect(tipLineId(t.id, "22222222-2222-4222-8222-222222222222")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
