import { describe, expect, it } from "vitest";
import type { Appt } from "./appts";
import { at, dayKey } from "./grid";
import { isHere, isWaiting, nextWalkCode, onGrid, turnCounts, turnOrder, waitedMin } from "./turns";

const day = dayKey(new Date());
const ap = (id: string, staffId: string | null, s: number, e: number, extra: Partial<Appt> = {}): Appt =>
  ({ id, salonId: "s", start: at(day, s), end: at(day, e), staffId, services: [], status: "booked", source: "desk", note: "", updatedAt: "", ...extra });

describe("walk-ins", () => {
  it("waiting walk-ins and walk-outs stay off the grid", () => {
    const w = ap("w", null, 600, 645, { source: "kiosk" });
    expect(isWaiting(w)).toBe(true);
    expect(onGrid(w)).toBe(false);
    expect(onGrid({ ...w, status: "arrived", ticketId: "t" })).toBe(true);
    expect(onGrid({ ...w, status: "walked_out" })).toBe(false);
    expect(isWaiting(ap("d", null, 600, 645))).toBe(false);   // a desk booking is not a walk-in
  });
  it("wait time counts from when they came in", () => {
    const a = { start: new Date(Date.now()).toISOString(), arrivedAt: new Date(Date.now() - 18 * 60_000).toISOString() };
    expect(waitedMin(a)).toBe(18);
  });
  it("ticket codes run B1, B2 … across kiosk + desk", () => {
    expect(nextWalkCode([ap("a", null, 600, 645, { source: "kiosk" }), ap("b", null, 610, 650, { source: "walk_in" }), ap("c", "k", 600, 660)], day)).toBe("B3");
  });
});

describe("turns", () => {
  it("turns = tickets per tech that day (one per ticket, even with 2 services)", () => {
    const now = new Date().toISOString();
    const c = turnCounts([
      { createdAt: now, status: "paid", lines: [{ staffId: "k" }, { staffId: "k" }] },
      { createdAt: now, status: "open", lines: [{ staffId: "k" }, { staffId: "t" }] },
      { createdAt: "2020-01-01T10:00:00Z", status: "paid", lines: [{ staffId: "t" }] },
    ], day);
    expect(c).toEqual({ k: 2, t: 1 });
  });
  it("order: free first (fewest turns, then free longest), then busy (soonest free), then not in", () => {
    const staff = [
      { id: "k", name: "Kim", clockedIn: true, turns: 3 },
      { id: "t", name: "Tuyet", clockedIn: true, turns: 1 },
      { id: "n", name: "Ngoc", clockedIn: true, turns: 1 },
      { id: "h", name: "Hoa", clockedIn: false, turns: 0 },
      { id: "l", name: "Linh", clockedIn: true, turns: 0 },
    ];
    const appts = [ap("1", "l", 590, 660), ap("2", "n", 540, 600), ap("3", "t", 540, 580)];
    const o = turnOrder(staff, appts, 620);
    expect(o.map((x) => x.id)).toEqual(["t", "n", "k", "l", "h"]);   // Tuyet free since 9:40 beats Ngoc free since 10:00
    expect(o[3].busyUntil).toBe(660);
  });
});

describe("checked in (here)", () => {
  const b = { source: "phone", status: "confirmed", arrivedAt: null, ticketId: null } as unknown as Appt;
  it("is here only after check-in and before the ticket", () => {
    expect(isHere(b)).toBe(false);
    expect(isHere({ ...b, arrivedAt: new Date().toISOString() })).toBe(true);
    expect(isHere({ ...b, arrivedAt: new Date().toISOString(), ticketId: "t1" })).toBe(false);
    expect(isHere({ ...b, arrivedAt: new Date().toISOString(), source: "kiosk" })).toBe(false);
    expect(isHere({ ...b, arrivedAt: new Date().toISOString(), status: "canceled" })).toBe(false);
  });
});
