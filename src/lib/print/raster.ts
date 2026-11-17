"use client";
// Draw the receipt as a black-and-white image (keeps Vietnamese accents), the way Nail Tech Log did for the NETUM.
import QRCode from "qrcode";
import { dotsWide, imageBytes, packBitmap, punct, type Paper, type ReceiptDoc } from "./escpos";

type Line = { text: string; right?: string; bold?: boolean; size: number; align: "left" | "center"; sep?: boolean };

export async function receiptImageBytes(doc: ReceiptDoc, paper: Paper): Promise<Uint8Array> {
  await document.fonts?.ready;
  const W = dotsWide(paper), pad = 12;
  const font = (size: number, bold?: boolean) => `${bold ? 800 : 500} ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true })!;

  // Lay out lines (long service names wrap above their price).
  const lines: Line[] = [{ text: doc.title, bold: true, size: 30, align: "center" }];
  for (const s of doc.sub ?? []) lines.push({ text: s, size: 19, align: "center" });
  lines.push({ text: "", size: 12, align: "left", sep: true });
  const wrap = (text: string, room: number, size: number, bold?: boolean) => {
    ctx.font = font(size, bold);
    const words = punct(text).split(" "), out: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= room || !cur) cur = next; else { out.push(cur); cur = w; }
    }
    out.push(cur);
    return out;
  };
  for (const r of doc.rows) {
    if (r === "sep") { lines.push({ text: "", size: 12, align: "left", sep: true }); continue; }
    if (!Array.isArray(r) && "text" in r) { wrap(r.text, W - pad * 2, 19).forEach((t) => lines.push({ text: t, size: 19, align: "left" })); continue; }
    const [l, amt] = Array.isArray(r) ? r : r.bold;
    const bold = !Array.isArray(r), size = bold ? 22 : 19;
    ctx.font = font(size, bold);
    const parts = wrap(l, W - pad * 2 - ctx.measureText(amt).width - 12, size, bold);
    parts.forEach((t, i) => lines.push({ text: t, right: i === parts.length - 1 ? amt : undefined, bold, size, align: "left" }));
  }
  lines.push({ text: "", size: 12, align: "left", sep: true });
  const qr = doc.qr ? QRCode.create(doc.qr, { errorCorrectionLevel: "M" }).modules : null;
  const qrScale = paper === 58 ? 5 : 6, qrSize = qr ? (qr.size + 4) * qrScale : 0;
  for (const s of doc.footer ?? []) lines.push({ text: s, size: 19, align: "center" });

  const lh = (l: Line) => (l.sep ? 14 : Math.ceil(l.size * 1.35));
  const footerCount = (doc.footer ?? []).length;
  const H = pad * 2 + lines.reduce((a, l) => a + lh(l), 0) + (qr ? qrSize + 8 : 0);
  c.width = W; c.height = H;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000"; ctx.textBaseline = "top";
  let y = pad;
  const drawQr = () => {
    if (!qr) return;
    const x0 = Math.floor((W - qrSize) / 2);
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.get(r, c)) ctx.fillRect(x0 + (c + 2) * qrScale, y + (r + 2) * qrScale, qrScale, qrScale);
    y += qrSize + 8;
  };
  // The QR sits between the last line and the footer.
  lines.forEach((l, i) => { if (i === lines.length - footerCount) drawQr(); draw(l); });
  if (footerCount === 0) drawQr();
  function draw(l: Line) {
    if (l.sep) { for (let x = pad; x < W - pad; x += 8) ctx.fillRect(x, y + 6, 4, 2); y += lh(l); return; }
    ctx.font = font(l.size, l.bold);
    ctx.textAlign = l.align === "center" ? "center" : "left";
    ctx.fillText(punct(l.text), l.align === "center" ? W / 2 : pad, y, W - pad * 2);
    if (l.right) { ctx.textAlign = "right"; ctx.fillText(punct(l.right), W - pad, y); }
    y += lh(l);
  }
  const px = ctx.getImageData(0, 0, W, H).data;
  return imageBytes(packBitmap(px, W, H), W, H);
}
