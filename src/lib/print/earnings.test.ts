import { describe, expect, it } from "vitest";
import { demoPayout } from "@/lib/closeday";
import { plain, receiptBytes, receiptLines } from "./escpos";
import { earningsDoc, worked, type EarnText } from "./earnings";
import { PRINT_DEFAULTS } from "./settings";

const txt: EarnText = {
  slipFor: (n) => `${n}'s earnings`, services: "Services", pay: () => "Pay", cardTips: "Card tips", cashTips: "Cash tips", feeOnTips: "Fee on tips",
  total: "Total", byCheck: "By check", inCash: "In cash", signature: "Received by", printed: "Printed",
  tips: "Tips", tipOn: (a) => `(tip ${a})`,
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
  it("rules: totals by default; every ticket = one line per ticket under Services (n): services (tip $x) ... amount", () => {
    const r = rows[0];
    const totals = new TextDecoder().decode(receiptBytes(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "now"), 58));
    expect(totals).not.toContain("Gel manicure");
    const each = new TextDecoder().decode(receiptBytes(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "now", { ...PRINT_DEFAULTS.staff, tickets: true }), 80));
    const lines = each.split("\n");
    const svc = lines.findIndex((l) => l.startsWith("Services ("));
    expect(lines[svc + 1]).toMatch(/^  Gel manicure \(tip \$9\.00\) +\$45\.00$/);
    expect(each).toContain("$15.00)"); // long service list wraps; tip stays with it
  });
  it("narrow 58 mm paper: long services get their own line, then (tip) + amount together", () => {
    const each = new TextDecoder().decode(receiptBytes(earningsDoc(rows[0], "Cosmo Nails", "2026-11-17", txt, "now", { ...PRINT_DEFAULTS.staff, tickets: true }), 58));
    const lines = each.split("\n");
    const i = lines.findIndex((l) => l.includes("Deluxe spa pedicure"));
    expect(lines[i]).toMatch(/^  Deluxe spa pedicure/);
    const amt = lines.findIndex((l, j) => j > i && /\$73\.00$/.test(l));
    expect(lines[amt]).toMatch(/^    \(tip \$15\.00\) +\$73\.00$/);
    for (const l of receiptLines(earningsDoc(rows[0], "Cosmo Nails", "2026-11-17", txt, "now", { ...PRINT_DEFAULTS.staff, tickets: true }), 58))
      if ("text" in l) expect(l.text.length).toBeLessThanOrEqual(32);
  });
  it("rules: owner can hide check/cash split, signature, printed time, and join card + cash tips", () => {
    const o = { tickets: false, tipSplit: false, checkCash: false, signature: false, printedAt: false };
    const s = new TextDecoder().decode(receiptBytes(earningsDoc(rows[0], "Cosmo Nails", "2026-11-17", txt, "now", o), 58));
    for (const gone of ["By check", "In cash", "Received by", "Printed", "Card tips"]) expect(s).not.toContain(gone);
    expect(s).toMatch(/Tips +\$500\.00/);
  });
  it("skips people with no work", () => {
    expect(worked({ ...rows[0], tickets: 0, total_cents: 0, minutes: 0 })).toBe(false);
    expect(worked(rows[0])).toBe(true);
  });
});
