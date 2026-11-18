import { describe, expect, it } from "vitest";
import { blankMember, licenseDaysLeft, memberStatus, payLabel, savePayload } from "./team";

const today = new Date(2026, 10, 17);
describe("team helpers", () => {
  it("pay label in plain words", () => {
    expect(payLabel({ payType: "commission", commissionPct: 60, hourlyCents: null, checkPct: 70 })).toBe("60% · 70/30");
    expect(payLabel({ payType: "hourly", commissionPct: null, hourlyCents: 1650, checkPct: 100 })).toBe("$16.50/hr");
    expect(payLabel({ payType: null, commissionPct: null, hourlyCents: null, checkPct: 100 })).toBe("—");
  });
  it("license days and row status (invited > locked > license due > no PIN > in/out)", () => {
    const m = { ...blankMember(), joined: true, hasPin: true, licenseExpires: "2026-12-07" };
    expect(licenseDaysLeft(m, today)).toBe(20);
    expect(memberStatus(m, today)).toBe("license");
    expect(memberStatus({ ...m, licenseExpires: "2027-12-07", clockedIn: true }, today)).toBe("in");
    expect(memberStatus({ ...m, joined: false }, today)).toBe("invited");
    expect(memberStatus({ ...m, locked: true }, today)).toBe("locked");
  });
  it("pay only goes to the server when the owner saves", () => {
    const x = { ...blankMember(), name: " Linh ", phone: "+14085550170", workdays: [1, 2] };
    expect(savePayload("s", x, false)).not.toHaveProperty("payType");
    expect(savePayload("s", x, true)).toMatchObject({ payType: "commission", commissionPct: "60", checkPct: "100", name: "Linh", workdays: ["1", "2"] });
  });
});
