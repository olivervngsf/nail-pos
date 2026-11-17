"use client";
// One way to print a receipt or ticket slip: Bluetooth thermal printer when this browser can (Android Chrome, Bluefy),
// text when the paper is plain English, an image when it has Vietnamese letters. Returns false when the caller
// should use the computer's print window instead.
import { needsImage, receiptBytes, type ReceiptDoc } from "./escpos";
import { receiptImageBytes } from "./raster";
import { canBluetooth, printBytes, savedPrinter } from "./bluetooth";

export async function printDoc(doc: ReceiptDoc): Promise<boolean> {
  if (!canBluetooth()) return false;
  const paper = savedPrinter()?.paper ?? 58;
  await printBytes(needsImage(doc) ? await receiptImageBytes(doc, paper) : receiptBytes(doc, paper), paper);
  return true;
}

/** Find a ticket in what a scanner typed: a slip link (…/t/ticket/<id>), a checkout link, a raw id, or a ticket number. */
export function parseTicketScan(text: string): { id?: string; number?: number } | null {
  const s = text.trim();
  const id = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (id) return { id: id.toLowerCase() };
  const n = s.match(/^#?\s*(\d{1,7})$/)?.[1];
  return n ? { number: Number(n) } : null;
}
