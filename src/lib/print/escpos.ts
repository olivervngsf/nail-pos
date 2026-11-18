// ESC/POS receipt bytes for small thermal printers (58 mm = 32 characters a line, 80 mm = 48).
import QRCode from "qrcode";

// Plain English prints as fast text; Vietnamese letters print as an image (raster.ts) so accents show. Pure + tested.

export type Paper = 58 | 80;
export const charsPerLine = (p: Paper) => (p === 58 ? 32 : 48);

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

/** Print-only punctuation swaps (meaning stays clear): "·" → "-", "–" → "-", curly quotes → straight. */
export const punct = (s: string) =>
  s.replace(/[·•]/g, "-").replace(/[−–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, "x").replace(/[→⟶]/g, "-");

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
    else if ("item" in r) out.push(...r.item);
    else if ("cols" in r) out.push(...r.cols);
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

/** A listed item: "  Gel manicure (tip $9.00)   $45.00" on one line when it fits; on narrow paper the name gets its
 *  own line(s) and the note + amount go on the next line, so the amount is never left alone. */
export function itemLines([name, note, amount]: [string, string, string], width: number): string[] {
  const one = `  ${name}${note ? ` ${note}` : ""}`;
  const fit = twoCol(one, amount, width);
  if (fit.length === 1) return fit;
  return [...wrap(plain(name), width - 2).map((t) => `  ${t}`), ...twoCol(`    ${note}`, amount, width)];
}

/** Three columns: left text, then two right-aligned amounts ("#1011        $9.00     $45.00"). */
export function cols3([a, b, c]: [string, string, string], width: number): string {
  const cw = Math.min(11, Math.floor(width / 3)), bw = cw;
  const right = plain(b).padStart(bw) + plain(c).padStart(cw);
  return plain(a).slice(0, width - right.length).padEnd(width - right.length) + right;
}

export function center(s: string, width: number): string {
  const t = plain(s).slice(0, width);
  return " ".repeat(Math.floor((width - t.length) / 2)) + t;
}

export type ReceiptDoc = {
  title: string;          // salon name
  sub?: string[];         // ticket #, date, client
  rows: ([string, string] | "sep" | { bold: [string, string] } | { text: string } | { item: [string, string, string] } | { cols: [string, string, string]; head?: boolean })[];
  footer?: string[];
  /** Link printed as a QR code above the footer (digital receipt). */
  qr?: string;
};

/** The exact text lines the printer prints (also used for the on-screen preview). */
export type PrintLine = { text: string; bold?: boolean; big?: boolean } | { qr: string };
export function receiptLines(doc: ReceiptDoc, paper: Paper): PrintLine[] {
  const w = charsPerLine(paper);
  const out: PrintLine[] = [{ text: center(doc.title, w), bold: true, big: true }];
  for (const s of doc.sub ?? []) out.push({ text: center(s, w) });
  out.push({ text: "-".repeat(w) });
  for (const r of doc.rows) {
    if (r === "sep") out.push({ text: "-".repeat(w) });
    else if (Array.isArray(r)) twoCol(r[0], r[1], w).forEach((t) => out.push({ text: t }));
    else if ("bold" in r) twoCol(r.bold[0], r.bold[1], w).forEach((t) => out.push({ text: t, bold: true }));
    else if ("item" in r) itemLines(r.item, w).forEach((t) => out.push({ text: t }));
    else if ("cols" in r) out.push({ text: cols3(r.cols, w), bold: r.head });
    else wrap(plain(r.text), w).forEach((t) => out.push({ text: t }));
  }
  out.push({ text: "-".repeat(w) });
  if (doc.qr) out.push({ qr: doc.qr });
  for (const s of doc.footer ?? []) out.push({ text: center(s, w) });
  return out;
}

/** Build the bytes: init, rows (bold / double-height title), QR, footer, feed, cut. */
export function receiptBytes(doc: ReceiptDoc, paper: Paper): Uint8Array {
  const out: number[] = [ESC, 0x40]; // init
  for (const l of receiptLines(doc, paper)) {
    if ("qr" in l) {
      const q = qrRaster(l.qr, paper === 58 ? 5 : 6);
      const wb = Math.ceil(q.width / 8);
      out.push(ESC, 0x61, 1, GS, 0x76, 0x30, 0, wb & 0xff, (wb >> 8) & 0xff, q.height & 0xff, (q.height >> 8) & 0xff, ...q.dots, ESC, 0x61, 0);
      continue;
    }
    if (l.bold) out.push(ESC, 0x45, 1);
    if (l.big) out.push(GS, 0x21, 0x01);
    for (const ch of l.text) out.push(ch.charCodeAt(0));
    out.push(LF);
    if (l.big) out.push(GS, 0x21, 0x00);
    if (l.bold) out.push(ESC, 0x45, 0);
  }
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
