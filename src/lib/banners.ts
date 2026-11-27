// How long a closed banner stays hidden on THIS device (board "Notifications & Banners", Nov 25).
// visit = this tab until it closes · day = until tomorrow (local midnight) · week = 7 days · device = for good.
// Works offline; never synced: closing on the iPad doesn't hide it on the owner's phone.
export type Keep = "visit" | "day" | "week" | "device";

const PREFIX = "nailpos.banner.";

/** When a banner closed now comes back (ms since epoch); null = only for this visit; Infinity = never. */
export function hiddenUntil(keep: Keep, now = new Date()): number | null {
  if (keep === "visit") return null;
  if (keep === "device") return Infinity;
  if (keep === "week") return now.getTime() + 7 * 864e5;
  const t = new Date(now); t.setHours(24, 0, 0, 0); // next local midnight
  return t.getTime();
}

/** Read what was saved for a banner: true = still hidden. */
export function isHiddenValue(saved: string | null, now = Date.now()): boolean {
  if (!saved) return false;
  if (saved === "forever") return true;
  const n = Number(saved);
  return Number.isFinite(n) && n > now;
}

export function isHidden(id: string): boolean {
  try {
    if (sessionStorage.getItem(PREFIX + id) === "1") return true;
    return isHiddenValue(localStorage.getItem(PREFIX + id));
  } catch { return false; }
}

export function hide(id: string, keep: Keep) {
  try {
    const until = hiddenUntil(keep);
    if (until === null) sessionStorage.setItem(PREFIX + id, "1");
    else localStorage.setItem(PREFIX + id, until === Infinity ? "forever" : String(until));
  } catch { /* storage blocked: it just comes back next time */ }
}

export function unhide(id: string) {
  try { sessionStorage.removeItem(PREFIX + id); localStorage.removeItem(PREFIX + id); } catch { /* storage blocked */ }
}
