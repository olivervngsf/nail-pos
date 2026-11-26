import { describe, expect, it } from "vitest";
import { backDays, weekdayOrder } from "./weekStart";

describe("week start", () => {
  it("steps back to Monday or Sunday", () => {
    expect(backDays(4, 1)).toBe(3); // Thursday → Monday
    expect(backDays(0, 1)).toBe(6); // Sunday belongs to the week that began Monday
    expect(backDays(4, 0)).toBe(4); // Thursday → Sunday
    expect(backDays(0, 0)).toBe(0);
  });
  it("orders weekdays", () => {
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
