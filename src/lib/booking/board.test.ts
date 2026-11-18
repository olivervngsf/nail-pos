import { describe, expect, it } from "vitest";
import { liveBoard, mmss, waitLabel } from "./board";
import type { Appt } from "./appts";

const day = "2026-11-18";
const iso = (h: number, m = 0) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).toISOString();
const ap = (id: string, staffId: string, h0: number, m0: number, h1: number, m1: number, extra: Partial<Appt> = {}): Appt => ({
  id, salonId: "s", staffId, start: iso(h0, m0), end: iso(h1, m1), client: { name: id, phone: "" }, services: [], status: "booked", source: "phone", note: "", updatedAt: "", ...extra });
const staff = [
  { id: "kim", name: "Kim", clockedIn: true, turns: 3 },
  { id: "vy", name: "Vy", clockedIn: true, turns: 1 },
  { id: "linh", name: "Linh", clockedIn: true, turns: 2 },
  { id: "tuan", name: "Tuan", clockedIn: false, turns: 0 },
  { id: "mai", name: "Mai", clockedIn: true, turns: 0 },
];
const now = 12 * 3600; // 12:00

describe("live board", () => {
  it("puts busy first (least time left), then breaks, next up, free (fewest turns), not in", () => {
    const rows = liveBoard(staff, [
      ap("a1", "kim", 11, 30, 12, 30, { status: "arrived", ticketId: "t" }),      // 30 min left
      ap("a2", "linh", 11, 45, 12, 10, { status: "arrived", ticketId: "t2" }),    // 10 min left
      ap("b1", "mai", 11, 50, 12, 20, { status: "blocked" }),                      // on a break
      ap("a3", "vy", 12, 10, 13, 0),                                              // next up in 10 min
    ], now);
    expect(rows.map((r) => [r.name, r.state])).toEqual([["Linh", "busy"], ["Kim", "busy"], ["Mai", "break"], ["Vy", "soon"], ["Tuan", "out"]]);
    expect(rows[1].secs).toBe(30 * 60);
    expect(rows[1].pct).toBe(50);
    expect(rows[3].secs).toBe(10 * 60);
  });
  it("free: next booking later on, or free rest of day; time up = ready for bill = free; late = negative", () => {
    const rows = liveBoard(staff.slice(0, 3), [
      ap("a1", "kim", 11, 0, 11, 50, { status: "arrived", ticketId: "t" }),       // time's up: ready for bill
      ap("a2", "vy", 14, 0, 15, 0),
      ap("a3", "linh", 11, 50, 12, 40),                                           // 10 min late, not checked in
    ], now);
    expect(rows.map((r) => [r.name, r.state])).toEqual([["Linh", "soon"], ["Vy", "free"], ["Kim", "free"]]);   // free: fewest turns first
    expect(rows[0].secs).toBe(-600);
    expect(rows[1].nextAt).toBe(14 * 3600);
    expect(rows[2].nextAt).toBeNull();
  });
  it("formats countdowns and waits", () => {
    expect(mmss(754)).toBe("12:34");
    expect(mmss(-190)).toBe("+3:10");
    expect(mmss(3725)).toBe("1:02:05");
    expect(waitLabel(36)).toBe("36m");
    expect(waitLabel(65)).toBe("1h 05m");
  });
});
