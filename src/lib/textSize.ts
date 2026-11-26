// Text size (profile pop-up → Text size: Normal / Large / Larger). Per device, like the language: a senior tech can make
// the shared iPad easier to read. Whole screen scales (CSS zoom on <html>), so tap targets grow with the words.
export type TextSize = "normal" | "large" | "larger";
export const TEXT_SIZES: TextSize[] = ["normal", "large", "larger"];
const KEY = "nailpos.textSize";

export function getTextSize(): TextSize {
  try { const v = localStorage.getItem(KEY); return v === "large" || v === "larger" ? v : "normal"; } catch { return "normal"; }
}
export function applyTextSize(s: TextSize) {
  if (typeof document === "undefined") return;
  if (s === "normal") delete document.documentElement.dataset.text;
  else document.documentElement.dataset.text = s;
}
export function setTextSize(s: TextSize) {
  try { if (s === "normal") localStorage.removeItem(KEY); else localStorage.setItem(KEY, s); } catch { /* storage blocked */ }
  applyTextSize(s);
}
