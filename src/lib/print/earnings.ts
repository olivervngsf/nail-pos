"use client";
// Earnings slips (payout sheet, PIN "print my earnings", tech phone): one paper per person, never a shared list.
// Bluetooth thermal printer (NETUM) when the browser can: each slip is its own print job and ends with a cut, with a
// short pause between so printers without a cutter can be torn. Otherwise the computer's print window, one page each.
import type { PayoutRow } from "@/lib/closeday";
import { formatCents } from "@/lib/money";
import type { ReceiptDoc } from "./escpos";
import { printDoc } from "./print";
import { savedPrinter } from "./bluetooth";
import { printInWindow } from "./slip";
import { PRINT_DEFAULTS, type PrintSettings } from "./settings";

export type EarnText = {
  slipFor: (name: string) => string;
  services: string; pay: (r: PayoutRow) => string; cardTips: string; cashTips: string; tips: string; feeOnTips: string;
  total: string; byCheck: string; inCash: string; signature: string; printed: string;
  /** "(tip $9.00)" after a service on the every-ticket list. */
  tipOn: (amount: string) => string;
};

/** What the owner chose to show on staff slips (Settings → Printer). */
export type StaffSlipOpts = PrintSettings["staff"];

const $ = formatCents;

export function earningsDoc(r: PayoutRow, salon: string, period: string, txt: EarnText, printedAt: string, o: StaffSlipOpts = PRINT_DEFAULTS.staff): ReceiptDoc {
  // Every ticket: one line each under "Services (n)": what was done (tip $x) ...... service amount.
  const each: ReceiptDoc["rows"] = o.tickets ? (r.lines ?? []).map((l) => {
    const tip = l.tip_card_cents + l.tip_cash_cents;
    return { item: [l.services || "-", tip ? txt.tipOn($(tip)) : "", $(l.services_cents)] as [string, string, string] };
  }) : [];
  const tips: ReceiptDoc["rows"] = o.tipSplit
    ? [[txt.cardTips, $(r.tips_card_cents)], [txt.cashTips, $(r.tips_cash_cents)]]
    : [[txt.tips, $(r.tips_card_cents + r.tips_cash_cents)]];
  return {
    title: salon,
    sub: [txt.slipFor(r.name), period],
    rows: [
      [`${txt.services} (${r.tickets})`, $(r.services_cents)],
      ...each,
      [txt.pay(r), $(r.pay_cents)],
      ...tips,
      ...(r.tip_fee_cents > 0 ? [[txt.feeOnTips, `-${$(r.tip_fee_cents)}`] as [string, string]] : []),
      "sep",
      { bold: [txt.total, $(r.total_cents)] },
      ...(o.checkCash ? [[`${txt.byCheck} (${r.check_pct}%)`, $(r.check_cents)] as [string, string], [txt.inCash, $(r.cash_cents)] as [string, string]] : []),
      ...(o.signature ? ["sep", { text: "" }, { text: `${txt.signature} ____________________` }] as ReceiptDoc["rows"] : []),
    ],
    footer: o.printedAt ? [`${txt.printed} ${printedAt}`] : [],
  };
}

/** Only people who worked or earned something get a slip. */
export const worked = (r: PayoutRow) => r.tickets > 0 || r.total_cents !== 0 || r.minutes > 0;

/** Bluetooth only when a receipt printer was paired here, or on a phone/tablet (where it's the only way). A computer
 *  with a normal USB/Wi-Fi printer goes straight to its print window. */
const viaBluetooth = () => !!savedPrinter() || (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches);

/** Print one slip per person. Returns how many were printed. */
export async function printEarnings(docs: ReceiptDoc[], onEach?: (i: number) => void): Promise<number> {
  if (!docs.length) return 0;
  if (!viaBluetooth()) { await printInWindow(docs); return docs.length; }
  for (let i = 0; i < docs.length; i++) {
    onEach?.(i);
    // No Bluetooth here, or the printer list was closed before the first slip: use the print window instead.
    const ok = await printDoc(docs[i]).catch((e: Error) => { if (i === 0 && /cancel|no device|not found/i.test(e.message)) return false; throw e; });
    if (!ok) { await printInWindow(docs.slice(i)); return docs.length; }
    if (i < docs.length - 1) await new Promise((r) => setTimeout(r, 1500)); // time to tear
  }
  return docs.length;
}
