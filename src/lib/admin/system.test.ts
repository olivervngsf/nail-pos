import { describe, expect, it } from "vitest";
import { checks, sampleSystem, sortChecks, summary, totalCents, type SystemFacts } from "./system";

const base = (): SystemFacts => ({ ...sampleSystem(new Date("2026-11-18T12:00:00Z")) });

describe("System tab", () => {
  it("lists every hand check + the live facts", () => {
    const keys = checks(base()).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["backups", "restore_test", "sentry", "uptime", "two_step", "texting", "stripe"]));
  });
  it("a restore test older than 3 months turns to Check", () => {
    const f = base();
    f.checks = [{ key: "restore_test", status: "ok", note: "done", at: "2026-07-01T00:00:00Z", by: "Oliver" }];
    const c = checks(f).find((x) => x.key === "restore_test")!;
    expect(c.status).toBe("warn");
    expect(c.note).toContain("do it again");
  });
  it("2-step: an admin without it = Check, and says who", () => {
    const f = base();
    f.admins = [{ name: "Oliver", twoStep: true }, { name: "Elang", twoStep: false }];
    const c = checks(f).find((x) => x.key === "two_step")!;
    expect(c.status).toBe("warn");
    expect(c.note).toBe("Oliver ✓ · Elang ✗");
  });
  it("Stripe: a payment message with no ticket = Check; none at all = Not set", () => {
    const f = base();
    f.stripe = { day: 1, week: 3, payWeek: 2, payMatched: 1, last: f.now };
    expect(checks(f).find((x) => x.key === "stripe")!.status).toBe("warn");
    f.stripe = { day: 0, week: 0, payWeek: 0, payMatched: 0, last: null };
    expect(checks(f).find((x) => x.key === "stripe")!.status).toBe("not_set");
  });
  it("sorts worst first and sums up", () => {
    const list = sortChecks(checks(base()));
    expect(list[0].status).not.toBe("ok");
    expect(list[list.length - 1].status).toBe("ok");
    expect(summary(list).level).toBe("warn");
    expect(summary(list.map((c) => ({ ...c, status: "ok" as const }))).text).toBe("All normal");
    expect(summary([{ ...list[0], status: "bad" }]).text).toBe("1 problem");
  });
  it("adds up the month's costs", () => {
    expect(totalCents(base().costs)).toBe(8400);
  });
});
