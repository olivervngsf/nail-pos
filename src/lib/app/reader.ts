"use client";
// The small card reader next to a handheld terminal (Stripe Reader M2), reached through our Android app.
// The server makes the payment (amount from its own copy of the ticket + the tip picked on screen); the app's reader
// kit takes the card. Card details go reader → Stripe; this code only sees "worked" or a plain-words reason.
import { api } from "@/lib/api";
import { appCall, appTell, appVersion, onAppEvent } from "./bridge";

/** The app can take cards (version 1.1+). */
export const canAppReader = () => appVersion() >= 1.1;

export type AppPay = { id: string; secret: string; locationId: string; test: boolean };

/** Use Stripe's practice reader (test mode only; no hardware). Kept per device; off once the real reader is chosen. */
const REAL = "nailpos.m2real";
export const wantsRealReader = () => { try { return localStorage.getItem(REAL) === "1"; } catch { return false; } };
export const setRealReader = (on: boolean) => { try { if (on) localStorage.setItem(REAL, "1"); else localStorage.removeItem(REAL); } catch { /* */ } };

/**
 * Take the card for this payment on the reader. `say` gets what to show ("Tap, insert or swipe…").
 * Resolves when Stripe took the card; rejects with a reason ("canceled" when someone stopped it).
 */
export async function takeCard(pay: AppPay, say: (text: string) => void): Promise<void> {
  // The reader kit needs short-lived connection tokens; only this signed-in page can fetch them.
  const stopToken = onAppEvent("token", (e) => {
    void api<{ secret: string }>("/api/stripe/terminal-token", { pr: pay.id })
      .then((r) => appTell({ tokenFor: e.ask, secret: r.secret }))
      .catch((err: Error) => appTell({ tokenFor: e.ask, error: err.message }));
  });
  const stopText = onAppEvent("reader", (e) => { if (typeof e.text === "string" && e.text) say(e.text); });
  try {
    // Up to 10 minutes: a new reader may update itself first.
    await appCall({ pay: pay.secret, locationId: pay.locationId, simulated: pay.test && !wantsRealReader() }, 10 * 60 * 1000);
  } finally {
    stopToken(); stopText();
  }
}

/** Stop waiting for the card (or stop looking for the reader). */
export const stopCard = () => appCall({ reader: "cancel" }).catch(() => null);
