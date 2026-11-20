"use client";
// A salon device tells the server "I'm on" every few minutes while its screen is showing (device_ping → devices.last_seen),
// so Founder Admin and Settings → Devices show a tablet that is on but idle as on, not "last used 2 days ago".
// Each beat also sends speed counts (src/lib/vitals.ts → vitals_report) for Founder Admin's Speed check. Nothing to see. Skips: not a salon device, test version, offline, screen hidden. A miss is fine: the next beat catches up.
import { useEffect } from "react";
import { SMS_ON, getDevice, rpc } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { giveBack, startVitals, takeVitals } from "@/lib/vitals";

export const BEAT_MS = 4 * 60_000; // "on now" in Founder Admin = seen in the last 10 minutes

export default function DeviceBeat() {
  useEffect(() => {
    if (!SMS_ON || !getSupabase()) return;
    startVitals();
    const beat = () => {
      const d = getDevice();
      if (!d || document.visibilityState !== "visible" || !navigator.onLine) return;
      void rpc("device_ping", { p_device: d.id }).catch(() => { /* offline or signed out: try again next time */ });
      // Speed for Founder Admin: page-load counts since the last beat (kept for the next beat if sending fails).
      const v = takeVitals();
      if (v) void rpc("vitals_report", { p_device: d.id, p_loads: v.loads, p_load_ms: v.loadMs, p_slow: v.slow, p_errors: v.errors, p_last_error: v.lastError })
        .catch(() => giveBack(v));
    };
    beat();
    const h = setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("online", beat);
    return () => { clearInterval(h); document.removeEventListener("visibilitychange", beat); window.removeEventListener("online", beat); };
  }, []);
  return null;
}
