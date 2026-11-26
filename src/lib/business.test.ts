import { describe, expect, it } from "vitest";
import { areaCodeOk, areaFromPhone, draftMissing, draftProblem, einOk, formatEin, sampleBusiness, toDraft, type BusinessDraft } from "./business";

const full: BusinessDraft = { legalName: "Lotus Nails LLC", businessType: "llc", ein: "12-3456789", website: "", areaCode: "408", consentMethod: "booking_page", promosOk: true, confirm: true };
const b = { einLast4: null, address: "1550 S Bascom Ave, Campbell, CA 95008" };

describe("business details", () => {
  it("formats + checks the EIN and area code", () => {
    expect(formatEin("123456789")).toBe("12-3456789");
    expect(formatEin("12")).toBe("12");
    expect(einOk("12-3456789")).toBe(true);
    expect(einOk("1234")).toBe(false);
    expect(areaCodeOk("408")).toBe(true);
    expect(areaCodeOk("108")).toBe(false);
  });
  it("suggests the area code from the salon phone", () => {
    expect(areaFromPhone("+14085550100")).toBe("408");
    expect(areaFromPhone("(669) 555-0100")).toBe("669");
    expect(areaFromPhone("")).toBe("");
  });
  it("nothing missing when every field is filled and confirmed", () => expect(draftMissing(full, b)).toEqual([]));
  it("lists what's missing, in form order", () => {
    expect(draftMissing({ ...full, legalName: "", ein: "", confirm: false }, b)).toEqual(["legal_name", "ein", "confirm"]);
    expect(draftMissing(full, { einLast4: null, address: "" })).toEqual(["address"]);
  });
  it("EIN already on file or sole proprietor = no EIN needed now", () => {
    expect(draftMissing({ ...full, ein: "" }, { ...b, einLast4: "6789" })).toEqual([]);
    expect(draftMissing({ ...full, businessType: "sole_prop", ein: "" }, b)).toEqual([]);
  });
  it("half-typed EIN or area code blocks saving; empty doesn't", () => {
    expect(draftProblem({ ...full, ein: "1234" })).toBe("ein");
    expect(draftProblem({ ...full, areaCode: "12" })).toBe("area_code");
    expect(draftProblem({ ...full, ein: "", areaCode: "" })).toBeNull();
  });
  it("a new draft never carries the EIN back, and fills the area code from the phone", () => {
    const d = toDraft({ ...sampleBusiness(), areaCode: null });
    expect(d.ein).toBe("");
    expect(d.areaCode).toBe("408");
  });
});
