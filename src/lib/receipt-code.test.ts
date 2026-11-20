import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isReceiptCode, receiptCode, sha256Hex } from "./receipt-code";

describe("receipt code", () => {
  it("sha256 matches the standard (empty, abc, long, Vietnamese)", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const s of ["x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(200), "Gel màu tay · Tuyết"])
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
  });

  it("is 16 hex from the ticket id, same for any letter case, never the id itself", () => {
    const id = "803aa014-5b7f-4568-bb12-c4b55ce97587";
    const c = receiptCode(id);
    expect(isReceiptCode(c)).toBe(true);
    expect(c).toBe(createHash("sha256").update(`receipt:${id}`).digest("hex").slice(0, 16));
    expect(receiptCode(id.toUpperCase())).toBe(c);
    expect(id.replace(/-/g, "")).not.toContain(c);
    expect(isReceiptCode(id)).toBe(false);
  });
});
