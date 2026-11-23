import { describe, expect, it } from "vitest";
import { deviceCode, judge } from "./deviceInfo";

const dev = { id: "7e570000-0000-4000-8000-0000000000d1", salonId: "s1", name: "Front desk" };

describe("deviceCode", () => {
  it("is 4 easy letters, same every time", () => {
    const c = deviceCode(dev.id);
    expect(c).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
    expect(deviceCode(dev.id)).toBe(c);
  });
  it("differs between devices", () => {
    expect(deviceCode("a1b2c000-0000")).not.toBe(deviceCode("a1b2d000-0000"));
  });
  it("never throws on odd ids", () => { expect(deviceCode("demo-device")).toMatch(/^.{4}$/); });
});

describe("judge", () => {
  it("unknown when the list can't be read", () => { expect(judge(dev, null).state).toBe("unknown"); });
  it("removed when the salon no longer lists it", () => { expect(judge(dev, []).state).toBe("removed"); });
  it("active takes the salon's name + job", () => {
    const r = judge(dev, [{ id: dev.id, name: "Front desk iPad", kind: "clock", created_at: "2026-11-23", set_up_by: "Lan" }]);
    expect(r).toMatchObject({ state: "active", name: "Front desk iPad", kind: "clock", setUpBy: "Lan" });
  });
});
