import { describe as group, expect, it } from "vitest";
import { describe, lastDays, sampleSalon, whoLabel } from "./salon";

group("admin salon page", () => {
  it("labels activity without private details", () => {
    expect(describe({ at: "", action: "ticket.refunded", who: "manager", note: null })).toEqual({ label: "Ticket refunded", group: "money", tone: "warn" });
    expect(describe({ at: "", action: "admin.note", who: "Elang", note: "x" }).group).toBe("notes");
    expect(describe({ at: "", action: "pay.something_new", who: "System", note: null })).toEqual({ label: "pay something new", group: "money" });
    expect(whoLabel("front_desk")).toBe("Front desk");
    expect(whoLabel("Oliver")).toBe("Oliver");
  });

  it("fills 8 days, oldest first", () => {
    const d = lastDays([{ day: "2026-11-17", tickets: 4, cents: 20000 }], "2026-11-18");
    expect(d).toHaveLength(8);
    expect(d[0].day).toBe("2026-11-11");
    expect(d[6]).toEqual({ day: "2026-11-17", tickets: 4, cents: 20000 });
    expect(d[7]).toEqual({ day: "2026-11-18", tickets: 0, cents: 0 });
  });

  it("sample salon has activity + devices", () => {
    const s = sampleSalon("s-lotus", "2026-11-18T20:00:00Z");
    expect(s.days).toHaveLength(8);
    expect(s.devices.length).toBe(2);
    expect(s.activity[0].action).toBe("ticket.paid");
  });
});
