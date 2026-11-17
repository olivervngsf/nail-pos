import { describe, expect, it } from "vitest";
import { pointsFor, toNext } from "./loyalty";

describe("loyalty points", () => {
  it("1 point per $1 of service (rounded down), a punch per visit", () => {
    expect(pointsFor({ kind: "points", pointsPerDollar: 1 }, 4250)).toBe(42);
    expect(pointsFor({ kind: "points", pointsPerDollar: 2 }, 4250)).toBe(85);
    expect(pointsFor({ kind: "visits", pointsPerDollar: 1 }, 4250)).toBe(1);
    expect(pointsFor({ kind: "points", pointsPerDollar: 1 }, -500)).toBe(0);
  });
  it("to next reward", () => {
    expect(toNext(72, 100)).toBe(28);
    expect(toNext(130, 100)).toBe(0);
  });
});
