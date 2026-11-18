"use client";
// One way to print a receipt or ticket slip: Bluetooth thermal printer when this browser can (Android Chrome, Bluefy).
// Always printer text (fast): Vietnamese accents print without marks ("Tuyết" → "Tuyet"). The image way (raster.ts,
// keeps accents) was too slow on the NETUM. Returns false when the caller should use the computer's print window.
import { receiptBytes, type ReceiptDoc } from "./escpos";
import { canBluetooth, printBytes, savedPrinter } from "./bluetooth";

export async function printDoc(doc: ReceiptDoc): Promise<boolean> {
  if (!canBluetooth() && savedPrinter()?.via !== "serial") return false;
  const paper = savedPrinter()?.paper ?? 58;
  await printBytes(receiptBytes(doc, paper), paper);
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
