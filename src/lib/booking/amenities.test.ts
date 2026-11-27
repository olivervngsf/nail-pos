import { describe, expect, it } from "vitest";
import { cleanAmenities, toggleAmenity, AMENITIES } from "./amenities";
import en from "@/i18n/en.json";
import vi from "@/i18n/vi.json";

describe("amenities", () => {
  it("keeps known keys once, in list order", () => {
    expect(cleanAmenities(["wifi", "wine", "nope", "wifi", 3])).toEqual(["wine", "wifi"]);
    expect(cleanAmenities(null)).toEqual([]);
  });
  it("toggles on and off", () => {
    expect(toggleAmenity(["wifi"], "wine")).toEqual(["wine", "wifi"]);
    expect(toggleAmenity(["wine", "wifi"], "wine")).toEqual(["wifi"]);
  });
  it("has words for every amenity in EN + VI", () => {
    for (const a of AMENITIES) {
      expect((en as { amenities: Record<string, string> }).amenities[a.key]).toBeTruthy();
      expect((vi as { amenities: Record<string, string> }).amenities[a.key]).toBeTruthy();
    }
  });
});
