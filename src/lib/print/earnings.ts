"use client";
// Earnings slips (payout sheet, PIN "print my earnings", tech phone): one paper per person, never a shared list.
// Bluetooth thermal printer (NETUM) when the browser can: each slip is its own print job and ends with a cut, with a
// short pause between so printers without a cutter can be torn. Otherwise the computer's print window, one page each.
import type { PayoutRow } from "@/lib/closeday";
import { formatCents } from "@/lib/money";
import type { ReceiptDoc } from "./escpos";
import { printDoc } from "./print";
import { printInWindow } from "./slip";

export type EarnText = {
  slipFor: (name: string) => string;
  services: string; pay: (r: PayoutRow) => string; cardTips: string; cashTips: string; feeOnTips: string;
  total: string; byCheck: string; inCash: string; signature: string; printed: string;
};

const $ = formatCents;

export function earningsDoc(r: PayoutRow, salon: string, period: string, txt: EarnText, printedAt: string): ReceiptDoc {
  return {
    title: salon,
    sub: [txt.slipFor(r.name), period],
    rows: [
      [`${txt.services} (${r.tickets})`, $(r.services_cents)],
      [txt.pay(r), $(r.pay_cents)],
      [txt.cardTips, $(r.tips_card_cents)],
      [txt.cashTips, $(r.tips_cash_cents)],
      ...(r.tip_fee_cents > 0 ? [[txt.feeOnTips, `-${$(r.tip_fee_cents)}`] as [string, string]] : []),
      "sep",
      { bold: [txt.total, $(r.total_cents)] },
      [`${txt.byCheck} (${r.check_pct}%)`, $(r.check_cents)],
      [txt.inCash, $(r.cash_cents)],
      "sep",
      { text: "" },
      { text: `${txt.signature} ____________________` },
    ],
    footer: [`${txt.printed} ${printedAt}`],
  };
}

/** Only people who worked or earned something get a slip. */
export const worked = (r: PayoutRow) => r.tickets > 0 || r.total_cents !== 0 || r.minutes > 0;

/** Print one slip per person. Returns how many were printed. */
export async function printEarnings(docs: ReceiptDoc[], onEach?: (i: number) => void): Promise<number> {
  if (!docs.length) return 0;
  for (let i = 0; i < docs.length; i++) {
    onEach?.(i);
    if (!(await printDoc(docs[i]))) { await printInWindow(docs); return docs.length; }
    if (i < docs.length - 1) await new Promise((r) => setTimeout(r, 1500)); // time to tear
  }
  return docs.length;
}
