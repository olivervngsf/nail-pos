import { describe, expect, it } from "vitest";
import { can, canOk, diffFromDefaults } from "./roles";

describe("roles + permissions", () => {
  it("defaults = how the app worked before", () => {
    expect(can({}, "owner", "ok.refund")).toBe(true);
    expect(can({}, "manager", "ok.refund")).toBe(true);
    expect(can({}, "manager", "set.money")).toBe(true);
    expect(can({}, "front_desk", "ok.discount")).toBe(false);
    expect(can({}, "tech", "ok.discount")).toBe(false);
  });
  it("owner changes win, owner can't be limited", () => {
    const p = { manager: { "ok.refund": false, "set.money": false }, front_desk: { "ok.discount": true } };
    expect(canOk(p, "manager", "refund")).toBe(false);
    expect(can(p, "manager", "set.money")).toBe(false);
    expect(canOk(p, "front_desk", "discount")).toBe(true);
    expect(canOk(p, "owner", "refund")).toBe(true);
  });
  it("front desk never opens Settings, techs never OK", () => {
    expect(can({ front_desk: { "set.team": true } }, "front_desk", "set.team")).toBe(false);
    expect(can({ front_desk: { "ok.close": true } }, "tech", "ok.close")).toBe(false);
  });
  it("keeps only changes from the defaults", () => {
    expect(diffFromDefaults({ manager: { "ok.refund": true, "ok.close": false }, front_desk: { "ok.menu": false, "set.team": true } }))
      .toEqual({ manager: { "ok.close": false } });
  });
});
