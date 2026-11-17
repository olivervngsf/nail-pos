import { describe, expect, it } from "vitest";
import { birthdayIn, dueBack, last4 } from "./clients";

describe("client next steps", () => {
  it("due back = last visit + usual gap", () => {
    const last = new Date(Date.now() - 26 * 86400000).toISOString();
    expect(dueBack(28, last)?.inDays).toBe(2);
    expect(dueBack(21, last)?.inDays).toBe(-5);
    expect(dueBack(null, last)).toBeNull();
    expect(dueBack(28, null)).toBeNull();
  });
  it("birthday: days until the next one (year ignored), wraps to next year", () => {
    const now = new Date(2026, 10, 17);
    expect(birthdayIn("2000-11-20", now)).toBe(3);
    expect(birthdayIn("2000-11-17", now)).toBe(0);
    expect(birthdayIn("2000-11-16", now)).toBe(364);
    expect(birthdayIn(null, now)).toBeNull();
  });
  it("last 4 phone digits", () => {
    expect(last4("+14085550142")).toBe("0142");
    expect(last4(null)).toBe("");
  });
});
