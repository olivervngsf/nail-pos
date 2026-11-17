"use client";
// The printer pattern from checkout (Print by Bluetooth): pick the printer once, then one tap prints; paper 58/80 mm and
// "Change printer" right under it. Shared by the receipt, payout sheet, PIN earnings and the tech phone.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Segmented } from "@/components/kit";
import { canBluetooth, isIOS, pickPrinter, savedPrinter, savePrinter, type SavedPrinter } from "@/lib/print/bluetooth";
import type { Paper } from "@/lib/print/escpos";
import type { SlipDetail } from "@/lib/print/earnings";

export function usePrinter() {
  const [saved, setSaved] = useState<SavedPrinter | null>(null);
  const [ok, setOk] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => { setSaved(savedPrinter()); setOk(canBluetooth()); setIos(isIOS()); }, []);
  const paper: Paper = saved?.paper ?? 58;
  return {
    ok, ios, saved, paper,
    refresh: () => setSaved(savedPrinter()),
    setPaper: (p: Paper) => { if (!saved) return; const n = { ...saved, paper: p }; savePrinter(n); setSaved(n); },
    change: async () => { try { setSaved(await pickPrinter(paper)); } catch { /* closed the list */ } },
  };
}
export type Printer = ReturnType<typeof usePrinter>;

/** "NETUM · 58 mm" (or "Tap to pick your printer") + paper + Change printer. Nothing on a browser without Bluetooth. */
export function PrinterSetup({ p }: { p: Printer }) {
  const t = useTranslations("checkout");
  if (!p.ok) return p.ios ? <div className="row s"><span className="g cap">{t("btIos")}</span></div> : null;
  return (
    <div className="row s" style={{ gap: 8, flexWrap: "wrap" }} data-testid="printer-setup">
      <span className="g cap">{p.saved ? `${p.saved.name} · ${p.saved.paper} mm` : t("btPair")}</span>
      {p.saved && <Segmented label={t("btPaper")} value={String(p.paper)} onChange={(v) => p.setPaper(Number(v) as Paper)} options={[{ value: "58", label: "58 mm" }, { value: "80", label: "80 mm" }]} />}
      <Button size="sm" variant="ghost" onClick={() => void p.change()}>{p.saved ? t("btChange") : t("printBt")}</Button>
    </div>
  );
}

/** Slip rule, kept on this device: "totals" = summary only; "tickets" = every ticket (service + tips) above the totals. */
const DETAIL_KEY = "nailpos.slipDetail";
export function useSlipDetail() {
  const [detail, setDetail] = useState<SlipDetail>("totals");
  useEffect(() => { try { if (localStorage.getItem(DETAIL_KEY) === "tickets") setDetail("tickets"); } catch { /* */ } }, []);
  return { detail, set: (d: SlipDetail) => { setDetail(d); try { localStorage.setItem(DETAIL_KEY, d); } catch { /* */ } } };
}

export function SlipDetailPick({ d }: { d: ReturnType<typeof useSlipDetail> }) {
  const t = useTranslations("payouts");
  return (
    <div className="row s" style={{ gap: 8 }} data-testid="slip-detail">
      <span className="g cap">{t("slipShows")}</span>
      <Segmented label={t("slipShows")} value={d.detail} onChange={(v) => d.set(v as SlipDetail)}
        options={[{ value: "totals", label: t("slipTotals") }, { value: "tickets", label: t("slipTickets") }]} />
    </div>
  );
}
