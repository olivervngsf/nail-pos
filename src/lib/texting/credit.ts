"use client";
// Text credit (Nov 17, Text Credits board https://claude.ai/artifact/6Rak28Hwuu6PJoQDfMXWwX, pick "2 · Two lines").
// Service texts (confirmations, reminders, receipts, login codes) are part of the plan and never use credit.
// Promo texts use prepaid credit: 2¢ per text part. Owner + manager see it; only the owner adds credit.
import { useCallback, useEffect, useState } from "react";
import { SMS_ON, getDevice, rpc } from "@/lib/auth";
import { getActing } from "@/lib/desk";

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

/** Text parts for one message: plain letters = 160 (153 each when split); any accent/emoji = 70 (67 each). */
const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅå_^{}\\[~\]|€ÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/;
export function textParts(msg: string): { parts: number; plain: boolean; letters: number } {
  const plain = GSM.test(msg);
  const letters = [...msg].length;
  if (!letters) return { parts: 0, plain, letters };
  const [one, many] = plain ? [160, 153] : [70, 67];
  return { parts: letters <= one ? 1 : Math.ceil(letters / many), plain, letters };
}
/** Cost before a send: people × parts × 2¢. */
export function sendCost(people: number, msg: string) {
  const { parts } = textParts(msg);
  const texts = people * parts;
  return { parts, texts, cents: texts * CENTS_PER_TEXT };
}
/** Same message with Vietnamese accents taken off (cheaper: 160 letters a part). */
export const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

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
export function useCredit(salonId?: string) {
  const [credit, setCredit] = useState<Credit | null>(null);
  const [demo, setDemo] = useState(false);
  const [salon, setSalon] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!SMS_ON) { setDemo(true); setCredit(demoCredit()); return; }
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
  }, [salonId]);
  useEffect(() => { void load(); }, [load]);

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
    const c = await rpc<Credit>("text_credit_add", { p_salon: salon, p_cents: cents, p_client_id: crypto.randomUUID() });
    setCredit(c);
    try { localStorage.setItem(cacheKey(salon), JSON.stringify(c)); } catch { /* */ }
  }, [demo, salon]);

  const saveSettings = useCallback(async (p: { warnPct: number; autoAddOn: boolean; autoAddCents: number; autoAddMaxCents: number }) => {
    if (demo) {
      setCredit((c) => { if (!c) return c; const n = { ...c, warnPct: p.warnPct, autoAdd: { on: p.autoAddOn, cents: p.autoAddCents, maxCents: p.autoAddMaxCents } }; saveDemo(n); return n; });
      return;
    }
    if (!salon) throw new Error("No salon");
    const c = await rpc<Credit>("text_credit_settings_save", { p_salon: salon, p });
    setCredit(c);
  }, [demo, salon]);

  return { credit, demo, add, saveSettings, reload: load };
}
