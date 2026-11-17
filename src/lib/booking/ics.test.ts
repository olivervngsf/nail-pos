import { describe, expect, it } from "vitest";
import { bookingIcs, fold, icsText, local } from "./ics";

const b = {
  uid: "a1", salon: { name: "Test Nails", address: "1234 Story Rd, San Jose, CA", phone: "(408) 555-0100", tz: "America/Los_Angeles" },
  day: "2026-11-17", start: 660, minutes: 50, when: "Tue, Nov 17 · 11:00 AM", firstName: "Tom",
  lines: ["Gel manicure · Kim", "Pedicure · Tuyết"], total: "$65", manageUrl: "https://polishosapp.com/demo", cancelHours: 2,
  ownerNote: "Parking: free lot behind the salon.",
};

describe("booking .ics", () => {
  it("keeps salon wall time with its zone", () => {
    const s = bookingIcs(b);
    expect(s).toContain("DTSTART;TZID=America/Los_Angeles:20261117T110000");
    expect(s).toContain("DTEND;TZID=America/Los_Angeles:20261117T115000");
  });
  it("escapes commas so the full address survives", () => {
    expect(icsText("1234 Story Rd, San Jose, CA")).toBe("1234 Story Rd\\, San Jose\\, CA");
    expect(bookingIcs(b).replace(/\r\n /g, "")).toContain("LOCATION:Test Nails\\, 1234 Story Rd\\, San Jose\\, CA");
  });
  it("puts link, phone and owner note in the notes", () => {
    const s = bookingIcs(b).replace(/\r\n /g, "");
    expect(s).toContain("URL:https://polishosapp.com/demo");
    expect(s).toContain("Call: (408) 555-0100");
    expect(s).toContain("Parking: free lot behind the salon.");
    expect(s).toContain("TRIGGER:-PT60M");
  });
  it("rolls past midnight and folds long lines", () => {
    expect(local("2026-11-17", 1440 + 30)).toBe("20261118T003000");
    expect(fold("x".repeat(200)).split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
