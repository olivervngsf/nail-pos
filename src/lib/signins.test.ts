import { describe, expect, it } from "vitest";
import { daysIdle, demoSessions, describeAgent, isStale, lastSeen } from "./signins";

describe("sign-ins", () => {
  it("names devices in plain words", () => {
    expect(describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Mobile/15E148 PolishOSApp/1.4 PolishOS-iOS").name).toBe("iPhone · PolishOS app 1.4");
    expect(describeAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36")).toEqual({ name: "Mac · Chrome", kind: "computer" });
    expect(describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1")).toEqual({ name: "iPhone · Safari", kind: "phone" });
    expect(describeAgent("Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/129.0 Safari/537.36").kind).toBe("tablet");
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0").name).toBe("Windows computer · Edge");
    expect(describeAgent(null).name).toBe("Unknown device");
  });
  it("says when it was last used", () => {
    const now = Date.parse("2026-11-26T20:00:00Z");
    expect(lastSeen("2026-11-26T19:58:00Z", now)).toBe("Now");
    expect(lastSeen("2026-11-26T19:40:00Z", now)).toBe("20 min ago");
    expect(lastSeen("2026-11-26T17:00:00Z", now)).toBe("3h ago");
    expect(lastSeen("2026-11-25T12:00:00Z", now)).toBe("Yesterday");
  });
  it("flags a sign-in not used for 14+ days, never this one", () => {
    const now = Date.now();
    const s = demoSessions(now);
    expect(isStale(s[0], now)).toBe(false);
    expect(isStale(s[1], now)).toBe(false);
    expect(isStale(s[2], now)).toBe(true);
    expect(daysIdle(s[2], now)).toBe(26);
  });
});
