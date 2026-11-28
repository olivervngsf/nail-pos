import { describe, expect, it } from "vitest";
import { byState, cleanAbout, cleanList, firstName, hasProfile, profileState, toggle, type StaffProfile } from "./staffProfile";

const base: StaffProfile = { membershipId: "m", name: "Kim Tran", role: "tech", about: "", bestAt: [], languages: [], years: null, photo: null,
  updatedAt: null, updatedBy: null, askedAt: null, photos: [] };

describe("tech profiles", () => {
  it("knows each profile's state, waiting photos first", () => {
    expect(profileState(base)).toBe("none");
    expect(profileState({ ...base, askedAt: "2026-11-27T10:00:00Z" })).toBe("asked");
    expect(profileState({ ...base, about: "Hi" })).toBe("live");
    expect(profileState({ ...base, about: "Hi", photos: [{ id: "1", path: "p", label: "", status: "waiting" }] })).toBe("waiting");
    expect(profileState({ ...base, photos: [{ id: "1", path: "p", label: "", status: "hidden" }] })).toBe("none");
    const list = [{ ...base, name: "Linh", about: "x" }, { ...base, name: "Vy" }, { ...base, name: "Kim", photos: [{ id: "1", path: "p", label: "", status: "waiting" as const }] }];
    expect(list.sort(byState).map((p) => p.name)).toEqual(["Kim", "Vy", "Linh"]);
  });
  it("cleans lists like the database: trims, drops blanks + repeats, caps", () => {
    expect(cleanList(["Nail art", " gel ", "nail art", "", "Dip"], 2, 24)).toEqual(["Nail art", "gel"]);
    expect(cleanAbout("  " + "a".repeat(200))).toHaveLength(120);
  });
  it("shows clients the first name only", () => {
    expect(firstName("  Kim Tran ")).toBe("Kim");
    expect(hasProfile({ id: "1", name: "Kim" })).toBe(false);
    expect(hasProfile({ id: "1", name: "Kim", photos: [{ path: "p", label: "" }] })).toBe(true);
  });
  it("toggles a chip", () => {
    expect(toggle(["Gel"], "Dip")).toEqual(["Gel", "Dip"]);
    expect(toggle(["Gel", "Dip"], "Gel")).toEqual(["Dip"]);
  });
});
