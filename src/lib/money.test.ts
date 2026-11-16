import { describe, expect, it } from "vitest";
import { cardFee, formatCents, parseDollars, percentOf, splitCents } from "./money";
import { fmtPhone, phoneOk, toMin } from "./onboarding/data";

describe("money in cents", () => {
  it("formats", () => {
    expect(formatCents(6500)).toBe("$65.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(106550)).toBe("$1,065.50");
    expect(formatCents(-1000)).toBe("−$10.00");
    expect(() => formatCents(1.5)).toThrow();
  });
  it("parses", () => {
    expect(parseDollars("65")).toBe(6500);
    expect(parseDollars("65.5")).toBe(6550);
    expect(parseDollars("$1,065.50")).toBe(106550);
    expect(parseDollars("6.555")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
  });
  it("tips and fees round once", () => {
    expect(percentOf(6500, 20)).toBe(1300);
    expect(percentOf(6500, 18)).toBe(1170);
    expect(cardFee(8300, 2.7, 5)).toBe(229); // checkout board: $83 → $2.29
  });
  it("splits without losing a cent", () => {
    expect(splitCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(splitCents(1800, [3500, 3000])).toEqual([970, 830]);
    const parts = splitCents(9999, [1, 2, 3, 4]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9999);
  });
});

describe("phone + time helpers", () => {
  it("formats US phones", () => {
    expect(fmtPhone("4085550110")).toBe("(408) 555-0110");
    expect(fmtPhone("+1 408 555 0110")).toBe("(408) 555-0110");
    expect(phoneOk("(408) 555-0110")).toBe(true);
    expect(phoneOk("555-0110")).toBe(false);
  });
  it("reads times", () => {
    expect(toMin("19:00")).toBe(1140);
  });
});
