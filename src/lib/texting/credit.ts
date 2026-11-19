"use client";
// Text credit (Nov 17, Text Credits board https://claude.ai/artifact/6Rak28Hwuu6PJoQDfMXWwX, pick "2 · Two lines").
// Service texts (confirmations, reminders, receipts, login codes) are part of the plan and never use credit.
// Promo texts use prepaid credit: 2¢ per text part. Owner + manager see it; only the owner adds credit.
// Adding = card payment on Stripe (/api/texting/credit): the plan's saved card is charged at once, else Stripe Checkout
// (back with ?credit_session=… → confirm). After a promo send, auto add tops up from the saved card if the owner turned it on.
import { useCallback, useEffect, useState } from "react";
import { SMS_ON, getDevice, rpc } from "@/lib/auth";
import { getActing } from "@/lib/desk";
import { api } from "@/lib/api";

export const CENTS_PER_TEXT = 2;

export type CreditRow = { id: number; at: string; kind: "add" | "spend" | "refund" | "adjust"; label: string; texts: number; cents: number; who: string | null; balanceCents: number };
export type Credit = {
  balanceCents: number;
  lastAddCents: number;
  centsPerText: number;
  warnPct: number;
  autoAdd: { on: boolean; cents: number; maxCents: number };
  includedMonth: number;
  addedMonthCents: number;
  spentMonthCents: number;
  lastSend: { label: string; cents: number; texts: number; at: string } | null;
  rows: CreditRow[];
};
export type Level = "good" | "low" | "empty";

/** Fill of the line bar (0–100), against the last amount added ($25 if none yet). */
export function creditPct(c: Pick<Credit, "balanceCents" | "lastAddCents">): number {
  const base = Math.max(c.lastAddCents, 2500);
  return Math.max(0, Math.min(100, Math.round((c.balanceCents / base) * 100)));
}
export function creditLevel(c: Pick<Credit, "balanceCents" | "lastAddCents" | "warnPct">): Level {
  if (c.balanceCents <= 0) return "empty";
  return creditPct(c) < c.warnPct ? "low" : "good";
}
export const textsLeft = (c: Pick<Credit, "balanceCents">) => Math.max(0, Math.floor(c.balanceCents / CENTS_PER_TEXT));

export { textParts } from "./parts";
import { textParts } from "./parts";
/** Cost before a send: people × parts × 2¢. */
export function sendCost(people: number, msg: string) {
  const { parts } = textParts(msg);
  const texts = people * parts;
  return { parts, texts, cents: texts * CENTS_PER_TEXT };
}
/** Same message with Vietnamese accents taken off (cheaper: 160 letters a part). */
export const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

export type Audience = { all: number; lapsed: number; saidNo: number };
export const DEMO_AUDIENCE: Audience = { all: 212, lapsed: 96, saidNo: 9 };

/* ---------- sample data (test version, sign-in off) ---------- */
const day = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
export const DEMO_CREDIT: Credit = {
  balanceCents: 1840, lastAddCents: 2500, centsPerText: 2, warnPct: 20,
  autoAdd: { on: false, cents: 2500, maxCents: 5000 },
  includedMonth: 412, addedMonthCents: 2500, spentMonthCents: 876,
  lastSend: { label: "Holiday 15% off", cents: -848, texts: 424, at: day(1) },
  rows: [
    { id: 4, at: day(1), kind: "spend", label: "Holiday 15% off", texts: 424, cents: -848, who: "Mai", balanceCents: 1840 },
    { id: 3, at: day(5), kind: "spend", label: "Birthday texts", texts: 14, cents: -28, who: null, balanceCents: 2688 },
    { id: 2, at: day(15), kind: "add", label: "Added credit (test version, no card charged)", texts: 0, cents: 2500, who: "Mai", balanceCents: 2716 },
    { id: 1, at: day(18), kind: "spend", label: "We miss you", texts: 96, cents: -192, who: "Mai", balanceCents: 216 },
  ],
};
const DEMO_KEY = "nailpos.credit.demo";
function demoCredit(): Credit { try { const r = localStorage.getItem(DEMO_KEY); return r ? (JSON.parse(r) as Credit) : DEMO_CREDIT; } catch { return DEMO_CREDIT; } }
function saveDemo(c: Credit) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(c)); } catch { /* */ } }

/* ---------- live data, cached on the device for offline ---------- */
const cacheKey = (salon: string) => `nailpos.credit.${salon}`;
function currentSalon(): string | null {
  const d = getDevice();
  if (d?.salonId) return d.salonId;
  try { return localStorage.getItem("nailpos.salon"); } catch { return null; }
}

/** Credit for the salon on this device. `credit` stays null for anyone who isn't owner/manager. */
export function useCredit(salonId?: string, enabled = true) {
  const [credit, setCredit] = useState<Credit | null>(null);
  const [demo, setDemo] = useState(false);
  const [salon, setSalon] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!SMS_ON) { setDemo(true); setCredit(demoCredit()); return; }
    if (!enabled) { setCredit(null); return; }
    const s = salonId ?? currentSalon();
    setSalon(s);
    if (!s) return;
    // Shared salon device: only show it while an owner/manager is the person working (PIN on Today).
    const dev = getDevice();
    if (dev?.salonId === s) { const a = getActing(); if (!a || (a.role !== "owner" && a.role !== "manager")) { setCredit(null); return; } }
    try { const r = localStorage.getItem(cacheKey(s)); if (r) setCredit(JSON.parse(r) as Credit); } catch { /* */ }
    try {
      const c = await rpc<Credit | null>("text_credit_get", { p_salon: s });
      setCredit(c);
      try { if (c) localStorage.setItem(cacheKey(s), JSON.stringify(c)); else localStorage.removeItem(cacheKey(s)); } catch { /* */ }
    } catch { /* offline: keep the cached copy */ }
  }, [salonId, enabled]);
  useEffect(() => {
    // Back from Stripe Checkout: credit this payment once (the webhook does the same), then show the new balance.
    const q = new URLSearchParams(location.search), cs = q.get("credit_session"), s = salonId ?? currentSalon();
    if (cs && s && SMS_ON) {
      q.delete("credit_session");
      history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : ""));
      void api("/api/texting/credit", { salonId: s, action: "confirm", sessionId: cs }).catch(() => null).finally(() => void load());
    } else void load();
  }, [load, salonId]);

  const add = useCallback(async (cents: number) => {
    if (demo) {
      setCredit((c) => {
        if (!c) return c;
        const balanceCents = c.balanceCents + cents;
        const row: CreditRow = { id: Date.now(), at: new Date().toISOString(), kind: "add", label: "Added credit (test version, no card charged)", texts: 0, cents, who: "You", balanceCents };
        const n = { ...c, balanceCents, lastAddCents: cents, addedMonthCents: c.addedMonthCents + cents, rows: [row, ...c.rows] };
        saveDemo(n); return n;
      });
      return;
    }
    if (!salon) throw new Error("No salon");
    // Card payment: saved card → paid now; else Stripe's page (this tab leaves, comes back with credit_session).
    const r = await api<{ on?: boolean; paid?: boolean; url?: string }>("/api/texting/credit", { salonId: salon, action: "add", cents, back: location.pathname, requestId: crypto.randomUUID() });
    if (r.on === false) throw new Error("Card payments aren't switched on yet.");
    if (r.url) { location.href = r.url; await new Promise(() => {}); }
    await load();
  }, [demo, salon, load]);

  const saveSettings = useCallback(async (p: { warnPct: number; autoAddOn: boolean; autoAddCents: number; autoAddMaxCents: number }) => {
    if (demo) {
      setCredit((c) => { if (!c) return c; const n = { ...c, warnPct: p.warnPct, autoAdd: { on: p.autoAddOn, cents: p.autoAddCents, maxCents: p.autoAddMaxCents } }; saveDemo(n); return n; });
      return;
    }
    if (!salon) throw new Error("No salon");
    const c = await rpc<Credit>("text_credit_settings_save", { p_salon: salon, p });
    setCredit(c);
  }, [demo, salon]);

  /** Who can get a promo text (clients who said yes). */
  const audience = useCallback(async (): Promise<Audience | null> => {
    if (demo) return DEMO_AUDIENCE;
    if (!salon) return null;
    return rpc<Audience | null>("promo_audience", { p_salon: salon });
  }, [demo, salon]);

  /** Promo send (TEST VERSION: recorded + credit taken, no text goes out). The server works out the cost again. */
  const send = useCallback(async (p: { id: string; message: string; audience: "all" | "lapsed" }) => {
    if (demo) {
      const people = p.audience === "all" ? DEMO_AUDIENCE.all : DEMO_AUDIENCE.lapsed;
      const { texts, cents } = sendCost(people, p.message);
      const cur = credit ?? DEMO_CREDIT;
      if (cents > cur.balanceCents) throw new Error(`not enough text credit: need ${cents}, have ${cur.balanceCents}`);
      const balanceCents = cur.balanceCents - cents;
      const row: CreditRow = { id: Date.now(), at: new Date().toISOString(), kind: "spend", label: p.message.slice(0, 40), texts, cents: -cents, who: "You", balanceCents };
      const n = { ...cur, balanceCents, spentMonthCents: cur.spentMonthCents + cents, lastSend: { label: row.label, cents: -cents, texts, at: row.at }, rows: [row, ...cur.rows] };
      saveDemo(n); setCredit(n);
      return { people, cents, balanceCents };
    }
    if (!salon) throw new Error("No salon");
    const r = await rpc<{ people: number; cents: number; balanceCents: number }>("promo_send", { p_salon: salon, p });
    // Auto add (only if the owner turned it on; the server checks the warn line, month cap and saved card).
    await api("/api/texting/credit", { salonId: salon, action: "auto" }).catch(() => null);
    await load();
    return r;
  }, [demo, salon, credit, load]);

  return { credit, demo, add, saveSettings, audience, send, reload: load };
}
