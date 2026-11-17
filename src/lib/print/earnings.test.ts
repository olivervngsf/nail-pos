import { describe, expect, it } from "vitest";
import { demoPayout } from "@/lib/closeday";
import { plain, receiptBytes, receiptLines } from "./escpos";
import { earningsDoc, worked, type EarnText } from "./earnings";
import { PRINT_DEFAULTS } from "./settings";

const txt: EarnText = {
  slipFor: (n) => `${n}'s earnings`, services: "Services", pay: () => "Pay", cardTips: "Card tips", cashTips: "Cash tips", feeOnTips: "Fee on tips",
  total: "Total", byCheck: "By check", inCash: "In cash", signature: "Received by", printed: "Printed",
  tips: "Tips", ticketNo: (n) => `Ticket #${n}`,
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
  it("every ticket: Ticket #n ... amount for each, then Services total, the %, then tips", () => {
    const r = rows[0];
    const totals = new TextDecoder().decode(receiptBytes(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "now"), 58));
    expect(totals).not.toContain("Ticket #");
    for (const paper of [58, 80] as const) {
      const lines = receiptLines(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "now", { ...PRINT_DEFAULTS.staff, tickets: true }), paper)
        .flatMap((l) => ("text" in l ? [l.text] : []));
      const t1 = lines.findIndex((l) => l.startsWith("Ticket #1011"));
      expect(lines[t1]).toMatch(/^Ticket #1011 +\$45\.00$/);
      expect(lines[t1 + 1]).toMatch(/^Ticket #1012 +\$73\.00$/);
      const svc = lines.findIndex((l) => l.startsWith("Services ("));
      expect(svc).toBeGreaterThan(t1 + 1);
      expect(lines.findIndex((l) => l.startsWith("Pay "))).toBe(svc + 1);
      expect(lines.join("\n")).not.toContain("Gel manicure");
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(paper === 58 ? 32 : 48);
    }
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
