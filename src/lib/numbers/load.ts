"use client";
// Load the raw facts for a period + its compare period (one server call), cached on the device so the page still opens offline
// ("numbers update every minute; offline they show the last saved time"). Test copy = a believable sample salon.
import { useCallback, useEffect, useState } from "react";
import { rpc } from "@/lib/auth";
import { DEMO_DESK } from "@/lib/desk";
import { periods, type Facts, type Period } from "./kpis";

const key = (salon: string, per: Period) => `nailpos.numbers.${salon}.${per}`;

export function useNumbers(salonId: string, live: boolean, per: Period) {
  const [now, setNow] = useState(() => new Date());
  const [facts, setFacts] = useState<Facts | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const n = new Date();
    setNow(n);
    if (!live) { setFacts(demoFacts(n)); setSavedAt(n.toISOString()); return; }
    const p = periods(per, n);
    try {
      const f = await rpc<Facts>("numbers_facts", { p_salon: salonId, p_from: p.cmp.from.toISOString(), p_to: p.cur.to.toISOString() });
      setFacts(f); setSavedAt(n.toISOString()); setErr("");
      try { localStorage.setItem(key(salonId, per), JSON.stringify({ f, at: n.toISOString() })); } catch { /* storage full */ }
    } catch (e) {
      try {
        const c = JSON.parse(localStorage.getItem(key(salonId, per)) || "null");
        if (c) { setFacts(c.f); setSavedAt(c.at); return; }
      } catch { /* */ }
      setErr((e as Error).message);
    }
  }, [salonId, live, per]);
  useEffect(() => { void load(); const i = setInterval(load, 60_000); return () => clearInterval(i); }, [load]);
  return { facts, now, savedAt, err };
}

/* ---------- test copy: 10 weeks of a busy little salon (same every run for a given day) ---------- */
function rand(seed: number) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
export function demoFacts(now: Date): Facts {
  const r = rand(now.getFullYear() * 400 + now.getMonth() * 31 + now.getDate());
  const staff = DEMO_DESK.staff.map((s) => ({ id: s.id, name: s.name }));
  const prices = DEMO_DESK.services.slice(0, 12).map((s) => s.cents);
  const f: Facts = { staff, tickets: [], walkins: [], shifts: [], noShows: [], visits: [], giftUsed: [], lost: [{ name: "Jen Park" }, { name: "Thu Le" }, { name: "Anna Kim" }] };
  const clients = Array.from({ length: 900 }, (_, i) => `c${i}`);
  const seen = new Set<string>();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 70);
  let id = 0;
  for (let d = 0; d <= 70; d++) {
    const day = new Date(start); day.setDate(start.getDate() + d);
    const dow = day.getDay();
    const busy = [0.6, 0.8, 0.6, 0.85, 0.9, 1.2, 1.5][dow];
    for (const s of staff) {
      if (r() < 0.15) continue;
      const from = new Date(day); from.setHours(9 + Math.floor(r() * 2), 0, 0, 0);
      const to = new Date(day); to.setHours(18 + Math.floor(r() * 2), 0, 0, 0);
      if (from > now) continue;
      f.shifts.push({ staff: s.id, from: from.toISOString(), to: (to > now ? now : to).toISOString() });
    }
    const n = Math.round(busy * (14 + r() * 8));
    for (let i = 0; i < n; i++) {
      const paid = new Date(day); paid.setHours(10 + Math.floor(r() * 9), Math.floor(r() * 60), 0, 0);
      if (paid > now) continue;
      const s = staff[Math.floor(r() * staff.length)];
      const cents = prices[Math.floor(r() * prices.length)] + (r() < 0.3 ? 1000 : 0);
      const tip = Math.round(cents * (0.12 + r() * 0.1) / 100) * 100;
      const client = r() < 0.85 ? clients[Math.floor(r() * clients.length)] : null;
      const isNew = !!client && !seen.has(client);
      if (client) { seen.add(client); f.visits.push({ client, at: paid.toISOString() }); }
      f.tickets.push({ id: `d${id++}`, paidAt: paid.toISOString(), client, newClient: isNew, source: isNew ? (["google", "web", "instagram", "phone"] as const)[Math.floor(r() * 4)] : null,
        sales: cents, tips: tip, fees: r() < 0.7 ? Math.round(cents * 0.027) + 5 : 0, giftSold: r() < 0.03 ? 5000 : 0, rebooked: r() < 0.38,
        lines: [{ staff: s.id, cents, kind: "service" }, { staff: s.id, cents: tip, kind: "tip" }] });
    }
    for (let i = 0; i < Math.round(busy * 4); i++) {
      const came = new Date(day); came.setHours(10 + Math.floor(r() * 8), Math.floor(r() * 60), 0, 0);
      if (came > now) continue;
      const out = r() < 0.06;
      const wait = Math.round(4 + r() * (dow === 6 ? 24 : 14));
      f.walkins.push({ came: came.toISOString(), seatedAt: out ? null : new Date(came.getTime() + wait * 60_000).toISOString(), walkedOut: out });
    }
    if (r() < 0.5) { const at = new Date(day); at.setHours(14, 0, 0, 0); if (at < now) f.noShows.push({ at: at.toISOString(), cents: 5500 }); }
    if (r() < 0.3) { const at = new Date(day); at.setHours(15, 0, 0, 0); if (at < now) f.giftUsed.push({ at: at.toISOString(), cents: 2500 }); }
  }
  return f;
}
