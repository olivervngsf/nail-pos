import { describe, expect, it } from "vitest";
import { addressOk, parseAddress } from "./address";

describe("parseAddress", () => {
  it("street, city, state ZIP", () => {
    expect(parseAddress("123 Main St, San Jose, CA 95112", "CA")).toEqual({ line1: "123 Main St", city: "San Jose", state: "CA", postal_code: "95112", country: "US" });
  });
  it("state and ZIP split by a comma", () => {
    const a = parseAddress("4 Pine Rd, Wildwood, MO, 63011", "CA");
    expect(a).toMatchObject({ city: "Wildwood", postal_code: "63011" });
  });
  it("missing parts fall back and are flagged", () => {
    const a = parseAddress("", "TX");
    expect(a.state).toBe("TX");
    expect(addressOk(a)).toBe(false);
    expect(addressOk(parseAddress("1 A St, Austin, TX 78701", "TX"))).toBe(true);
  });
});
