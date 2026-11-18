"use client";
// Desk context for front-desk screens (checkout): who's signed in, which salon, services + staff.
// Cached on the device so checkout still opens with no internet. Test copy (sign-in off) uses sample data.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SMS_ON, getDevice, isSignedIn, myMemberships, rpc, type Device, type Membership, type Role } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { NAIL_TEMPLATE } from "@/lib/onboarding/data";
import { setLive } from "@/lib/checkout/store";
import { rememberPinLens } from "@/lib/pin";

export type DeskService = { id: string; cat: string; name: string; minutes: number; cents: number; priceFrom: boolean };
export type DeskStaff = { id: string; name: string; role: Role; clockedIn: boolean; turns: number; centsToday: number; pinLen?: number | null; skills?: string[] };
export type Desk = {
  mode: "demo" | "live";
  salonId: string;
  salonName: string;
  me: Pick<Membership, "membership_id" | "display_name" | "role">;
  device: Device | null;
  services: DeskService[];
  staff: DeskStaff[];
  /** Card payments: Stripe connected + readers paired (session 3). */
  pay: { ready: boolean; readers: { id: string; label: string; simulated: boolean }[] };
};

const DEMO_SALON = "00000000-0000-4000-8000-00000000de00";
const demoId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const DEMO_DESK: Desk = {
  mode: "demo",
  salonId: DEMO_SALON,
  salonName: "Test Nails",
  me: { membership_id: demoId(900), display_name: "Hanh", role: "front_desk" },
  device: null,
  services: NAIL_TEMPLATE.map((s, i) => ({ id: demoId(100 + i), cat: s.cat, name: s.name, minutes: s.minutes, cents: s.priceCents, priceFrom: s.cat === "Waxing" })),
  staff: [
    { id: demoId(1), name: "Kim", role: "tech", clockedIn: true, turns: 3, centsToday: 18600, skills: ["Gel", "Dip", "Nail art"] },
    { id: demoId(2), name: "Tuyết", role: "tech", clockedIn: true, turns: 2, centsToday: 12000, skills: ["Pedicure", "Acrylic"] },
    { id: demoId(3), name: "Ngọc", role: "tech", clockedIn: false, turns: 0, centsToday: 0, skills: ["Gel", "Pedicure"] },
  ],
  pay: { ready: false, readers: [] },
};

const cacheKey = (salon: string) => `nailpos.desk.${salon}`;
function readCache(salon: string): Desk | null {
  try { const r = localStorage.getItem(cacheKey(salon)); return r ? (JSON.parse(r) as Desk) : null; } catch { return null; }
}

type StaffRow = { membership_id: string; display_name: string; role: Role; clocked_in: boolean; turns_today: number; cents_today: number; pin_len?: number | null; skills?: string[] | null };

async function fetchDesk(m: Membership, device: Device | null): Promise<Desk> {
  const sb = getSupabase();
  if (!sb) throw new Error("offline");
  const [{ data: svc, error }, staff, pay] = await Promise.all([
    sb.from("services").select("id,category,name,minutes,price_cents,price_from").eq("salon_id", m.salon_id).is("archived_at", null).order("sort"),
    rpc<StaffRow[]>("desk_staff", { p_salon: m.salon_id }),
    rpc<{ charges_enabled: boolean; readers: Desk["pay"]["readers"] } | null>("salon_pay_setup", { p_salon: m.salon_id }).catch(() => null),
  ]);
  if (error) throw new Error(error.message);
  rememberPinLens(staff.map((s) => ({ id: s.membership_id, len: s.pin_len })));
  return {
    mode: "live", salonId: m.salon_id, salonName: m.salon_name, me: m, device,
    services: (svc ?? []).map((s) => ({ id: s.id, cat: s.category, name: s.name, minutes: s.minutes, cents: Number(s.price_cents), priceFrom: !!s.price_from })),
    staff: staff.map((s) => ({ id: s.membership_id, name: s.display_name, role: s.role, clockedIn: s.clocked_in, turns: s.turns_today, centsToday: Number(s.cents_today), pinLen: s.pin_len ?? null, skills: s.skills ?? [] })),
    pay: { ready: !!pay?.charges_enabled, readers: pay?.readers ?? [] },
  };
}

export function useDesk() {
  const router = useRouter();
  const [desk, setDesk] = useState<Desk | null>(null);
  const [err, setErr] = useState("");
  const [m, setM] = useState<{ ms: Membership; device: Device | null } | null>(null);

  useEffect(() => {
    if (!SMS_ON) { setLive(false); setDesk(DEMO_DESK); return; }
    void (async () => {
      const device = getDevice();
      const savedSalon = device?.salonId ?? (() => { try { return localStorage.getItem("nailpos.salon"); } catch { return null; } })();
      // Offline: open from the device cache.
      const cached = savedSalon ? readCache(savedSalon) : null;
      if (cached) { setLive(true); setDesk({ ...cached, pay: cached.pay ?? { ready: false, readers: [] }, device }); }
      try {
        if (!(await isSignedIn())) { if (!cached) router.replace("/login"); return; }
        const list = (await myMemberships()).filter((x) => x.role !== "tech");
        if (!list.length) return router.replace("/t");
        const ms = list.find((x) => x.salon_id === savedSalon) ?? list[0];
        setLive(true);
        setM({ ms, device: device?.salonId === ms.salon_id ? device : null });
      } catch (e) { if (!cached) setErr((e as Error).message); }
    })();
  }, [router]);

  const refresh = useCallback(async () => {
    if (!m) return;
    try {
      const d = await fetchDesk(m.ms, m.device);
      setDesk(d);
      try { localStorage.setItem(cacheKey(d.salonId), JSON.stringify(d)); } catch { /* */ }
    } catch (e) { setDesk((cur) => { if (!cur) setErr((e as Error).message); return cur; }); }
  }, [m]);
  useEffect(() => { void refresh(); }, [refresh]);

  return { desk, err, refresh };
}

/* ---------- who is working the desk right now (salon device; set by PIN on Today) ---------- */
export type Acting = { membership_id: string; name: string; role: Role; at: number };
const ACT_KEY = "nailpos.acting";
/** Auto-lock after the salon's idle time (Settings → PIN rules; default 2 minutes). */
export function idleMs(): number { try { return Number(localStorage.getItem("nailpos.idle")) || 2 * 60 * 1000; } catch { return 2 * 60 * 1000; } }
export function getActing(): Acting | null {
  try {
    const a = JSON.parse(localStorage.getItem(ACT_KEY) || "null") as Acting | null;
    return a && Date.now() - a.at < idleMs() ? a : null;
  } catch { return null; }
}
export function setActing(a: Acting | null) {
  try { if (a) localStorage.setItem(ACT_KEY, JSON.stringify({ ...a, at: Date.now() })); else localStorage.removeItem(ACT_KEY); } catch { /* */ }
}
/** Keep the acting person signed in while they use the screen. */
export function touchActing() { const a = getActing(); if (a) setActing(a); }
