"use client";
// Ticket slip: small paper with the ticket # and a QR. The client hands it to the tech, the tech scans it to add
// services on their phone, the desk scans it back to charge. Printed from the ticket screen or when seating a walk-in.
import QRCode from "qrcode";
import { getTicket, saveNow } from "@/lib/checkout/store";
import { ticketLabel, type Ticket } from "@/lib/checkout/ticket";
import type { ReceiptDoc } from "./escpos";
import { printDoc } from "./print";
import { cachedPrintSettings, type PrintSettings } from "./settings";

export type SlipText = { ticket: string; forTech: string; back: string };

export function slipDoc(salonName: string, t: Ticket, when: string, txt: SlipText, o: PrintSettings["slip"] = cachedPrintSettings(t.salonId).slip): ReceiptDoc {
  return {
    title: salonName,
    sub: [when],
    rows: [
      { bold: [txt.ticket, t.number ? `#${t.number}` : ticketLabel(t)] },
      ...(o.client && t.client?.name ? [{ text: t.client.name }] : []),
      ...t.lines.map((l) => [l.name, o.staff ? l.staffName ?? "" : ""] as [string, string]),
    ],
    footer: [txt.forTech, txt.back],
    qr: `${location.origin}/t/ticket/${t.id}`,
  };
}

/** Save the ticket on the server (the tech's phone needs it), then print: Bluetooth printer if there is one, else the
 *  computer's print window. Offline it still prints; the ticket reaches the server when the internet is back. */
export async function printTicketSlip(ticketId: string, salonName: string, txt: SlipText, when: string): Promise<void> {
  let t = getTicket(ticketId);
  if (!t) throw new Error("Ticket not found on this device.");
  // Wait at most 2 s for the server (to print the ticket #): the browser only lets us open the Bluetooth printer
  // list shortly after the tap. Slow or no internet: print with the short code; the ticket syncs later.
  if (!t.number) {
    await Promise.race([saveNow(t).catch(() => null), new Promise((r) => setTimeout(r, 2000))]);
    t = getTicket(ticketId) ?? t;
  }
  const doc = slipDoc(salonName, t, when, txt);
  if (!(await printDoc(doc))) await printInWindow([doc]);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Computer printer: a hidden page with just the slips (80 mm or 58 mm paper both fit). Each doc starts on its own
 *  page, so a receipt printer cuts between them (one paper per person). */
export async function printInWindow(docs: ReceiptDoc[]) {
  const one = async (doc: ReceiptDoc) => {
    const qr = doc.qr ? await QRCode.toDataURL(doc.qr, { width: 220, margin: 1 }) : "";
    const rows = doc.rows.map((r) => r === "sep" ? "<hr>" : Array.isArray(r) ? `<div class="rl"><span>${esc(r[0])}</span><span>${esc(r[1])}</span></div>`
      : "item" in r ? `<div class="rl"><span>&nbsp;&nbsp;${esc(r.item[0])}${r.item[1] ? ` ${esc(r.item[1])}` : ""}</span><span>${esc(r.item[2])}</span></div>`
      : "bold" in r ? `<div class="rl big"><span>${esc(r.bold[0])}</span><span>${esc(r.bold[1])}</span></div>` : `<div>${esc(r.text)}</div>`).join("");
    return `<section><div class="c" style="font-weight:700;font-size:15px">${esc(doc.title)}</div>
  ${(doc.sub ?? []).map((s) => `<div class="c">${esc(s)}</div>`).join("")}<hr>${rows}
  ${qr ? `<img src="${qr}" alt="">` : ""}${(doc.footer ?? []).map((s) => `<div class="c">${esc(s)}</div>`).join("")}</section>`;
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 2mm } body { margin: 0; font: 12px/1.4 ui-monospace, Menlo, monospace; color: #000; max-width: 72mm }
    .c { text-align: center } .rl { display: flex; justify-content: space-between; gap: 8px } .big { font-weight: 700; font-size: 18px }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0 } img { display: block; margin: 6px auto; width: 130px; height: 130px }
    section + section { break-before: page }
  </style></head><body>${(await Promise.all(docs.map(one))).join("")}</body></html>`;
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  await new Promise<void>((done) => {
    f.onload = () => { setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => { f.remove(); done(); }, 500); }, 50); };
    f.srcdoc = html;
  });
}
