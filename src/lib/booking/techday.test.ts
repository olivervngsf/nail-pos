import { describe, expect, it } from "vitest";
import { dayRows, fmtMins, minsSince, minsUntil } from "./techday";
import type { Appt } from "./appts";

const appt = (id: string, start: string, end: string): Appt => ({
  id, salonId: "s", start: `2026-11-24T${start}:00`, end: `2026-11-24T${end}:00`, services: [], status: "booked", source: "desk", note: "", updatedAt: "",
});
const t = (hm: string) => new Date(`2026-11-24T${hm}:00`).getTime();

describe("tech day rows", () => {
  const list = [appt("b", "11:00", "12:00"), appt("a", "09:00", "10:00"), appt("c", "12:10", "13:00")];

  it("sorts, adds a free gap of 30+ min, none for a short break", () => {
    expect(dayRows(list).map((r) => r.kind === "appt" ? r.a.id : r.kind)).toEqual(["a", "gap", "b", "c"]);
  });

  it("puts the now line before the next client, inside a gap, or at the end", () => {
    expect(dayRows(list, t("08:00")).map((r) => r.kind === "appt" ? r.a.id : r.kind)).toEqual(["now", "a", "gap", "b", "c"]);
    expect(dayRows(list, t("10:15")).map((r) => r.kind === "appt" ? r.a.id : r.kind)).toEqual(["a", "now", "gap", "b", "c"]);
    expect(dayRows(list, t("12:05")).map((r) => r.kind === "appt" ? r.a.id : r.kind)).toEqual(["a", "gap", "b", "now", "c"]);
    expect(dayRows(list, t("15:00")).map((r) => r.kind === "appt" ? r.a.id : r.kind)).toEqual(["a", "gap", "b", "c", "now"]);
  });

  it("no now line on an empty day", () => {
    expect(dayRows([], t("10:00"))).toEqual([]);
  });

  it("minutes and words", () => {
    expect(minsSince("2026-11-24T09:00:00", t("09:25"))).toBe(25);
    expect(minsSince("2026-11-24T09:00:00", t("08:00"))).toBe(0);
    expect(minsUntil("2026-11-24T09:00:00", t("08:20"))).toBe(40);
    expect(fmtMins(45)).toBe("45 min");
    expect(fmtMins(80)).toBe("1h 20 min");
    expect(fmtMins(120)).toBe("2h");
    expect(fmtMins(95, "phút")).toBe("1h 35 phút");
  });
});
