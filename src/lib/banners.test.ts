import { describe, expect, it } from "vitest";
import { hiddenUntil, isHiddenValue } from "./banners";

describe("banner close memory", () => {
  const now = new Date(2026, 10, 25, 15, 30);
  it("visit = this tab only", () => expect(hiddenUntil("visit", now)).toBeNull());
  it("device = never back", () => expect(hiddenUntil("device", now)).toBe(Infinity));
  it("day = next local midnight", () => expect(hiddenUntil("day", now)).toBe(new Date(2026, 10, 26).getTime()));
  it("week = 7 days", () => expect(hiddenUntil("week", now)).toBe(now.getTime() + 7 * 864e5));
  it("reads saved values", () => {
    expect(isHiddenValue(null)).toBe(false);
    expect(isHiddenValue("forever")).toBe(true);
    expect(isHiddenValue(String(Date.now() + 1000))).toBe(true);
    expect(isHiddenValue(String(Date.now() - 1000))).toBe(false);
    expect(isHiddenValue("junk")).toBe(false);
  });
});
