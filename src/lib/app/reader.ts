"use client";
// The small card reader next to a handheld terminal (Stripe Reader M2), reached through our Android app.
// Or, app 1.2+, Tap to Pay: the client taps the card / phone wallet on the phone itself (no reader).
// Same messages in the Android app (android/ps10) and the iPhone app (ios/PolishOS).
// The server makes the payment (amount from its own copy of the ticket + the tip picked on screen); the app's reader
// kit takes the card. Card details go reader → Stripe; this code only sees "worked" or a plain-words reason.
import { api } from "@/lib/api";
import { appCall, appTell, appVersion, inIosApp, onAppEvent } from "./bridge";

/** The app can take cards (version 1.1+). */
export const canAppReader = () => appVersion() >= 1.1;

/** `icon` = Apple's own Tap to Pay symbol as a picture (iPhone app 1.3+); `ios` = Tap to Pay on iPhone. */
/** `howTo` = Apple's own "how to tap" screens can be shown (iPhone app 1.4+, iOS 18+). */
export type TapCheck = { supported: boolean; reason?: string; nfcOff?: boolean; ios?: boolean; icon?: string; howTo?: boolean };
let tapCheck: Promise<TapCheck> | null = null;
/**
 * Can this phone take cards by tap (Stripe Tap to Pay: Google-certified Android phone with NFC, or iPhone XS+)?
 * App 1.2+ only. Asked once per page load. The PS10 answers no.
 */
export function canTapToPay(): Promise<TapCheck> {
  if (appVersion() < 1.2) return Promise.resolve({ supported: false });
  tapCheck ??= appCall<TapCheck>({ reader: "tapCheck" }, 8000)
    .then((r) => ({
      supported: !!r.supported, reason: r.reason, nfcOff: !!r.nfcOff,
      ios: !!r.ios || inIosApp(), icon: typeof r.icon === "string" && r.icon.startsWith("data:image/png;base64,") ? r.icon : undefined,
      ...(r.howTo ? { howTo: true } : {}),
    }))
    .catch(() => { tapCheck = null; return { supported: false }; });
  return tapCheck;
}

export type AppPay = { id: string; secret: string; locationId: string; test: boolean };

/** Use Stripe's practice reader (test mode only; no hardware). Kept per device; off once the real reader is chosen.
 *  Tap to Pay keeps its own choice (practice tap vs a real tap with Stripe's test card). */
const realKey = (tap: boolean) => (tap ? "nailpos.tapreal" : "nailpos.m2real");
export const wantsRealReader = (tap = false) => { try { return localStorage.getItem(realKey(tap)) === "1"; } catch { return false; } };
export const setRealReader = (on: boolean, tap = false) => { try { if (on) localStorage.setItem(realKey(tap), "1"); else localStorage.removeItem(realKey(tap)); } catch { /* */ } };

// Connection tokens: the reader kit asks for a short-lived token any time (first connect, reconnects after the app
// comes back). Only this signed-in page can fetch one: for a payment (pr) or, for the warm-up, for the salon.
let tokenFor: { pr: string } | { salonId: string } | null = null;
let tokenListening = false;
/** Why the last token ask failed (our own words): Stripe's kit only says "fetchConnectionToken … error". */
let tokenError = "";
function answerTokens() {
  if (tokenListening) return;
  tokenListening = true;
  onAppEvent("token", (e) => {
    if (!tokenFor) { tokenError = "Open the checkout first."; appTell({ tokenFor: e.ask, error: tokenError }); return; }
    void api<{ secret: string }>("/api/stripe/terminal-token", tokenFor)
      .then((r) => { tokenError = ""; appTell({ tokenFor: e.ask, secret: r.secret }); })
      .catch((err: Error) => { tokenError = err.message || "Couldn't get a card key from PolishOS."; appTell({ tokenFor: e.ask, error: tokenError }); });
  });
}

/**
 * Take the card for this payment on the reader. `say` gets what to show ("Tap, insert or swipe…").
 * Resolves when Stripe took the card; rejects with a reason ("canceled" when someone stopped it) + `code`.
 */
export async function takeCard(pay: AppPay, say: (text: string) => void, tap = false): Promise<void> {
  answerTokens();
  tokenFor = { pr: pay.id };
  paying = true;
  const stopText = onAppEvent("reader", (e) => { if (typeof e.text === "string" && e.text) say(e.text); });
  // iPhone: Apple's terms are never shown at checkout (an owner/manager accepts them in Settings first).
  const msg = { pay: pay.secret, locationId: pay.locationId, simulated: pay.test && !wantsRealReader(tap), tap, ...(tap && inIosApp() ? { terms: false } : {}) };
  try {
    // Up to 10 minutes: a new reader may update itself first.
    // Older apps answer "busy" when a get-ready or an older try is still open: stop it, wait, try again (up to
    // 4 times, ~10 s). Still busy = the app is stuck from the last try: say how to get out of it.
    for (let attempt = 0; ; attempt += 1) {
      try { await appCall(msg, 10 * 60 * 1000); break; }
      catch (e) {
        if ((e as { code?: string }).code !== "busy") throw e;
        if (attempt >= 3) throw Object.assign(new Error("stuck"), { code: "stuck" });
        await stopCard();
        await new Promise((ok) => setTimeout(ok, 2500));
      }
    }
    if (tap) markTapUsed();
  } catch (e) {
    throw explainAppError(e);
  } finally {
    paying = false;
    stopText();
  }
}
/** A payment is running: the background get-ready waits (it would make the reader "busy"). */
let paying = false;

/** Stripe's kit hides our reason behind "…fetchConnectionToken with an error": put our own words back. */
export function explainAppError(e: unknown): Error & { code?: string } {
  const err = e as Error & { code?: string };
  // Apple: this copy of the app wasn't signed with the Tap to Pay permission (e.g. the TestFlight build).
  if (/entitlement|operation not permitted/i.test(err?.message ?? "")) return Object.assign(new Error(err.message), { code: "entitlement" });
  if (/fetchConnectionToken/i.test(err?.message ?? "")) {
    return Object.assign(new Error(tokenError ? `PolishOS couldn't get a card key: ${tokenError}` : "PolishOS couldn't get a card key. Check the internet, then try again."), { code: err.code === "offline" ? "offline" : "token" });
  }
  return err;
}

/**
 * Apple's rule R8: show staff how the client taps. Apple's own screens when the iPhone can (iOS 18+, app 1.4+);
 * otherwise "own" = the page shows our short help instead. Never throws.
 */
export async function showHowToTap(): Promise<"apple" | "own"> {
  const check = await canTapToPay();
  if (!check.howTo) return "own";
  try { await appCall({ reader: "howToTap" }, 10 * 60 * 1000); return "apple"; } catch { return "own"; }
}

/** Stop waiting for the card (or stop looking for the reader). */
export const stopCard = () => appCall({ reader: "cancel" }).catch(() => null);

// ── Tap to Pay on iPhone: get ready early (Apple's rule) ───────────────────────────────────────────────────────────
// After this phone took one tap (Apple's terms accepted then), the app connects Tap to Pay when it opens and every
// time it comes back to the screen, so the client's tap starts at once. Never pops up Apple's terms by itself.

export type TapWarm = { state: "off" | "warming" | "ready" | "error"; text?: string; code?: string };
let warm: TapWarm = { state: "off" };
const warmFans = new Set<(w: TapWarm) => void>();
const setWarm = (w: TapWarm) => { warm = w; warmFans.forEach((fn) => fn(w)); };
export const tapWarmNow = () => warm;
export const onTapWarm = (fn: (w: TapWarm) => void) => { warmFans.add(fn); return () => { warmFans.delete(fn); }; };

// "Turned on on this iPhone": an owner/manager turned it on in Settings (Apple's terms accepted), or a tap worked here.
const USED = "nailpos.tapused";
function markTapUsed() { try { localStorage.setItem(USED, "1"); } catch { /* */ } setWarm({ state: "ready" }); }
const tapUsed = () => { try { return localStorage.getItem(USED) === "1"; } catch { return false; } };
/** Tap to Pay is turned on on this phone (Settings → Tap to Pay on iPhone). */
export const tapOnHere = () => tapUsed();

/**
 * Settings → Tap to Pay on iPhone → Turn on (owner/manager only): connects Tap to Pay on this iPhone WITH Apple's terms
 * allowed, so Apple shows them once and the owner/manager accepts. Then this iPhone gets ready on its own (warm-up).
 */
export async function turnOnTap(salonId: string, say: (text: string) => void): Promise<void> {
  const r = await api<{ locationId: string; test: boolean }>("/api/stripe/tap-ready", { salonId });
  answerTokens();
  tokenFor = { salonId };
  warmSalon = salonId;
  setWarm({ state: "warming" });
  const stopText = onAppEvent("reader", (e) => { if (typeof e.text === "string" && e.text) { say(e.text); setWarm({ state: "warming", text: e.text }); } });
  try {
    await appCall({ reader: "connect", tap: true, warm: false, locationId: r.locationId, simulated: r.test && !wantsRealReader(true) }, 5 * 60 * 1000);
    markTapUsed();
  } catch (e) {
    const why = explainAppError(e);
    setWarm({ state: "error", code: why.code ?? "unknown", text: why.message });
    throw why;
  } finally {
    stopText();
  }
}

/** Test copy (no sign-in, no Stripe): turned on for this device only, nothing sent to Apple or Stripe. */
export function turnOnTapDemo() { markTapUsed(); }

/** Turn it off on this iPhone: no more warm-up; checkout asks for an owner/manager again. */
/** For recording Apple's review videos (R11): back to "never set up" on this iPhone (off + the one-time sheet shows
 *  again). Apple's own terms stay accepted on Apple's side; that can't be undone from an app. */
export async function resetTapForVideo(): Promise<void> {
  try { localStorage.removeItem("nailpos.tapIntro"); } catch { /* */ }
  await turnOffTap();
}

export async function turnOffTap(): Promise<void> {
  try { localStorage.removeItem(USED); } catch { /* */ }
  setWarm({ state: "off" });
  await appCall({ reader: "disconnect" }).catch(() => null);
}

let warmSalon = "";
let warming: Promise<void> | null = null;
/** Get Tap to Pay ready for this salon (iPhone app, after the first tap). Safe to call often. */
export function warmTap(salonId: string): Promise<void> {
  if (!salonId || !inIosApp() || !tapUsed() || paying) return Promise.resolve();
  warmSalon = salonId;
  if (warming) return warming;
  warming = (async () => {
    const check = await canTapToPay();
    if (!check.supported) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) { setWarm({ state: "error", code: "offline" }); return; }
    setWarm({ state: "warming" });
    const stopText = onAppEvent("reader", (e) => { if (typeof e.text === "string" && e.text) setWarm({ state: "warming", text: e.text }); });
    try {
      const r = await api<{ locationId: string; test: boolean }>("/api/stripe/tap-ready", { salonId });
      answerTokens();
      if (!tokenFor || "salonId" in tokenFor) tokenFor = { salonId };
      await appCall({ reader: "connect", tap: true, warm: true, locationId: r.locationId, simulated: r.test && !wantsRealReader(true) }, 5 * 60 * 1000);
      setWarm({ state: "ready" });
    } catch (e) {
      const why = explainAppError(e);
      setWarm({ state: "error", code: why.code ?? "unknown", text: why.message });
    } finally {
      stopText();
      warming = null;
    }
  })();
  return warming;
}

let warmHooked = false;
/** Warm now + again whenever the app comes back to the screen. */
export function keepTapWarm(salonId: string) {
  void warmTap(salonId);
  if (warmHooked || typeof document === "undefined") return;
  warmHooked = true;
  onAppEvent("foreground", () => void warmTap(warmSalon));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void warmTap(warmSalon); });
}

// ── Plain words for what went wrong (EN + VI live in checkout.tapErr.*) ────────────────────────────────────────────
/** Codes the apps send (ios CardReader.swift `code`); anything else shows the app's own words. */
export const TAP_ERRORS = ["offline", "location", "bluetooth", "unsupported", "passcode", "call", "icloud", "terms",
  "blocked", "account", "declined", "busy", "tap_start", "no_reader", "entitlement", "stuck", "practice_stuck"] as const;
export type TapErrorCode = (typeof TAP_ERRORS)[number];

/** The translation key for an error code, or null when we show the app's own words. */
export function tapErrorKey(code: unknown, online = true): `tapErr.${TapErrorCode}` | null {
  if (!online) return "tapErr.offline";
  return typeof code === "string" && (TAP_ERRORS as readonly string[]).includes(code) ? `tapErr.${code as TapErrorCode}` : null;
}
