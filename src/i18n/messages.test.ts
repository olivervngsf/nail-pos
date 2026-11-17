import { describe, expect, it } from "vitest";
import en from "./en.json";
import vi from "./vi.json";

const keys = (o: object, pre = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${pre}${k}.`) : [`${pre}${k}`]));

describe("translations", () => {
  it("every English label has a Vietnamese one, and back", () => {
    expect(keys(vi).sort()).toEqual(keys(en).sort());
  });
});
