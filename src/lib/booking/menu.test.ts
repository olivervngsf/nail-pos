import { describe, expect, it } from "vitest";
import { onMenu, readCustom } from "./menu";

describe("custom service → menu", () => {
  it("reads the form", () => {
    expect(readCustom({ name: " Nail  repair ", price: "$7.50", min: "" })).toEqual({ name: "Nail repair", minutes: 30, cents: 750 });
    expect(readCustom({ name: "Soak off", price: "10", min: "2" })?.minutes).toBe(5);
    expect(readCustom({ name: "Long set", price: "90", min: "900" })?.minutes).toBe(600);
    expect(readCustom({ name: "", price: "10", min: "" })).toBeNull();
    expect(readCustom({ name: "Repair", price: "abc", min: "" })).toBeNull();
  });
  it("spots a name already on the menu", () => {
    const menu = [{ name: "Regular spa pedicure" }];
    expect(onMenu("regular  SPA pedicure", menu)).toBe(true);
    expect(onMenu("Nail repair", menu)).toBe(false);
  });
});
