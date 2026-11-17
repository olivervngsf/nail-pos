"use client";
// Printer settings (owner/manager pick what each printout shows). One set per salon, saved on the server
// (`print_settings_get` / `print_settings_save`) and kept on the device so printing works offline.
import { useCallback, useEffect, useState } from "react";
import { rpc } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";

export type PrintSettings = {
  /** Client receipt (checkout). */
  receipt: { staff: boolean; tips: boolean; client: boolean; qr: boolean; thanks: string };
  /** Staff earnings slip (payout sheet, PIN earnings, tech phone). */
  staff: { tickets: boolean; tipSplit: boolean; checkCash: boolean; signature: boolean; printedAt: boolean };
  /** Ticket slip (QR the tech scans). */
  slip: { client: boolean; staff: boolean };
};

export const PRINT_DEFAULTS: PrintSettings = {
  receipt: { staff: true, tips: true, client: true, qr: true, thanks: "" },
  staff: { tickets: false, tipSplit: true, checkCash: true, signature: true, printedAt: true },
  slip: { client: true, staff: true },
};

/** Fill anything missing with the defaults (older saves, new options). */
export function withDefaults(p: Partial<PrintSettings> | null | undefined): PrintSettings {
  const o = (p ?? {}) as Partial<PrintSettings>;
  return { receipt: { ...PRINT_DEFAULTS.receipt, ...o.receipt }, staff: { ...PRINT_DEFAULTS.staff, ...o.staff }, slip: { ...PRINT_DEFAULTS.slip, ...o.slip } };
}

const key = (salonId: string) => `nailpos.print.${salonId}`;
export function cachedPrintSettings(salonId?: string | null): PrintSettings {
  if (!salonId) return PRINT_DEFAULTS;
  try { return withDefaults(JSON.parse(localStorage.getItem(key(salonId)) || "null")); } catch { return PRINT_DEFAULTS; }
}
function cache(salonId: string, s: PrintSettings) { try { localStorage.setItem(key(salonId), JSON.stringify(s)); } catch { /* */ } }

/** Settings for this salon: the device copy right away, then the server copy when online. */
export function usePrintSettings(salonId?: string | null, demo = false) {
  const [settings, setSettings] = useState<PrintSettings>(PRINT_DEFAULTS);
  useEffect(() => {
    if (!salonId) return;
    setSettings(cachedPrintSettings(salonId));
    if (demo || !getSupabase()) return;
    void rpc<Partial<PrintSettings> | null>("print_settings_get", { p_salon: salonId })
      .then((r) => { const s = withDefaults(r); cache(salonId, s); setSettings(s); }).catch(() => { /* offline: keep the device copy */ });
  }, [salonId, demo]);
  const save = useCallback(async (next: PrintSettings) => {
    if (!salonId) return;
    if (!demo && getSupabase()) await rpc("print_settings_save", { p_salon: salonId, p: next });
    cache(salonId, next); setSettings(next);
  }, [salonId, demo]);
  return { settings, save };
}
