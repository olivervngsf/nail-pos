import { describe, expect, it } from "vitest";
import { skillsFor, skillMatch, skillsNeeded } from "./skills";

describe("tech skills", () => {
  it("reads the skills a service needs", () => {
    expect(skillsFor({ cat: "Pedicures", name: "Deluxe spa pedicure" })).toEqual(["Pedicure"]);
    expect(skillsFor({ cat: "Gel color", name: "Gel color manicure" })).toEqual(["Gel"]);
    expect(skillsFor({ cat: "Enhancements", name: "Acrylic full set" })).toEqual(["Acrylic"]);
    expect(skillsFor({ cat: "Add-ons", name: "Nail art (per nail)" })).toEqual(["Nail art"]);
    expect(skillsFor({ name: "Dip powder" })).toEqual(["Dip"]);
    expect(skillsFor({ cat: "Manicures", name: "Regular manicure" })).toEqual([]);
    expect(skillsFor({ cat: "Gel color", name: "Gel color pedicure" })).toEqual(["Gel", "Pedicure"]);
  });
  it("lists each needed skill once", () => {
    expect(skillsNeeded([{ name: "Gel manicure" }, { name: "Spa pedicure" }, { name: "Dip powder" }])).toEqual(["Gel", "Pedicure", "Dip"]);
  });
  it("says which skills a tech has", () => {
    expect(skillMatch(["Gel", "Dip"], ["Gel", "Pedicure"])).toEqual({ yes: ["Gel"], no: ["Pedicure"], all: false });
    expect(skillMatch(["gel", "Pedicure"], ["Gel", "Pedicure"]).all).toBe(true);
    expect(skillMatch(undefined, []).all).toBe(false);
  });
});
