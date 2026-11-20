import { describe, expect, it } from "vitest";
import { blockers, changeCents, discountCents, mergeOpen, quickCash, splitTipByPrice, staffOn, tipLineId, toPayload, totals, type ServiceLine, type Ticket } from "./ticket";

const base = (): Ticket => ({
  id: "11111111-1111-4111-8111-111111111111", salonId: "s", status: "open", createdAt: "2026-11-18T10:00:00Z", note: "", tips: {},
  lines: [
    { id: "a", name: "Gel manicure", minutes: 45, cents: 3500, staffId: "k", staffName: "Kim" },
    { id: "b", name: "Deluxe pedicure", minutes: 60, cents: 5500, staffId: "n", staffName: "Ngọc" },
  ],
});

describe("checkout money", () => {
  it("adds services, takes off the discount, adds tips", () => {
    const t = { ...base(), discount: { id: "d", kind: "amt" as const, value: 500, reason: "Regular client" }, tips: { k: 700, n: 1100 } };
    expect(totals(t)).toMatchObject({ subtotal: 9000, discount: 500, due: 8500, tip: 1800, total: 10300, toPay: 8500, left: 10300 });
  });
  it("cash part of a split comes off what's left", () => {
    const t = { ...base(), tips: { k: 500 }, cashParts: [{ id: "c1", cents: 2000, givenCents: 2000, at: "x" }] };
    expect(totals(t)).toMatchObject({ due: 9000, total: 9500, cashPaid: 2000, toPay: 7000, left: 7500 });
  });
  it("percent discount rounds to the cent and never goes below $0", () => {
    expect(discountCents(9000, { id: "d", kind: "pct", value: 15, reason: "x" })).toBe(1350);
    expect(discountCents(3333, { id: "d", kind: "pct", value: 10, reason: "x" })).toBe(333);
    expect(discountCents(500, { id: "d", kind: "amt", value: 1000, reason: "x" })).toBe(500);
  });
  it("cash change and short", () => {
    expect(changeCents(6500, 10000)).toBe(3500);
    expect(changeCents(6500, 6000)).toBe(-500);
  });
  it("quick cash amounts are exact then round bills", () => {
    expect(quickCash(6500)).toEqual([6500, 7000, 8000, 10000]);
    expect(quickCash(6200)).toEqual([6200, 6500, 7000, 10000]);
    expect(quickCash(10300)).toEqual([10300, 10500, 11000, 20000]);
    expect(quickCash(2000)).toEqual([2000, 5000, 10000, 20000]);
    expect(quickCash(10000)).toEqual([10000, 20000, 30000, 40000]);
  });
  it("tip split by service price loses no cent", () => {
    const s = splitTipByPrice(1800, base().lines);
    expect(s.k + s.n).toBe(1800);
    expect(s).toEqual({ k: 700, n: 1100 });
    expect(splitTipByPrice(1001, base().lines).k + splitTipByPrice(1001, base().lines).n).toBe(1001);
  });
  it("groups staff on the ticket", () => {
    const t = base();
    t.lines.push({ id: "c", name: "Nail design", minutes: 15, cents: 500, staffId: "k", staffName: "Kim" });
    expect(staffOn(t.lines)).toEqual([{ id: "k", name: "Kim", cents: 4000 }, { id: "n", name: "Ngọc", cents: 5500 }]);
  });
  it("blocks charge until every service has a person and a final price", () => {
    const t = base();
    expect(blockers(t)).toEqual([]);
    t.lines.push({ id: "c", name: "Waxing", minutes: 15, cents: 4500, priceFrom: true });
    expect(blockers(t)).toEqual(["staff", "price"]);
    expect(blockers({ ...t, lines: [] })).toEqual(["empty"]);
  });
  it("payload: discount negative, one tip line per person with a stable id", () => {
    const t = { ...base(), discount: { id: "d", kind: "pct" as const, value: 10, reason: "Birthday", approvalId: "ap" }, tips: { k: 700, n: 0 } };
    const p = toPayload(t);
    expect(p.lines.find((l) => l.kind === "discount")).toMatchObject({ cents: -900, approvalId: "ap" });
    expect(p.lines.filter((l) => l.kind === "tip")).toHaveLength(1);
    expect(tipLineId(t.id, "22222222-2222-4222-8222-222222222222")).toBe(tipLineId(t.id, "22222222-2222-4222-8222-222222222222"));
    expect(tipLineId(t.id, "22222222-2222-4222-8222-222222222222")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("gift cards on a ticket", () => {
  const base = { lines: [{ id: "l1", name: "Gel", minutes: 45, cents: 4500, staffId: "k" }], tips: {} };
  it("a gift card sold adds to what's owed, with no discount on it", () => {
    const s = totals({ ...base, discount: { id: "d", kind: "pct", value: 10, reason: "x" }, gifts: [{ id: "g", cardId: "c", last4: "2T4F", kind: "digital", cents: 5000 }] });
    expect(s).toMatchObject({ due: 4050, gift: 5000, total: 9050, toPay: 9050, left: 9050 });
  });
  it("a gift card used takes off what's left; cash tip still owed", () => {
    const s = totals({ ...base, tips: { k: 500 }, giftPays: [{ id: "p", cardId: "c", last4: "2T4F", cents: 3000 }] });
    expect(s).toMatchObject({ total: 5000, giftPaid: 3000, toPay: 1500, left: 2000 });
  });
  it("a gift-card-only ticket can be charged", () => {
    expect(blockers({ id: "t", salonId: "s", status: "open", createdAt: "", lines: [], tips: {}, note: "", gifts: [{ id: "g", cardId: "c", last4: "0147", kind: "plastic", cents: 2500 }] })).toEqual([]);
  });
  it("sale goes to the server as a gift_sale line", () => {
    const p = toPayload({ id: "t", salonId: "s", status: "open", createdAt: "", lines: [], tips: {}, note: "", gifts: [{ id: "g", cardId: "c", last4: "0147", kind: "plastic", cents: 2500 }] });
    expect(p.lines).toEqual([{ id: "g", kind: "gift_sale", giftCardId: "c", name: "Gift card •••• 0147", cents: 2500 }]);
  });
});

describe("ticket slip: desk and tech change the same ticket", () => {
  it("desk save only lists lines the desk has seen, so a tech's new line is kept", async () => {
    const { toPayload } = await import("./ticket");
    const t = { ...base(), seenLineIds: ["a", "b", "old-removed"], tips: {} };
    const p = toPayload(t);
    expect(p.seen).toEqual(expect.arrayContaining(["a", "b", "old-removed"]));
    expect(p.seen).not.toContain("tech-line");
  });
});

describe("loyalty reward on a ticket", () => {
  const base: Ticket = { id: "00000000-0000-4000-8000-000000000001", salonId: "s", status: "open", createdAt: "", note: "", tips: {},
    client: { phone: "+14085550142", name: "Lan" },
    lines: [{ id: "l1", name: "Gel", minutes: 45, cents: 5200, staffId: "k", staffName: "Kim" }],
    reward: { id: "r1", cents: 1000, points: 100 } };
  it("comes off what the client pays; techs' service price stays full", () => {
    expect(totals(base)).toMatchObject({ subtotal: 5200, reward: 1000, due: 4200, toPay: 4200 });
    expect(staffOn(base.lines)[0].cents).toBe(5200);
  });
  it("is sent as its own line, never more than what's due", () => {
    const p = toPayload(base);
    expect(p.lines).toContainEqual({ id: "r1", kind: "loyalty_reward", name: "Loyalty reward", cents: -1000 });
    expect(totals({ ...base, lines: [{ ...base.lines[0], cents: 600 }] }).due).toBe(0);
  });
});

describe("mergeOpen (ticket slip)", () => {
  const ln = (id: string, extra: Partial<ServiceLine> = {}): ServiceLine => ({ id, name: id, minutes: 30, cents: 3000, priceSet: true, ...extra });
  const tk = (lines: ServiceLine[], extra: Partial<Ticket> = {}): Ticket =>
    ({ id: "t1", salonId: "s1", status: "open", createdAt: "", lines, tips: {}, ...extra }) as Ticket;

  it("adds a line a tech added from the slip", () => {
    const m = mergeOpen(tk([ln("a")], { seenLineIds: ["a"] }), tk([ln("a"), ln("b")]), []);
    expect(m?.lines.map((l) => l.id)).toEqual(["a", "b"]);
    expect(m?.seenLineIds).toContain("b");
  });
  it("drops a line the tech removed on their phone, even with unsent desk edits", () => {
    const mine = tk([ln("a"), ln("b", { cents: 4000 })], { seenLineIds: ["a", "b"], synced: false } as Partial<Ticket>);
    const m = mergeOpen(mine, tk([ln("a")]), ["b"]);
    expect(m?.lines.map((l) => l.id)).toEqual(["a"]);
  });
  it("keeps a desk line not on the server yet, and a line the desk removed stays removed", () => {
    const mine = tk([ln("a"), ln("new")], { seenLineIds: ["a", "gone"] });
    expect(mergeOpen(mine, tk([ln("a"), ln("gone")]), [])).toBeNull();
  });
  it("a phone \"$45+\" line keeps priceSet=false so the desk sets the final price", () => {
    const m = mergeOpen(tk([ln("a")], { seenLineIds: ["a"] }), tk([ln("a"), ln("art", { priceFrom: true, priceSet: false })]), []);
    const art = m!.lines.find((l) => l.id === "art")!;
    expect(blockers(m!)).toContain("price");
    expect(art.priceSet).toBe(false);
  });
  it("doesn't add back a line the tech removed", () => {
    expect(mergeOpen(tk([ln("a")], { seenLineIds: ["a"] }), tk([ln("a"), ln("b")]), ["b"])).toBeNull();
  });
});
