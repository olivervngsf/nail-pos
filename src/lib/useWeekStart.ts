"use client";
// Hooks for the salon's week start (see weekStart.ts). Kept apart so server code can use the pure helpers.
import { useEffect, useSyncExternalStore } from "react";
import { getWeekStart, setWeekStartLocal, WEEK_START_EVT, type WeekStart } from "./weekStart";

const sub = (cb: () => void) => {
  window.addEventListener(WEEK_START_EVT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(WEEK_START_EVT, cb); window.removeEventListener("storage", cb); };
};
/** The device's week start; re-renders when the owner changes it. */
export function useWeekStart(): WeekStart {
  return useSyncExternalStore(sub, getWeekStart, () => 1 as WeekStart);
}

/** Read the salon's pick once per screen load and keep the device copy in step. */
export function useSyncWeekStart(salonId: string | null | undefined, live: boolean) {
  useEffect(() => {
    if (!salonId || !live) return;
    let off = false;
    void import("@/lib/auth").then(({ rpc }) => rpc<number>("week_start_get", { p_salon: salonId }))
      .then((v) => { if (!off && (v === 0 || v === 1) && v !== getWeekStart()) setWeekStartLocal(v); })
      .catch(() => { /* offline: keep the device copy */ });
    return () => { off = true; };
  }, [salonId, live]);
}
