import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, hoursLabel, plan, testOn } from "./reminderPrefs";

describe("reminder prefs", () => {
  it("labels hours with no space, off when 0", () => {
    expect(hoursLabel(24)).toBe("24h before");
    expect(hoursLabel(0)).toBe("Off");
    expect(hoursLabel(2, "vi")).toBe("2h trước");
  });
  it("says what a client gets", () => {
    expect(plan(DEFAULT_PREFS)).toBe("Clients get a confirmation right away, then a reminder 24h before and 2h before.");
    expect(plan({ first: 0, second: 0, testUntil: null })).toBe("Clients get the confirmation only, no reminders.");
  });
  it("test mode only while its 24h window is open", () => {
    const now = new Date("2026-11-26T20:00:00Z");
    expect(testOn({ testUntil: "2026-11-27T19:00:00Z" }, now)).toBe(true);
    expect(testOn({ testUntil: "2026-11-26T19:00:00Z" }, now)).toBe(false);
    expect(plan({ first: 24, second: 1, testUntil: "2026-11-27T19:00:00Z" }, "en", now)).toContain("3 minutes after booking");
  });
});
