import { describe, expect, it } from "vitest";
import { countTabs, maskPhone, search, searchMode } from "./omni";

const now = new Date("2026-11-20T18:00:00Z").getTime();
const data = {
  now,
  clients: [
    { id: "lp", number: 52104, name: "Linda Patel", phone: "+14085554821", last_visit: "2026-11-01T18:00:00Z" },
    { id: "mt", number: 77310, name: "Mai Tran", phone: "+16695554821", last_visit: "2026-09-30T18:00:00Z" },
    { id: "jb", number: 48213, name: "Jess Brown", phone: "+14085550188", last_visit: null },
  ],
  receipts: [{ id: "t1", number: 1042, client: "Amanda Lee", last4: "4821", cents: 6700, at: "2026-11-20T17:40:00Z", status: "paid" }],
  staff: [{ id: "k", name: "Kim", role: "tech", clockedIn: true }, { id: "l", name: "Linh", role: "tech", clockedIn: true }],
  bookings: [{ clientId: "lp", start: "2026-11-20T21:15:00Z" }],
};

describe("calendar search", () => {
  it("reads what is typed", () => {
    expect(searchMode("4821")).toBe("phone");
    expect(searchMode("(408) 555")).toBe("phone");
    expect(searchMode("#521")).toBe("number");
    expect(searchMode("T-1042")).toBe("receipt");
    expect(searchMode("t10")).toBe("receipt");
    expect(searchMode("Linda")).toBe("text");
    expect(searchMode("4")).toBe("text");
  });
  it("last 4 finds both clients with it (flagged), booked one first, and the card receipt", () => {
    const hits = search("4821", data);
    expect(hits.map((h) => h.id)).toEqual(["lp", "mt", "t1"]);
    expect(hits.every((h) => h.kind !== "client" || h.sameLast4)).toBe(true);
    expect(hits[0].kind === "client" && hits[0].next).toBe("2026-11-20T21:15:00Z");
    expect(countTabs(hits)).toEqual({ all: 3, clients: 2, receipts: 1, staff: 0 });
  });
  it("client number, receipt number, names + staff", () => {
    expect(search("#482", data).map((h) => h.id)).toEqual(["jb"]);
    expect(search("T-1042", data).map((h) => h.id)).toEqual(["t1"]);
    expect(search("li", data).map((h) => h.id)).toEqual(["lp", "l"]);
    expect(search("", data)).toEqual([]);
    const one = search("0188", data);
    expect(one[0].kind === "client" && one[0].sameLast4).toBe(false);
  });
  it("masks phones", () => {
    expect(maskPhone("+14085554821")).toBe("(408) •••-4821");
    expect(maskPhone("4821")).toBe("•••-4821");
    expect(maskPhone(null)).toBe("");
  });
});
