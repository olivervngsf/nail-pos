import { describe, expect, it } from "vitest";
import { at, fmtMin, isFree, lanes, minutesOf, overlapping, repeatDays, snap, freeStarts } from "./grid";

describe("calendar math", () => {
  it("snaps to 15 minutes", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(52)).toBe(45);
  });
  it("puts overlapping bookings side by side, never moves them", () => {
    const l = lanes([{ id: "a", start: 600, end: 660 }, { id: "b", start: 630, end: 690 }, { id: "c", start: 700, end: 730 }]);
    expect(l.a).toEqual({ lane: 0, lanes: 2 });
    expect(l.b).toEqual({ lane: 1, lanes: 2 });
    expect(l.c).toEqual({ lane: 0, lanes: 1 });
    expect([...overlapping([{ id: "a", start: 600, end: 660 }, { id: "b", start: 659, end: 700 }, { id: "c", start: 700, end: 730 }])].sort()).toEqual(["a", "b"]);
  });
  it("back-to-back is not an overlap; free check", () => {
    expect(overlapping([{ id: "a", start: 600, end: 660 }, { id: "b", start: 660, end: 700 }]).size).toBe(0);
    expect(isFree([{ id: "a", start: 600, end: 660 }], 660, 705)).toBe(true);
    expect(isFree([{ id: "a", start: 600, end: 660 }], 645, 705)).toBe(false);
  });
  it("repeat every 4 weeks × 3", () => {
    expect(repeatDays("2026-11-17", 4, 3)).toEqual(["2026-11-17", "2026-12-15", "2027-01-12"]);
  });
  it("local time round trip + labels", () => {
    expect(minutesOf(at("2026-11-17", 14 * 60 + 30))).toBe(870);
    expect(fmtMin(870)).toBe("2:30 PM");
    expect(fmtMin(9 * 60)).toBe("9:00 AM");
  });
});

describe("freeStarts", () => {
  it("skips busy times, closing time and the past", () => {
    const busy = [{ id: "a", start: 600, end: 660 }];
    const s = freeStarts(busy, 540, 720, 45, 560);
    expect(s).toEqual([660, 675]);
    expect(freeStarts([], 540, 600, 45)).toEqual([540, 555]);
  });
});
