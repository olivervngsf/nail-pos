// ESC/POS receipt bytes for small thermal printers (58 mm = 32 characters a line, 80 mm = 48).
import QRCode from "qrcode";

// Plain English prints as fast text; Vietnamese letters print as an image (raster.ts) so accents show. Pure + tested.

export type Paper = 58 | 80;
export const charsPerLine = (p: Paper) => (p === 58 ? 32 : 48);

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

/** Print-only punctuation swaps (meaning stays clear): "·" → "-", "–" → "-", curly quotes → straight. */
export const punct = (s: string) =>
  s.replace(/[·•]/g, "-").replace(/[−–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, "x");

/** "Tuyết · Gel" → "Tuyet - Gel" (plain ASCII the printer can show as text). */
export function plain(s: string): string {
  return punct(s)
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}

/** Every piece of text on the receipt. */
export function docText(doc: ReceiptDoc): string[] {
  const out = [doc.title, ...(doc.sub ?? []), ...(doc.footer ?? [])];
  for (const r of doc.rows) {
    if (r === "sep") continue;
    if (Array.isArray(r)) out.push(...r);
    else if ("bold" in r) out.push(...r.bold);
    else out.push(r.text);
  }
  return out;
}

/** True when the receipt has letters the printer can't show as text (Vietnamese accents, emoji): print it as an image. */
export const needsImage = (doc: ReceiptDoc) => docText(doc).some((t) => /[^\x20-\x7e]/.test(punct(t)));

/** Pack an RGBA image into 1-bit printer dots (dark = print). */
export function packBitmap(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const wb = Math.ceil(width / 8);
  const out = new Uint8Array(wb * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const lum = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    if (rgba[i + 3] > 0 && lum < 190) out[y * wb + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return out;
}

/** ESC/POS "print this image" (GS v 0), then feed + cut. */
export function imageBytes(dots: Uint8Array, width: number, height: number): Uint8Array {
  const wb = Math.ceil(width / 8);
  const head = [0x1b, 0x40, 0x1b, 0x61, 1, 0x1d, 0x76, 0x30, 0, wb & 0xff, (wb >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff];
  const tail = [0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00];
  const out = new Uint8Array(head.length + dots.length + tail.length);
  out.set(head, 0); out.set(dots, head.length); out.set(tail, head.length + dots.length);
  return out;
}

/** Printer width in dots: 58 mm = 384, 80 mm = 576. */
export const dotsWide = (p: Paper) => (p === 58 ? 384 : 576);

/** Left text + right amount on one line; long left text wraps above. */
export function twoCol(left: string, right: string, width: number): string[] {
  const l = plain(left), r = plain(right);
  const room = width - r.length - 1;
  if (l.length <= room) return [l + " ".repeat(width - l.length - r.length) + r];
  const out: string[] = [];
  let rest = l;
  while (rest.length > room) {
    const cut = rest.lastIndexOf(" ", width) > 0 && rest.length > width ? rest.lastIndexOf(" ", width) : Math.min(width, rest.length);
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
    if (rest.length <= room) break;
  }
  out.push(rest + " ".repeat(Math.max(1, width - rest.length - r.length)) + r);
  return out;
}

/** Long text over several lines, breaking at spaces (a long service list on a narrow slip). */
export function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of s.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= width) cur = next;
    else { if (cur) out.push(cur); cur = w.slice(0, width); }
  }
  out.push(cur);
  return out;
}

export function center(s: string, width: number): string {
  const t = plain(s).slice(0, width);
  return " ".repeat(Math.floor((width - t.length) / 2)) + t;
}

export type ReceiptDoc = {
  title: string;          // salon name
  sub?: string[];         // ticket #, date, client
  rows: ([string, string] | "sep" | { bold: [string, string] } | { text: string })[];
  footer?: string[];
  /** Link printed as a QR code above the footer (digital receipt). */
  qr?: string;
};

/** Build the bytes: init, centered bold title, rows, footer, feed, cut. */
export function receiptBytes(doc: ReceiptDoc, paper: Paper): Uint8Array {
  const w = charsPerLine(paper);
  const out: number[] = [ESC, 0x40]; // init
  const text = (s: string) => { for (const ch of s) out.push(ch.charCodeAt(0)); out.push(LF); };
  const bold = (on: boolean) => out.push(ESC, 0x45, on ? 1 : 0);
  bold(true); out.push(GS, 0x21, 0x01); // double height title
  text(center(doc.title, w));
  out.push(GS, 0x21, 0x00); bold(false);
  for (const s of doc.sub ?? []) text(center(s, w));
  text("-".repeat(w));
  for (const r of doc.rows) {
    if (r === "sep") text("-".repeat(w));
    else if (Array.isArray(r)) twoCol(r[0], r[1], w).forEach(text);
    else if ("bold" in r) { bold(true); twoCol(r.bold[0], r.bold[1], w).forEach(text); bold(false); }
    else wrap(plain(r.text), w).forEach(text);
  }
  text("-".repeat(w));
  if (doc.qr) {
    const q = qrRaster(doc.qr, paper === 58 ? 5 : 6);
    const wb = Math.ceil(q.width / 8);
    out.push(ESC, 0x61, 1, GS, 0x76, 0x30, 0, wb & 0xff, (wb >> 8) & 0xff, q.height & 0xff, (q.height >> 8) & 0xff, ...q.dots, ESC, 0x61, 0);
  }
  for (const s of doc.footer ?? []) text(center(s, w));
  out.push(LF, LF, LF, LF);
  out.push(GS, 0x56, 0x42, 0x00); // cut (ignored by printers without a cutter)
  return new Uint8Array(out);
}

/** A QR code as printer dots (scale = dots per square). Small enough to print fast on 58 mm paper. */
export function qrRaster(text: string, scale: number): { dots: Uint8Array; width: number; height: number } {
  const m = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  const quiet = 2, n = m.size + quiet * 2, width = n * scale, wb = Math.ceil(width / 8);
  const dots = new Uint8Array(wb * width);
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.get(r, c)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const y = (r + quiet) * scale + dy, x = (c + quiet) * scale + dx;
      dots[y * wb + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { dots, width, height: width };
}
