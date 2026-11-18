import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, keypadLength, pinProblem } from "./pin";

describe("pinProblem", () => {
  it("needs the rule length", () => {
    expect(pinProblem("2580", 6)).toBe("length");
    expect(pinProblem("258013", 6)).toBeNull();
    expect(pinProblem("25801a", 6)).toBe("length");
  });
  it("refuses one digit repeated and runs", () => {
    expect(pinProblem("111111", 6)).toBe("same");
    expect(pinProblem("123456", 6)).toBe("run");
    expect(pinProblem("654321", 6)).toBe("run");
  });
  it("10 digits = a phone number is fine, runs too", () => {
    expect(pinProblem("4085550110", 10)).toBeNull();
    expect(pinProblem("1234567890", 10)).toBeNull();
    expect(pinProblem("0000000000", 10)).toBe("same");
  });
});

describe("keypadLength", () => {
  it("uses the person's own PIN length first", () => {
    expect(keypadLength(4, DEFAULT_RULES)).toBe(4);
    expect(keypadLength(null, DEFAULT_RULES)).toBe(6);
    expect(keypadLength(undefined, { length: 10 })).toBe(10);
  });
});
