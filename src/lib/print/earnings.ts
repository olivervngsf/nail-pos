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

export type EarnText = {
  slipFor: (name: string) => string;
  services: string; pay: (r: PayoutRow) => string; cardTips: string; cashTips: string; feeOnTips: string;
  total: string; byCheck: string; inCash: string; signature: string; printed: string;
  /** "Every ticket" slips: section title, tip words, and how to show a ticket's time. */
  ticketsTitle: string; tipCard: string; tipCash: string; when: (iso: string) => string;
};

/** Slip detail rule: totals only, or every ticket (service + tips) above the totals. */
export type SlipDetail = "totals" | "tickets";

const $ = formatCents;

export function earningsDoc(r: PayoutRow, salon: string, period: string, txt: EarnText, printedAt: string, detail: SlipDetail = "totals"): ReceiptDoc {
  const each: ReceiptDoc["rows"] = detail === "tickets" && r.lines?.length ? [
    { text: txt.ticketsTitle },
    ...r.lines.flatMap((l) => [
      { bold: [`#${l.number}  ${txt.when(l.at)}`, $(l.services_cents)] as [string, string] },
      ...(l.services ? [{ text: l.services }] : []),
      ...(l.tip_card_cents ? [[`  ${txt.tipCard}`, $(l.tip_card_cents)] as [string, string]] : []),
      ...(l.tip_cash_cents ? [[`  ${txt.tipCash}`, $(l.tip_cash_cents)] as [string, string]] : []),
    ]),
    "sep",
  ] : [];
  return {
    title: salon,
    sub: [txt.slipFor(r.name), period],
    rows: [
      ...each,
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
