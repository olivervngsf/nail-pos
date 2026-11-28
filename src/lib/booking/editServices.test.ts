import { describe, expect, it } from "vitest";
import { canEditServices, totalCents, withServices } from "./editServices";
import type { Appt } from "./appts";

const a = { id: "a", salonId: "s", start: "2026-12-01T18:00:00.000Z", end: "2026-12-01T18:45:00.000Z", staffId: null, status: "booked",
  source: "phone", note: "", services: [{ name: "Gel manicure", minutes: 45, cents: 3500 }], updatedAt: "x" } as Appt;

describe("edit services on a booking", () => {
  it("moves the end to match the new total", () => {
    const b = withServices(a, [...a.services, { name: "Nail art", minutes: 15, cents: 1000 }]);
    expect(b.end).toBe("2026-12-01T19:00:00.000Z");
    expect(b.start).toBe(a.start);
    expect(b.updatedAt).toBe("");
    expect(totalCents(b.services)).toBe(4500);
  });
  it("never shorter than 15 minutes", () => {
    expect(withServices(a, [{ name: "Polish change", minutes: 5, cents: 800 }]).end).toBe("2026-12-01T18:15:00.000Z");
  });
  it("only before the chair", () => {
    expect(canEditServices({ status: "confirmed" })).toBe(true);
    expect(canEditServices({ status: "arrived", ticketId: "t" })).toBe(false);
    expect(canEditServices({ status: "canceled" })).toBe(false);
  });
});
