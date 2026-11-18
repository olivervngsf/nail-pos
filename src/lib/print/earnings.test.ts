import { describe, expect, it } from "vitest";
import { demoPayout } from "@/lib/closeday";
import { plain, receiptBytes, receiptLines } from "./escpos";
import { earningsDoc, worked, type EarnText } from "./earnings";
import { PRINT_DEFAULTS } from "./settings";

const txt: EarnText = {
  slipFor: (n) => `${n}'s earnings`, services: "Services", pay: () => "Pay", cardTips: "Card tips", cashTips: "Cash tips", feeOnTips: "Fee on tips",
  total: "Total", byCheck: "By check", inCash: "In cash", signature: "Received by", printed: "Printed",
  tips: "Tips", colTicket: "Ticket", colTips: "Tips", colService: "Service",
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
  it("every ticket (default on): 3 columns Ticket | Tips | Service, then Services total, the %, then tips", () => {
    const r = rows[0];
    const off = new TextDecoder().decode(receiptBytes(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "now", { ...PRINT_DEFAULTS.staff, tickets: false }), 58));
    expect(off).not.toContain("#1011");
    for (const paper of [58, 80] as const) {
      const w = paper === 58 ? 32 : 48;
      const lines = receiptLines(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "now"), paper).flatMap((l) => ("text" in l ? [l.text] : []));
      const h = lines.findIndex((l) => l.startsWith("Ticket "));
      expect(lines[h]).toMatch(/^Ticket +Tips +Service$/);
      expect(lines[h + 1]).toMatch(/^#1011 +\$9\.00 +\$45\.00$/);
      expect(lines[h + 2]).toMatch(/^#1012 +\$15\.00 +\$73\.00$/);
      // amounts line up in their columns
      expect(lines[h + 1].length).toBe(w);
      expect(lines[h + 1].lastIndexOf("$9.00") + 5).toBe(lines[h + 2].lastIndexOf("$15.00") + 6);
      const svc = lines.findIndex((l) => l.startsWith("Services ("));
      expect(svc).toBeGreaterThan(h + 2);
      expect(lines.findIndex((l) => l.startsWith("Pay "))).toBe(svc + 1);
    }
  });
  it("period arrow prints as a dash (no lost characters)", () => {
    const lines = receiptLines(earningsDoc(rows[0], "Cosmo Nails", "2026-11-16 → 2026-11-17", txt, "now"), 58).flatMap((l) => ("text" in l ? [l.text] : []));
    expect(lines.some((l) => l.includes("2026-11-16 - 2026-11-17"))).toBe(true);
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
