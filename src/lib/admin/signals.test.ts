import { describe, expect, it } from "vitest";
import { sampleOverview } from "./health";
import { COLUMNS, columnSummary, devicesCell, healthRows, speedCell, stripeCell, talksCell, textingCell, worst } from "./signals";

const NOW = "2026-11-20T20:00:00.000Z";
const o = sampleOverview(NOW);
const by = (name: string) => o.salons.find((s) => s.salon_name.startsWith(name))!;

describe("salon health table", () => {
  it("worst tone wins: bad > watch > good > none", () => {
    expect(worst(["good", "none", "watch"])).toBe("watch");
    expect(worst(["watch", "bad"])).toBe("bad");
    expect(worst([])).toBe("none");
  });

  it("Stripe quiet: tickets for hours but no Stripe message for 3h", () => {
    expect(stripeCell(by("Bella"), NOW)).toMatchObject({ tone: "watch", word: "Quiet 3h" });
    expect(stripeCell(by("Cosmo"), NOW)).toMatchObject({ tone: "good", word: "OK" });
    expect(stripeCell(by("Happy"), NOW)).toMatchObject({ tone: "bad", word: "Payouts paused" });
    expect(stripeCell(by("Nails by Vy"), NOW).tone).toBe("none");
  });

  it("devices: all on = good, all off a day = bad, some off while busy = watch", () => {
    expect(devicesCell(by("Cosmo"), NOW)).toMatchObject({ tone: "good", word: "4 of 4" });
    expect(devicesCell(by("Lotus"), NOW)).toMatchObject({ tone: "bad", word: "0 of 3" });
    expect(devicesCell(by("Bella"), NOW)).toMatchObject({ tone: "watch", word: "1 of 3" });
    expect(devicesCell({ ...by("Bella"), last_ticket_at: "2026-11-20T10:00:00.000Z" }, NOW).tone).toBe("good");
  });

  it("speed: seconds + errors", () => {
    expect(speedCell(by("Bella"))).toMatchObject({ tone: "bad", word: "3.8s" });
    expect(speedCell(by("Cosmo"))).toMatchObject({ tone: "good", word: "0.9s" });
    expect(speedCell({ ...by("Cosmo"), speed_errors: 1 }).tone).toBe("watch");
    expect(speedCell(by("Kim")).tone).toBe("none");
  });

  it("talks: needs help or 3 weeks = bad, 2 weeks = watch", () => {
    expect(talksCell(by("Kim"), NOW)).toMatchObject({ tone: "bad", word: "9 days" });
    expect(talksCell(by("Lotus"), NOW).tone).toBe("bad");
    expect(talksCell(by("Cosmo"), NOW)).toMatchObject({ tone: "good", word: "3 days" });
    expect(talksCell(by("Nails by Vy"), NOW).tone).toBe("none");
  });

  it("texting: waiting, live, too many failed", () => {
    expect(textingCell(by("Bella"), NOW)).toMatchObject({ tone: "watch", word: "Waiting" });
    expect(textingCell(by("Cosmo"), NOW)).toMatchObject({ tone: "good", word: "Live" });
    expect(textingCell({ ...by("Cosmo"), texts_failed_30d: 100 }, NOW)).toMatchObject({ tone: "watch", word: "8% failed" });
  });

  it("rows: worst first; cards count the salons off on each check", () => {
    const rows = healthRows(o.salons, NOW);
    expect(rows[0].tone).toBe("bad");
    expect(rows.at(-1)!.tone === "none" || rows.at(-1)!.tone === "good").toBe(true);
    const bella = rows.find((r) => r.s.salon_name.startsWith("Bella"))!;
    expect(bella.tone).toBe("bad");
    expect(bella.why).toContain("Speed");
    const stripe = columnSummary(rows, "stripe");
    expect(stripe.off.map((r) => r.s.salon_name).sort()).toEqual(["Bella Nails & Spa", "Happy Nails", "Kim’s Nails"].sort());
    expect(stripe.tone).toBe("bad");
    expect(COLUMNS).toHaveLength(6);
  });
});
