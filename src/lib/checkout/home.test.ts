import { describe, expect, it } from "vitest";
import { asHomeLayout, canCharge, homeFacts, hoursMins, longestFirst, openMinutes, techCounts, techsOn } from "./home";
import type { Ticket } from "./ticket";

const tk = (p: Partial<Ticket>): Ticket => ({ id: "t", salonId: "s", status: "open", createdAt: "2026-11-20T10:00:00.000Z", lines: [], tips: {}, note: "", ...p });
const line = (cents: number, staffId: string | undefined, staffName?: string, extra = {}) => ({ id: `l${cents}${staffId}`, name: "Service", minutes: 30, cents, staffId, staffName, ...extra });

describe("checkout home", () => {
  it("falls back to the list layout", () => {
    expect(asHomeLayout("cards")).toBe("cards");
    expect(asHomeLayout("grid")).toBe("list");
    expect(asHomeLayout(null)).toBe("list");
  });

  it("counts how long a ticket has been open", () => {
    const now = new Date("2026-11-20T11:13:40.000Z").getTime();
    expect(openMinutes("2026-11-20T10:00:00.000Z", now)).toBe(73);
    expect(openMinutes("2026-11-20T12:00:00.000Z", now)).toBe(0); // another device's clock is ahead
    expect(hoursMins(73)).toEqual({ h: 1, m: 13 });
    expect(hoursMins(8)).toEqual({ h: 0, m: 8 });
  });

  it("lists tech first names once, in ticket order", () => {
    expect(techsOn(tk({ lines: [line(2200, "k", "Kim Le"), line(4800, "v", "Vy"), line(2000, "k", "Kim Le")] }))).toEqual(["Kim", "Vy"]);
    expect(techsOn(tk({ lines: [line(2200, undefined)] }))).toEqual([]);
  });

  it("offers Charge only when nothing is missing and money is due", () => {
    expect(canCharge(tk({ lines: [line(4800, "v", "Vy")] }))).toBe(true);
    expect(canCharge(tk({}))).toBe(false); // empty
    expect(canCharge(tk({ lines: [line(4800, undefined)] }))).toBe(false); // no tech picked
    expect(canCharge(tk({ lines: [line(4500, "v", "Vy", { priceFrom: true })] }))).toBe(false); // "$45+" price not set
    expect(canCharge(tk({ status: "paid", lines: [line(4800, "v", "Vy")] }))).toBe(false);
  });

  it("puts the longest-open ticket first and counts tickets per tech", () => {
    const a = tk({ id: "a", createdAt: "2026-11-20T11:00:00.000Z", lines: [line(100, "v", "Vy")] });
    const b = tk({ id: "b", createdAt: "2026-11-20T10:00:00.000Z", lines: [line(100, "k", "Kim"), line(200, "v", "Vy")] });
    expect(longestFirst([a, b]).map((t) => t.id)).toEqual(["b", "a"]);
    expect(techCounts([a, b])).toEqual([{ name: "Kim", n: 1 }, { name: "Vy", n: 2 }]);
  });

  it("adds up to collect, paid by card and cash, and tips", () => {
    const open = [tk({ lines: [line(4800, "v", "Vy")] }), tk({ lines: [line(4200, "k", "Kim")], cashParts: [{ id: "c", cents: 2000, givenCents: 2000, at: "" }] })];
    const paid = [
      tk({ status: "paid", lines: [line(4800, "k", "Kim")], tips: { k: 720 }, payment: { id: "p1", method: "card_reader", at: "" } }),
      tk({ status: "paid", lines: [line(3000, "v", "Vy")], payment: { id: "p2", method: "cash", at: "" } }),
      tk({ status: "paid", lines: [line(5000, "v", "Vy")], cashParts: [{ id: "c2", cents: 2000, givenCents: 2000, at: "" }], payment: { id: "p3", method: "pay_link", at: "" } }),
    ];
    expect(homeFacts(open, paid)).toEqual({ toCollect: 4800 + 2200, paidCents: 5520 + 3000 + 5000, card: 5520 + 3000, cash: 3000 + 2000, tips: 720 });
  });
});
