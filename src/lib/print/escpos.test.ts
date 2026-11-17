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

describe("Vietnamese receipts print as an image", () => {
  it("only when the receipt has letters the printer can't show", async () => {
    const { needsImage } = await import("./escpos");
    expect(needsImage({ title: "Lotus Nails", sub: ["Receipt #1002"], rows: [["Gel manicure · Kim", "$45.00"], "sep", { bold: ["Total", "$45.00"] }] })).toBe(false);
    expect(needsImage({ title: "Lotus Nails", rows: [["Gel manicure · Ngọc", "$45.00"]] })).toBe(true);
  });
  it("packs dark pixels into printer dots and wraps them in GS v 0", async () => {
    const { packBitmap, imageBytes } = await import("./escpos");
    // 16x1 image: first pixel black, rest white
    const rgba = new Uint8Array(16 * 4).fill(255);
    rgba[0] = rgba[1] = rgba[2] = 0;
    const dots = packBitmap(rgba, 16, 1);
    expect([...dots]).toEqual([0x80, 0x00]);
    const bytes = imageBytes(dots, 16, 1);
    expect([...bytes.slice(5, 13)]).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 1, 0]);
  });
});

describe("receipt QR (digital receipt link)", () => {
  it("prints the QR as a centered image inside a text receipt", async () => {
    const { receiptBytes, qrRaster } = await import("./escpos");
    const q = qrRaster("https://polishosapp.com/r/abc", 5);
    expect(q.width).toBe(q.height);
    expect(q.width).toBeLessThanOrEqual(384);
    const b = [...receiptBytes({ title: "Lotus", rows: [["Gel", "$45.00"]], qr: "https://polishosapp.com/r/abc" }, 58)];
    const i = b.findIndex((x, k) => x === 0x1d && b[k + 1] === 0x76 && b[k + 2] === 0x30);
    expect(i).toBeGreaterThan(0);
    expect(b.slice(i - 3, i)).toEqual([0x1b, 0x61, 1]);
  });
});
