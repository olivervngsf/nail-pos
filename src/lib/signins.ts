// My sign-ins (Profile → My sign-ins; board SignIns.dc.html): every place YOUR login is signed in.
// Rows come from `my_sessions()` (Supabase auth sessions) and `my_signin_history()`. Here: plain names for the device
// a browser string came from ("iPhone · PolishOS app 1.4", "Mac · Chrome") + sample rows for the test copy.
export type DeviceKind = "phone" | "tablet" | "computer";
export type Session = { id: string; started: string; last_active: string; agent: string | null; ip: string | null; two_step: boolean; this: boolean };
export type HistoryRow = { at: string; what: "signed_in" | "signed_out" | "signed_out_others"; agent: string | null };

/** "iPhone · Safari", "Android phone · Chrome", "Mac · Chrome", "iPad · PolishOS app 1.4". */
export function describeAgent(ua: string | null | undefined): { name: string; kind: DeviceKind } {
  const a = ua ?? "";
  const app = a.match(/PolishOSApp\/(\d+(?:\.\d+)?)/);
  const iPad = /iPad/.test(a) || (/Macintosh/.test(a) && /Mobile\//.test(a));
  const iPhone = /iPhone|iPod/.test(a);
  const android = /Android/.test(a);
  const androidTablet = android && !/Mobile/.test(a);
  const kind: DeviceKind = iPad || androidTablet ? "tablet" : iPhone || android ? "phone" : "computer";
  const device = iPad ? "iPad" : iPhone ? "iPhone" : androidTablet ? "Android tablet" : android ? "Android phone"
    : /Windows/.test(a) ? "Windows computer" : /Macintosh|Mac OS X/.test(a) ? "Mac" : /CrOS/.test(a) ? "Chromebook" : /Linux/.test(a) ? "Linux computer" : "";
  const browser = app ? `PolishOS app ${app[1]}`
    : /Edg\//.test(a) ? "Edge" : /SamsungBrowser/.test(a) ? "Samsung Internet" : /Firefox|FxiOS/.test(a) ? "Firefox"
    : /CriOS|Chrome\//.test(a) ? "Chrome" : /Safari\//.test(a) ? "Safari" : "";
  const name = [device, browser].filter(Boolean).join(" · ") || "Unknown device";
  return { name, kind };
}

/** "Now" (under 5 min), "12 min ago", "2h ago", "Yesterday", "Oct 30". Hours without a space (Oliver, Nov 19). */
export function lastSeen(at: string, now = Date.now(), vi = false): string {
  const m = Math.round((now - Date.parse(at)) / 60000);
  if (m < 5) return vi ? "Đang dùng" : "Now";
  if (m < 60) return vi ? `${m} phút trước` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return vi ? `${h}h trước` : `${h}h ago`;
  if (h < 48) return vi ? "Hôm qua" : "Yesterday";
  return new Date(at).toLocaleDateString(vi ? "vi-VN" : "en-US", { month: "short", day: "numeric" });
}

/** Not used for 14+ days: worth signing out (an old phone, a borrowed computer). */
export const isStale = (s: Session, now = Date.now()) => !s.this && now - Date.parse(s.last_active) > 14 * 86400000;
export const daysIdle = (s: Session, now = Date.now()) => Math.floor((now - Date.parse(s.last_active)) / 86400000);

/** Sample rows for the test copy (no database): this computer, own iPhone, an old Android phone. */
export function demoSessions(now = Date.now()): Session[] {
  const t = (min: number) => new Date(now - min * 60000).toISOString();
  return [
    { id: "s-this", started: t(60 * 3), last_active: t(0), agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36", ip: "73.15.x.x", two_step: true, this: true },
    { id: "s-phone", started: t(60 * 24 * 4), last_active: t(120), agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 PolishOSApp/1.4 PolishOS-iOS", ip: "172.56.x.x", two_step: true, this: false },
    { id: "s-old", started: t(60 * 24 * 40), last_active: t(60 * 24 * 26), agent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36", ip: "98.42.x.x", two_step: false, this: false },
  ];
}
export function demoHistory(now = Date.now()): HistoryRow[] {
  const t = (h: number) => new Date(now - h * 3600000).toISOString();
  const s = demoSessions(now);
  return [
    { at: t(3), what: "signed_in", agent: s[0].agent },
    { at: t(24 * 4), what: "signed_in", agent: s[1].agent },
    { at: t(24 * 8), what: "signed_out", agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" },
  ];
}
