import { describe, expect, it } from "vitest";
import { demoPayout } from "@/lib/closeday";
import { plain, receiptBytes } from "./escpos";
import { earningsDoc, worked, type EarnText } from "./earnings";

const txt: EarnText = {
  slipFor: (n) => `${n}'s earnings`, services: "Services", pay: () => "Pay", cardTips: "Card tips", cashTips: "Cash tips", feeOnTips: "Fee on tips",
  total: "Total", byCheck: "By check", inCash: "In cash", signature: "Received by", printed: "Printed",
  ticketsTitle: "Tickets", tipCard: "Tip (card)", tipCash: "Tip (cash)", when: (iso) => iso.slice(11, 16),
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
  it("rule: totals only by default; every ticket lists each ticket's service + tips", () => {
    const r = rows[0];
    const totals = new TextDecoder().decode(receiptBytes(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "now"), 58));
    expect(totals).not.toContain("Tickets");
    const each = new TextDecoder().decode(receiptBytes(earningsDoc(r, "Cosmo Nails", "2026-11-17", txt, "now", "tickets"), 58));
    for (const l of r.lines!) expect(each).toContain(`#${l.number}`);
    expect(each).toContain("Tip (card)");
    expect(each).toContain("Tip (cash)");
    expect(each).toContain("Gel polish"); // long service list wraps instead of being cut off
  });
  it("skips people with no work", () => {
    expect(worked({ ...rows[0], tickets: 0, total_cents: 0, minutes: 0 })).toBe(false);
    expect(worked(rows[0])).toBe(true);
  });
});
