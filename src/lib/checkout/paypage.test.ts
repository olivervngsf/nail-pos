import { describe, expect, it } from "vitest";
import { asLayout, asSplit, firstName, techNames, techTotals, tipShares } from "./paypage";

describe("pay page", () => {
  it("falls back to the Receipt layout and the by-service split", () => {
    expect(asLayout("quick")).toBe("quick");
    expect(asLayout("nope")).toBe("receipt");
    expect(asLayout(undefined)).toBe("receipt");
    expect(asSplit("even")).toBe("even");
    expect(asSplit(null)).toBe("service");
  });

  it("shows first names only", () => {
    expect(firstName("Vy Tran")).toBe("Vy");
    expect(firstName("  Kim  ")).toBe("Kim");
    expect(firstName(null)).toBe("");
  });

  it("adds up each tech's services in ticket order", () => {
    const t = techTotals([
      { key: "k", name: "Kim", cents: 2200 }, { key: "v", name: "Vy", cents: 4800 },
      { key: "k", name: "Kim", cents: 2000 }, { key: null, name: "", cents: 500 },
    ]);
    expect(t).toEqual([{ key: "k", name: "Kim", cents: 4200 }, { key: "v", name: "Vy", cents: 4800 }]);
  });

  it("keeps two techs with the same first name apart", () => {
    expect(techTotals([{ key: 1, name: "Vy", cents: 100 }, { key: 2, name: "Vy", cents: 300 }])).toHaveLength(2);
  });

  it("shares one tip by service price or evenly, never losing a cent", () => {
    expect(tipShares(1400, [2200, 4800], "service")).toEqual([440, 960]);
    expect(tipShares(1400, [2200, 4800], "even")).toEqual([700, 700]);
    expect(tipShares(1001, [2200, 4800], "even")).toEqual([501, 500]);
    expect(tipShares(1000, [3333, 3333, 3334], "service").reduce((a, b) => a + b, 0)).toBe(1000);
    expect(tipShares(0, [2200, 4800], "service")).toEqual([0, 0]);
    expect(tipShares(500, [], "service")).toEqual([]);
    expect(tipShares(500, [0, 0], "service")).toEqual([250, 250]); // free services still share the tip
  });

  it("names one or two techs, and nobody when it can't", () => {
    expect(techNames([{ name: "Vy", cents: 1 }], "and")).toBe("Vy");
    expect(techNames([{ name: "Kim", cents: 1 }, { name: "Vy", cents: 1 }], "và")).toBe("Kim và Vy");
    expect(techNames([], "and")).toBeNull();
    expect(techNames([{ name: "A", cents: 1 }, { name: "B", cents: 1 }, { name: "C", cents: 1 }], "and")).toBeNull();
    expect(techNames([{ name: "", cents: 1 }], "and")).toBeNull();
  });
});
