import { describe, expect, it } from "vitest";
import { creditLevel, creditPct, sendCost, stripAccents, textParts, textsLeft } from "./credit";

describe("text credit", () => {
  it("bar + level follow the last amount added and the warn %", () => {
    expect(creditPct({ balanceCents: 1840, lastAddCents: 2500 })).toBe(74);
    expect(creditLevel({ balanceCents: 1840, lastAddCents: 2500, warnPct: 20 })).toBe("good");
    expect(creditLevel({ balanceCents: 320, lastAddCents: 2500, warnPct: 20 })).toBe("low");
    expect(creditLevel({ balanceCents: 0, lastAddCents: 2500, warnPct: 20 })).toBe("empty");
    expect(creditPct({ balanceCents: 900, lastAddCents: 0 })).toBe(36); // nothing added yet: against $25
    expect(textsLeft({ balanceCents: 1840 })).toBe(920);
  });
  it("text parts: plain 160, accents 70", () => {
    expect(textParts("a".repeat(160)).parts).toBe(1);
    expect(textParts("a".repeat(161)).parts).toBe(2);
    expect(textParts("Mừng lễ").plain).toBe(false);
    expect(textParts("ừ".repeat(70)).parts).toBe(1);
    expect(textParts("ừ".repeat(71)).parts).toBe(2);
  });
  it("cost before send = people × parts × 2¢; no accents is cheaper", () => {
    const vi = "Cosmo Nails: Mừng lễ giảm 15% mọi dịch vụ đến 30/11. Đặt lịch: polishosapp.com/cosmo. Trả lời STOP để ngừng.";
    expect(sendCost(212, vi)).toEqual({ parts: 2, texts: 424, cents: 848 });
    expect(sendCost(212, stripAccents(vi))).toEqual({ parts: 1, texts: 212, cents: 424 });
  });
});
