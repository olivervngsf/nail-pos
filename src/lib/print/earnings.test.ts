import { describe, expect, it } from "vitest";
import { demoPayout } from "@/lib/closeday";
import { plain, receiptBytes } from "./escpos";
import { earningsDoc, worked, type EarnText } from "./earnings";

const txt: EarnText = {
  slipFor: (n) => `${n}'s earnings`, services: "Services", pay: () => "Pay", cardTips: "Card tips", cashTips: "Cash tips", feeOnTips: "Fee on tips",
  total: "Total", byCheck: "By check", inCash: "In cash", signature: "Received by", printed: "Printed",
};

describe("earnings slips", () => {
  const rows = demoPayout();
  it("one paper per person: each slip has only that person and ends with a cut", () => {
    for (const r of rows) {
      const bytes = receiptBytes(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "11/17 6:00 PM"), 58);
      const text = new TextDecoder().decode(bytes);
      expect(text).toContain(plain(`${r.name}'s earnings`));
      for (const o of rows) if (o.name !== r.name) expect(text).not.toContain(plain(`${o.name}'s earnings`));
      const cuts = bytes.reduce((n, b, i) => n + (b === 0x1d && bytes[i + 1] === 0x56 ? 1 : 0), 0);
      expect(cuts).toBe(1);
    }
  });
  it("skips people with no work", () => {
    expect(worked({ ...rows[0], tickets: 0, total_cents: 0, minutes: 0 })).toBe(false);
    expect(worked(rows[0])).toBe(true);
  });
});
