"use client";
// Salon device: who is it, who is signed in, is it still the salon's? (board https://claude.ai/artifact/FMfHSYjGBmviTiqfX8TYXK)
// One source of truth = the device row in Settings → Devices. The faces screen re-checks it on open, every 30 s and when the
// screen comes back, so a rename / job change / removal shows on the tablet within a minute. No local-only device.
import { useCallback, useEffect, useState } from "react";
import { myMemberships, rpc, SMS_ON, type Device, type DeviceKind, type Role } from "@/lib/auth";

const ABC = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 letters, no 0/O or 1/I to mix up on the phone
/** Short fixed ID for a device ("7K2Q"), from its id: never changes, even when the nickname or job does. */
export function deviceCode(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, "").slice(0, 5).padEnd(5, "0");
  let n = parseInt(hex, 16) || 0;
  let out = "";
  for (let i = 0; i < 4; i++) { out = ABC[n % 32] + out; n = Math.floor(n / 32); }
  return out;
}

export type DeviceCheck = {
  /** active = the salon still has it · removed = signed out / not in the salon's list · unknown = offline or can't tell */
  state: "active" | "removed" | "unknown";
  name: string;
  kind?: DeviceKind;
  code: string;
  /** Person whose login this tablet uses; null = its own device login (QR). */
  person: { name: string; role: Role } | null;
  salonName?: string;
  setUpBy?: string | null;
  setUpAt?: string | null;
  checkedAt?: number;
};
type Row = { id: string; name: string; kind: DeviceKind | "owner"; created_at: string; set_up_by: string | null };

export const CHECK_MS = 30_000;

/** Pure: what the device list says about this device. Not admin = can't read the list = unknown. */
export function judge(device: Device, list: Row[] | null): Pick<DeviceCheck, "state" | "name" | "kind" | "setUpBy" | "setUpAt"> {
  if (!list) return { state: "unknown", name: device.name, kind: device.kind };
  const r = list.find((x) => x.id === device.id);
  if (!r) return { state: "removed", name: device.name, kind: device.kind };
  return { state: "active", name: r.name, kind: r.kind === "owner" ? "front_desk" : r.kind, setUpBy: r.set_up_by, setUpAt: r.created_at };
}

export function useDeviceCheck(device: Device | null | undefined): DeviceCheck | null {
  const [c, setC] = useState<DeviceCheck | null>(null);
  const run = useCallback(async () => {
    if (!device) return setC(null);
    const base = { code: deviceCode(device.id), name: device.name, kind: device.kind, person: null, checkedAt: Date.now() };
    if (!SMS_ON) return setC({ ...base, state: "active" });
    try {
      if (device.own) {
        const r = await rpc<{ name: string; kind: DeviceKind; active: boolean } | null>("my_device");
        const ms = await myMemberships().catch(() => []);
        const salonName = ms.find((m) => m.salon_id === device.salonId)?.salon_name;
        if (!r || !r.active) return setC({ ...base, state: "removed", salonName });
        try { localStorage.setItem("nailpos.device", JSON.stringify({ ...device, name: r.name, kind: r.kind })); } catch { /* storage blocked */ }
        return setC({ ...base, state: "active", name: r.name, kind: r.kind, salonName });
      }
      const ms = await myMemberships();
      const me = ms.find((m) => m.salon_id === device.salonId && m.membership_id);
      const person = me ? { name: me.display_name, role: me.role } : null;
      const admin = me && (me.role === "owner" || me.role === "manager");
      // Not a member of that salon any more = this login can't use the device there.
      if (!me) return setC({ ...base, state: "removed" });
      const list = admin ? await rpc<Row[]>("devices_list", { p_salon: device.salonId }) : null;
      setC({ ...base, ...judge(device, list), person, salonName: me.salon_name });
    } catch {
      setC((cur) => cur ?? { ...base, state: "unknown" }); // offline: keep the last answer
    }
  }, [device]);
  useEffect(() => {
    void run();
    const t = setInterval(() => void run(), CHECK_MS);
    const vis = () => { if (document.visibilityState === "visible") void run(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [run]);
  return c;
}
