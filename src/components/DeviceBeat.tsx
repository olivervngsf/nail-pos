"use client";
// A salon device tells the server "I'm on" every few minutes while its screen is showing (device_ping → devices.last_seen),
// so Founder Admin and Settings → Devices show a tablet that is on but idle as on, not "last used 2 days ago".
// Nothing to see. Skips: not a salon device, test version, offline, screen hidden. A miss is fine: the next beat catches up.
import { useEffect } from "react";
import { SMS_ON, getDevice, rpc } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";

export const BEAT_MS = 4 * 60_000; // "on now" in Founder Admin = seen in the last 10 minutes

export default function DeviceBeat() {
  useEffect(() => {
    if (!SMS_ON || !getSupabase()) return;
    const beat = () => {
      const d = getDevice();
      if (!d || document.visibilityState !== "visible" || !navigator.onLine) return;
      void rpc("device_ping", { p_device: d.id }).catch(() => { /* offline or signed out: try again next time */ });
    };
    beat();
    const h = setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("online", beat);
    return () => { clearInterval(h); document.removeEventListener("visibilitychange", beat); window.removeEventListener("online", beat); };
  }, []);
  return null;
}
