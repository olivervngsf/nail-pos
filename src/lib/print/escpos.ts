// ESC/POS receipt bytes for small thermal printers (58 mm = 32 characters a line, 80 mm = 48).
// Cheap printers don't know Vietnamese letters, so accents are dropped ("Ngọc" → "Ngoc"). Pure + tested.

export type Paper = 58 | 80;
export const charsPerLine = (p: Paper) => (p === 58 ? 32 : 48);

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

/** "Tuyết · Gel" → "Tuyet - Gel" (plain ASCII the printer can show). */
export function plain(s: string): string {
  return s
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[·•]/g, "-").replace(/[−–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e]/g, "");
}

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

export function center(s: string, width: number): string {
  const t = plain(s).slice(0, width);
  return " ".repeat(Math.floor((width - t.length) / 2)) + t;
}

export type ReceiptDoc = {
  title: string;          // salon name
  sub?: string[];         // ticket #, date, client
  rows: ([string, string] | "sep" | { bold: [string, string] } | { text: string })[];
  footer?: string[];
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
    else text(plain(r.text).slice(0, w));
  }
  text("-".repeat(w));
  for (const s of doc.footer ?? []) text(center(s, w));
  out.push(LF, LF, LF, LF);
  out.push(GS, 0x56, 0x42, 0x00); // cut (ignored by printers without a cutter)
  return new Uint8Array(out);
}
