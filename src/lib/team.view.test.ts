import { describe, expect, it } from "vitest";
import { clockWhen, groupOf, statusTone } from "./team";

describe("team list helpers", () => {
  const today = new Date("2026-11-25T15:00:00");
  it("tones: in good, invited/no PIN watch, locked bad, out none, license by days", () => {
    expect(statusTone("in", { licenseExpires: null }, today)).toBe("good");
    expect(statusTone("out", { licenseExpires: null }, today)).toBeNull();
    expect(statusTone("invited", { licenseExpires: null }, today)).toBe("watch");
    expect(statusTone("locked", { licenseExpires: null }, today)).toBe("bad");
    expect(statusTone("license", { licenseExpires: "2026-12-20" }, today)).toBe("watch");
    expect(statusTone("license", { licenseExpires: "2026-11-28" }, today)).toBe("bad");
  });
  it("groups roles", () => {
    expect(groupOf("owner")).toBe("boss");
    expect(groupOf("manager")).toBe("boss");
    expect(groupOf("front_desk")).toBe("desk");
    expect(groupOf("tech")).toBe("tech");
  });
  it("says when", () => {
    expect(clockWhen(null, today)).toBe("");
    expect(clockWhen("2026-11-25T09:02:00", today)).toBe("9:02 AM");
    expect(clockWhen("2026-11-23T18:10:00", today)).toMatch(/^Mon 6:10 PM$/);
    expect(clockWhen("2026-11-03T18:10:00", today)).toBe("Nov 3");
  });
});
