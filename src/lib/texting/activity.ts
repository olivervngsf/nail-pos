"use client";
// Settings → Texting → Messages: every text + email to this salon's clients and staff, with what happened.
// Owner/manager only (text_activity). Test copy = sample rows. Cached on the device for offline.
import { useCallback, useEffect, useState } from "react";
import { SMS_ON, rpc } from "@/lib/auth";
import type { MessageRow } from "./status";

export type Activity = { timeZone: string | null; number: string | null; texting: string; rows: MessageRow[] };

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
export const DEMO_ACTIVITY: Activity = {
  timeZone: "America/Los_Angeles", number: null, texting: "waiting",
  rows: [
    { id: "d1", channel: "email", kind: "day_before", status: "queued", error: null, to: "l•••@gmail.com", at: ago(-20), sendAt: ago(-20) },
    { id: "d2", channel: "email", kind: "confirm", status: "sent", error: null, to: "l•••@gmail.com", at: ago(1) },
    { id: "d3", channel: "sms", kind: "confirm", status: "skipped", error: "salon's texting number not registered yet", to: "••4410", at: ago(1) },
    { id: "d4", channel: "sms", kind: "invite", status: "delivered", error: null, to: "••0912", at: ago(3) },
    { id: "d5", channel: "sms", kind: "reminder", status: "blocked", error: "no recorded yes to texts from this client", to: "••7731", at: ago(5) },
    { id: "d6", channel: "sms", kind: "invite", status: "blocked", error: "replied STOP", to: "••2208", at: ago(26) },
    { id: "d7", channel: "sms", kind: "invite", status: "failed", error: "30006: Landline or unreachable carrier", to: "••5550", at: ago(30) },
    { id: "d8", channel: "email", kind: "two_hours", status: "skipped", error: "booking canceled, moved or starting now", to: "m•••@yahoo.com", at: ago(48) },
  ],
};

export function useTextActivity(salonId: string | undefined, demo: boolean) {
  const [act, setAct] = useState<Activity | null>(null);
  const load = useCallback(async () => {
    if (demo || !SMS_ON || !salonId) { setAct(DEMO_ACTIVITY); return; }
    const key = `nailpos.textlog.${salonId}`;
    try { const r = localStorage.getItem(key); if (r) setAct(JSON.parse(r) as Activity); } catch { /* */ }
    try {
      const a = await rpc<Activity>("text_activity", { p_salon: salonId, p_limit: 100 });
      setAct(a);
      try { localStorage.setItem(key, JSON.stringify(a)); } catch { /* */ }
    } catch { /* offline or not allowed: keep what we have */ }
  }, [salonId, demo]);
  useEffect(() => { void load(); }, [load]);
  return { act, reload: load, demo: demo || !SMS_ON || !salonId };
}
