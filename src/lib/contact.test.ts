import { describe, expect, it } from "vitest";
import { isMasked, showPhone } from "./contact";

describe("client contact on the device", () => {
  it("knows a hidden value", () => {
    expect(isMasked("••7011")).toBe(true);
    expect(isMasked("mari•••@gmail.com")).toBe(true);
    expect(isMasked("+14085550142")).toBe(false);
    expect(isMasked("")).toBe(false);
    expect(isMasked(undefined)).toBe(false);
  });
  it("shows a hidden phone as is, formats a full one", () => {
    expect(showPhone("••7011")).toBe("••7011");
    expect(showPhone("+14085550142")).toBe("(408) 555-0142");
    expect(showPhone(null)).toBe("");
  });
});
