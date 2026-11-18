"use client";
// Who am I, for the bottom-left profile pop-up on every desk screen. Opens instantly from the device cache (works offline),
// then checks the server once per tab. Salon device: the person who unlocked with their PIN is shown ("acting").
import { useEffect, useState } from "react";
import { SMS_ON, getDevice, isSignedIn, myMemberships, type Device, type Role } from "@/lib/auth";
import { getActing } from "@/lib/desk";

export type Me = { name: string; role: Role; salonId: string; salonName: string; salons: { id: string; name: string }[] };
export const DEMO_ME: Me = { name: "Mai Nguyen", role: "owner", salonId: "demo", salonName: "Test Nails", salons: [{ id: "demo", name: "Test Nails" }] };

const KEY = "nailpos.me";
const read = (): Me | null => { try { const r = localStorage.getItem(KEY); return r ? (JSON.parse(r) as Me) : null; } catch { return null; } };
export const isAdminRole = (r: Role) => r === "owner" || r === "manager";

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [acting, setActing] = useState<ReturnType<typeof getActing>>(null);
  // ready = the sign-in check finished (so screens can tell "still loading" from "not signed in").
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setDevice(getDevice());
    setActing(getActing());
    if (!SMS_ON) { setMe(DEMO_ME); setReady(true); return; }
    setMe(read());
    void (async () => {
      try {
        if (!(await isSignedIn())) return;
        const ms = await myMemberships();
        if (!ms.length) return;
        const d = getDevice();
        const saved = (() => { try { return localStorage.getItem("nailpos.salon"); } catch { return null; } })();
        const m = ms.find((x) => x.salon_id === (d?.salonId ?? saved)) ?? ms[0];
        const v: Me = { name: m.display_name, role: m.role, salonId: m.salon_id, salonName: m.salon_name, salons: ms.map((x) => ({ id: x.salon_id, name: x.salon_name })) };
        setMe(v);
        try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
      } catch { /* offline: keep the cached copy */ }
      finally { setReady(true); }
    })();
  }, []);
  const isDevice = !!device && !!me && (device.salonId === me.salonId || !SMS_ON);
  return { me, device, acting: isDevice ? acting : null, isDevice, ready };
}
