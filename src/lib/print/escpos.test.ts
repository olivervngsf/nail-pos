import { describe, expect, it } from "vitest";
import { center, plain, receiptBytes, twoCol } from "./escpos";

describe("ESC/POS receipt", () => {
  it("drops Vietnamese accents so cheap printers can show them", () => {
    expect(plain("Ngọc · Tuyết · Đào")).toBe("Ngoc - Tuyet - Dao");
    expect(plain("−$5.00")).toBe("-$5.00");
  });
  it("puts the amount on the right edge", () => {
    expect(twoCol("Gel manicure", "$45.00", 32)).toEqual(["Gel manicure" + " ".repeat(14) + "$45.00"]);
    expect(twoCol("Gel manicure", "$45.00", 32)[0]).toHaveLength(32);
  });
  it("wraps a long service name above its price", () => {
    const lines = twoCol("Collagen spa pedicure with hot stones and paraffin - Kim", "$68.00", 32);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines.at(-1)!.endsWith("$68.00")).toBe(true);
  });
  it("centers the title", () => {
    expect(center("Lotus", 11)).toBe("   Lotus");
  });
  it("starts with init and ends with feed + cut", () => {
    const b = receiptBytes({ title: "Lotus", rows: [["Gel", "$45.00"]] }, 58);
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...b.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect([...b].every((x) => x < 0x80)).toBe(true);
  });
});
