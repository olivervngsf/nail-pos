import { describe, expect, it } from "vitest";
import { alertsFor, healthOf, openAlerts, sampleOverview, stripeState, totals, vsWeekAgo } from "./health";

const NOW = "2026-11-18T20:00:00Z";
const o = sampleOverview(NOW);
const by = (id: string) => o.salons.find((s) => s.salon_id === id)!;

describe("admin health", () => {
  it("stripe state", () => {
    expect(stripeState(by("s-happy"))).toBe("payouts_paused");
    expect(stripeState(by("s-kim"))).toBe("needs_info");
    expect(stripeState(by("s-vy"))).toBe("none");
    expect(stripeState(by("s-cosmo"))).toBe("live");
  });

  it("alerts per salon + health word", () => {
    const happy = alertsFor(by("s-happy"), NOW);
    expect(happy.map((a) => a.kind)).toEqual(["stripe_payouts"]);
    expect(healthOf(by("s-happy"), happy)).toBe("bad");
    expect(alertsFor(by("s-kim"), NOW).map((a) => a.kind)).toEqual(["setup_stuck"]);
    expect(alertsFor(by("s-vy"), NOW)[0].title).toBe("Owner hasn’t joined yet");
    expect(healthOf(by("s-cosmo"), alertsFor(by("s-cosmo"), NOW))).toBe("good");
  });

  it("handled today hides the alert; bad first", () => {
    const open = openAlerts(o);
    expect(open.some((a) => a.salon_id === "s-lotus")).toBe(false);
    expect(open[0].level).toBe("bad");
    expect(open).toHaveLength(3);
  });

  it("totals + vs last week", () => {
    const t = totals(o);
    expect(t).toMatchObject({ salons: 6, live: 4, settingUp: 2, ticketsToday: 150, centsToday: 841200 });
    expect(vsWeekAgo(150, 141, "Tue")).toBe("+6% vs last Tue");
    expect(vsWeekAgo(10, 0, "Tue")).toBeNull();
  });
});
