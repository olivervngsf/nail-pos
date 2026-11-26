// Left menu shown / hidden (top bar → sidebar button, like the Mac + Claude app). Per device, like text size.
// Hidden = <html data-menu="hidden">; CSS hides `.app > .rail` on screens 600px+ (phones keep the bottom tab bar).
const KEY = "nailpos.menu";
const subs = new Set<(hidden: boolean) => void>();

export function getMenuHidden(): boolean {
  try { return localStorage.getItem(KEY) === "hidden"; } catch { return false; }
}
export function applyMenuHidden(hidden: boolean) {
  if (typeof document === "undefined") return;
  if (hidden) document.documentElement.dataset.menu = "hidden";
  else delete document.documentElement.dataset.menu;
}
export function setMenuHidden(hidden: boolean) {
  try { if (hidden) localStorage.setItem(KEY, "hidden"); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  applyMenuHidden(hidden);
  subs.forEach((fn) => fn(hidden));
}
export function onMenuHidden(fn: (hidden: boolean) => void) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
