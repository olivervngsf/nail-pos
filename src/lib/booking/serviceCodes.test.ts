import { describe, expect, it } from "vitest";
import { codeHits, parseTime, withCodes } from "./serviceCodes";

const menu = [
  { cat: "Pedicures", name: "Regular spa pedicure" },
  { cat: "Pedicures", name: "Deluxe spa pedicure" },
  { cat: "Gel color", name: "Gel color manicure" },
  { cat: "Kids", name: "Kids manicure" },
  { cat: "Massage", name: "Hot stone" },
];

describe("service codes", () => {
  it("numbers services inside each group", () => {
    expect(withCodes(menu).map((s) => s.code)).toEqual(["P1", "P2", "G1", "K1", "S1"]);
  });
  it("finds every typed code, or nothing", () => {
    const c = withCodes(menu);
    expect(codeHits("p1 g1", c).map((s) => s.name)).toEqual(["Regular spa pedicure", "Gel color manicure"]);
    expect(codeHits("P2,P1", c).map((s) => s.code)).toEqual(["P2", "P1"]);
    expect(codeHits("p1 gel", c)).toEqual([]);
    expect(codeHits("  ", c)).toEqual([]);
  });
});

describe("typed time", () => {
  it("reads the ways people type a time", () => {
    expect(parseTime("2:30")).toBe(14 * 60 + 30);
    expect(parseTime("230p")).toBe(14 * 60 + 30);
    expect(parseTime("2:30 pm")).toBe(14 * 60 + 30);
    expect(parseTime("14:30")).toBe(14 * 60 + 30);
    expect(parseTime("9a")).toBe(9 * 60);
    expect(parseTime("10")).toBe(10 * 60);
    expect(parseTime("3:02")).toBe(15 * 60);
  });
  it("refuses nonsense and closed hours", () => {
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("6a")).toBeNull();
    expect(parseTime("11pm")).toBeNull();
  });
});
