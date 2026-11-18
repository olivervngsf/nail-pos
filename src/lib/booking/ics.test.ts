import { describe, expect, it } from "vitest";
import { bookingIcs, icsLocal } from "./ics";

describe("booking calendar file", () => {
  it("keeps the salon's wall time", () => {
    expect(icsLocal("2026-11-19", 570)).toBe("20261119T093000");
    expect(icsLocal("2026-11-19", 23 * 60 + 30 + 45)).toBe("20261120T001500"); // runs past midnight
  });
  it("uses the salon's time zone, not UTC", () => {
    const f = bookingIcs({ day: "2026-11-19", start: 570, minutes: 45, timeZone: "America/Los_Angeles", title: "Lotus Test Nails", location: "1550 S Bascom Ave, Campbell", uid: "abc", now: new Date("2026-11-18T00:00:00Z") });
    expect(f).toContain("DTSTART;TZID=America/Los_Angeles:20261119T093000");
    expect(f).toContain("DTEND;TZID=America/Los_Angeles:20261119T101500");
    expect(f).toContain("LOCATION:1550 S Bascom Ave\\, Campbell");
    expect(f).toContain("UID:abc@polishosapp.com");
    expect(f).not.toMatch(/DTSTART:\d+T\d+Z/);
  });
});
