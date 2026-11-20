// How fast + smooth the app runs on a salon device (Founder Admin "Speed"). Counts only: page loads, their time, slow
// loads (over 3s), errors. Nothing about what is on screen. DeviceBeat sends the counts with each "I'm on" beat
// (vitals_report) and starts again from zero.
export const SLOW_MS = 3000;
type Counts = { loads: number; loadMs: number; slow: number; errors: number; lastError: string | null };
let c: Counts = { loads: 0, loadMs: 0, slow: 0, errors: 0, lastError: null };
let started = false;

export function addLoad(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0 || ms > 120_000) return;
  c.loads++; c.loadMs += Math.round(ms); if (ms > SLOW_MS) c.slow++;
}
export function addError(msg: string) {
  c.errors = Math.min(c.errors + 1, 500);
  c.lastError = msg.slice(0, 200);
}
/** Counts so far, and start again from zero. */
export function takeVitals(): Counts | null {
  if (!c.loads && !c.errors) return null;
  const out = c;
  c = { loads: 0, loadMs: 0, slow: 0, errors: 0, lastError: null };
  return out;
}
/** Put counts back when sending failed (offline), so the next beat sends them. */
export function giveBack(x: Counts) {
  c = { loads: c.loads + x.loads, loadMs: c.loadMs + x.loadMs, slow: c.slow + x.slow, errors: Math.min(c.errors + x.errors, 500), lastError: c.lastError ?? x.lastError };
}

/** Start counting once per page: how long the page took to load + errors. */
export function startVitals() {
  if (started || typeof window === "undefined") return;
  started = true;
  const take = () => {
    const n = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (n) addLoad(n.loadEventEnd || n.domContentLoadedEventEnd);
  };
  if (document.readyState === "complete") setTimeout(take, 0); else addEventListener("load", () => setTimeout(take, 0), { once: true });
  addEventListener("error", (e) => addError(e.message || "error"));
  addEventListener("unhandledrejection", (e) => addError(String((e.reason as Error)?.message ?? e.reason ?? "rejection")));
}
