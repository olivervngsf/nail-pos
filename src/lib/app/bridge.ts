"use client";
// Talking to our Android app (android/ps10). The app shows this web app in its own window and offers
// `window.PolishOSApp` to pages from polishosapp.com only. Every message we send is JSON with an "id"; the app answers
// {"id","ok":true,…} or {"id","error":"…"}. It can also tell us things without being asked: {"event":"…",…}.

type Bridge = { postMessage(s: string): void; onmessage: ((e: { data: string }) => void) | null };
const bridge = (): Bridge | null => (typeof window !== "undefined" ? (window as unknown as { PolishOSApp?: Bridge }).PolishOSApp ?? null : null);

/** Running inside a PolishOS app (Android terminal/phone app or the iPhone app). */
export const inApp = () => !!bridge();

/** Inside the iPhone/iPad app (ios/PolishOS); its browser name ends with "PolishOS-iOS". */
export const inIosApp = () => inApp() && typeof navigator !== "undefined" && /PolishOS-iOS/.test(navigator.userAgent);

/** Inside the Android app, which prints on the terminal's built-in printer (the iPhone app has no printer yet). */
export const appHasPrinter = () => inApp() && !inIosApp();

/** The app's version from its browser name ("… PolishOSApp/1.1"), e.g. 1.1. 0 outside the app. */
export function appVersion(): number {
  if (!inApp()) return 0;
  return Number(navigator.userAgent.match(/PolishOSApp\/(\d+(?:\.\d+)?)/)?.[1] ?? 1);
}

type Reply = { id?: string; ok?: boolean; error?: string; event?: string } & Record<string, unknown>;
const waiting = new Map<string, (r: Reply) => void>();
const listeners = new Map<string, Set<(e: Reply) => void>>();

function listen(app: Bridge) {
  app.onmessage = (e) => {
    let m: Reply;
    try { m = JSON.parse(e.data) as Reply; } catch { return; }
    if (m.event) { listeners.get(m.event)?.forEach((fn) => fn(m)); return; }
    const done = m.id ? waiting.get(m.id) : undefined;
    if (done) { waiting.delete(m.id!); done(m); }
  };
}

/** Ask the app to do something and wait for its answer. Throws the app's plain-words reason (+ `code` when it sent one). */
export function appCall<T = Record<string, unknown>>(message: Record<string, unknown>, waitMs = 30000): Promise<T> {
  const app = bridge();
  if (!app) return Promise.reject(new Error("Open PolishOS in the PolishOS app for this."));
  listen(app);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error("The app didn't answer. Try again.")); }, waitMs);
    waiting.set(id, (r) => { clearTimeout(timer); if (r.error) reject(Object.assign(new Error(r.error), { code: typeof r.code === "string" ? r.code : undefined })); else resolve(r as T); });
    app.postMessage(JSON.stringify({ ...message, id }));
  });
}

/** Tell the app something that needs no answer. */
export function appTell(message: Record<string, unknown>) {
  bridge()?.postMessage(JSON.stringify(message));
}

/** Hear what the app tells us by itself (e.g. "reader" = what to show while the card is taken). Returns "stop". */
export function onAppEvent(name: string, fn: (e: Record<string, unknown>) => void): () => void {
  const app = bridge();
  if (app) listen(app);
  const set = listeners.get(name) ?? new Set();
  set.add(fn);
  listeners.set(name, set);
  return () => { set.delete(fn); };
}
