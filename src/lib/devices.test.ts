import { describe, expect, it } from "vitest";
import { deviceState, devicesOn } from "./devices";

const NOW = Date.parse("2026-11-19T18:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe("salon device on / off", () => {
  it("on = said I'm on in the last 10 minutes", () => {
    expect(deviceState(ago(0), NOW)).toBe("on");
    expect(deviceState(ago(9), NOW)).toBe("on");
    expect(deviceState(ago(10), NOW)).toBe("off");
    expect(deviceState(ago(3000), NOW)).toBe("off");
  });
  it("never = set up but never opened", () => {
    expect(deviceState(null, NOW)).toBe("never");
    expect(deviceState(undefined, NOW)).toBe("never");
  });
  it("counts the ones that are on", () => {
    expect(devicesOn([ago(1), ago(2), ago(1500), null], NOW)).toBe(2);
  });
});
