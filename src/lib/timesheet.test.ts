import { describe, expect, it } from "vitest";
import { buildDay, dayList, demoTimesheet, fmtMin, timesheetCsv, weekOver, weekStart, type Punch } from "./timesheet";

const at = (hm: string) => new Date(`2026-11-25T${hm}:00Z`).toISOString();
let id = 1;
const p = (kind: "in" | "out", hm: string, day = "2026-11-25"): Punch => ({ id: id++, kind, at: at(hm), day, via: "device", device: null, fix: null });

describe("timesheet", () => {
  it("pairs a normal day with a break", () => {
    const d = buildDay("2026-11-25", [p("in", "09:00"), p("out", "12:00"), p("in", "12:30"), p("out", "17:30")], "2026-11-26", at("20:00"));
    expect(d.pairs).toHaveLength(2);
    expect(d.workedMin).toBe(480);
    expect(d.breakMin).toBe(30);
    expect(d.mealLate).toBe(false);
    expect(d.over8).toBe(false);
    expect(d.missingOut).toBe(false);
  });

  it("flags a late meal break and overtime", () => {
    const d = buildDay("2026-11-25", [p("in", "09:00"), p("out", "15:00"), p("in", "15:30"), p("out", "18:00")], "2026-11-26", at("20:00"));
    expect(d.mealLate).toBe(true);
    expect(d.over8).toBe(true);
  });

  it("today still in = open, counts to now; a past day still in = needs a fix", () => {
    const today = buildDay("2026-11-25", [p("in", "09:00")], "2026-11-25", at("14:00"));
    expect(today.openNow).toBe(true);
    expect(today.workedMin).toBe(300);
    expect(today.missingOut).toBe(false);
    const past = buildDay("2026-11-25", [p("in", "09:00")], "2026-11-26", at("14:00"));
    expect(past.missingOut).toBe(true);
    expect(past.workedMin).toBe(0);
  });

  it("an out with no in needs a fix", () => {
    expect(buildDay("2026-11-25", [p("out", "18:00")], "2026-11-26", at("20:00")).missingOut).toBe(true);
  });

  it("formats minutes without a space before h", () => {
    expect(fmtMin(313)).toBe("5h 13m");
    expect(fmtMin(45)).toBe("45m");
    expect(fmtMin(120)).toBe("2h");
    expect(fmtMin(0)).toBe("0h");
  });

  it("lists days and finds Monday", () => {
    expect(dayList("2026-11-23", "2026-11-25")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(weekStart("2026-11-26")).toBe("2026-11-23"); // Thursday → Monday
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
  });

  it("week over 40h", () => {
    const day = (d: string) => buildDay(d, [p("in", "08:00", d), p("out", "17:00", d)], "2026-12-01", at("20:00"));
    expect(weekOver(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"].map(day))).toBe(true);
  });

  it("CSV has one line per pair and the sample week has someone to fix", () => {
    const rows = demoTimesheet("2026-11-26");
    const csv = timesheetCsv(rows, dayList("2026-11-23", "2026-11-26"), "2026-11-26", "2026-11-26T22:00:00.000Z", (iso) => iso.slice(11, 16));
    expect(csv.split("\n")[0]).toBe("Person,Role,Day,In,Out,Hours,Fixed,Flags");
    expect(csv).toContain("needs fix");
  });
});
