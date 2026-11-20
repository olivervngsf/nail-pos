"use client";
// The salon's pick for the client pay page layout (Settings → Payments). Saved on the server
// (`pay_layout_get` / `pay_layout_save`, owner/manager) and kept on the device so the setting shows offline.
import { useCallback, useEffect, useState } from "react";
import { rpc } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { asLayout, type PayLayout } from "./paypage";

const key = (salonId: string) => `nailpos.payLayout.${salonId}`;
const cached = (salonId: string): PayLayout => { try { return asLayout(localStorage.getItem(key(salonId))); } catch { return "receipt"; } };
const cache = (salonId: string, v: PayLayout) => { try { localStorage.setItem(key(salonId), v); } catch { /* private mode */ } };

export function usePayLayout(salonId?: string | null, demo = false) {
  const [layout, setLayout] = useState<PayLayout>("receipt");
  useEffect(() => {
    if (!salonId) return;
    setLayout(cached(salonId));
    if (demo || !getSupabase()) return;
    void rpc<string | null>("pay_layout_get", { p_salon: salonId })
      .then((r) => { const v = asLayout(r); cache(salonId, v); setLayout(v); }).catch(() => { /* offline: keep the device copy */ });
  }, [salonId, demo]);
  const save = useCallback(async (next: PayLayout) => {
    if (!salonId) return;
    if (!demo && getSupabase()) await rpc("pay_layout_save", { p_salon: salonId, p_layout: next });
    cache(salonId, next); setLayout(next);
  }, [salonId, demo]);
  return { layout, save };
}
