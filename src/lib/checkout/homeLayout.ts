"use client";
// The salon's pick for the Checkout home screen (Settings → Payments): List or Cards. Saved on the server
// (`checkout_layout_get` / `checkout_layout_save`, owner/manager) and kept on the device so it shows offline.
import { useCallback, useEffect, useState } from "react";
import { rpc } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { asHomeLayout, type HomeLayout } from "./home";

const key = (salonId: string) => `nailpos.homeLayout.${salonId}`;
const cached = (salonId: string): HomeLayout => { try { return asHomeLayout(localStorage.getItem(key(salonId))); } catch { return "list"; } };
const cache = (salonId: string, v: HomeLayout) => { try { localStorage.setItem(key(salonId), v); } catch { /* private mode */ } };

export function useHomeLayout(salon?: string | null, demo = false) {
  const salonId = demo ? "demo" : salon; // test copy: one device key (Settings and Checkout name the sample salon differently)
  const [layout, setLayout] = useState<HomeLayout>("list");
  useEffect(() => {
    if (!salonId) return;
    setLayout(cached(salonId));
    if (demo || !getSupabase()) return;
    void rpc<string | null>("checkout_layout_get", { p_salon: salonId })
      .then((r) => { const v = asHomeLayout(r); cache(salonId, v); setLayout(v); }).catch(() => { /* offline: keep the device copy */ });
  }, [salonId, demo]);
  const save = useCallback(async (next: HomeLayout) => {
    if (!salonId) return;
    if (!demo && getSupabase()) await rpc("checkout_layout_save", { p_salon: salonId, p_layout: next });
    cache(salonId, next); setLayout(next);
  }, [salonId, demo]);
  return { layout, save };
}
