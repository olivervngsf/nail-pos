import { describe, expect, it } from "vitest";
import { KINDS, alertEmail, alertText, channelOf, emptySettings, recipientsOf, demoNotify } from "./notify";

describe("notifications", () => {
  it("defaults: email on for all, text on for the urgent ones", () => {
    expect(channelOf(null, "refund_big")).toEqual({ email: true, text: true });
    expect(channelOf(null, "drawer_off")).toEqual({ email: true, text: false });
    expect(channelOf({ ...emptySettings(), on: { drawer_off: { email: false } } }, "drawer_off")).toEqual({ email: false, text: false });
  });
  it("covers every alert on the board, 13 in 4 groups", () => {
    expect(KINDS).toHaveLength(13);
    expect(new Set(KINDS.map((k) => k.group)).size).toBe(4);
    expect(KINDS.filter((k) => k.live).map((k) => k.key)).toEqual(["refund_big", "discount_big", "drawer_off", "pin_locked", "clock_refused", "plan_failed", "credit_low"]);
  });
  it("nobody picked = owner + every manager", () => {
    const { people } = demoNotify();
    expect(recipientsOf(emptySettings(), people)).toHaveLength(2);
    expect(recipientsOf({ ...emptySettings(), to: ["m-bao"] }, people).map((p) => p.name)).toEqual(["Bao Tran"]);
  });
  it("writes a short email + text and escapes names", () => {
    const e = alertEmail("Mai <Nails>", "Ticket #901 refunded: $80.00", "Who did it.", "https://x.app");
    expect(e.subject).toBe("Mai <Nails>: Ticket #901 refunded: $80.00");
    expect(e.html).toContain("Mai &lt;Nails&gt;");
    expect(e.html).toContain("https://x.app/settings/activity");
    expect(alertText("Lotus", "Cash drawer short $15.00 on Nov 27")).toBe("Lotus: Cash drawer short $15.00 on Nov 27. Details in PolishOS → Activity log.");
  });
});
