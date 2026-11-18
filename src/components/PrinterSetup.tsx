"use client";
// The printer pattern from checkout (Print by Bluetooth): pick the printer once, then one tap prints; paper 58/80 mm and
// "Change printer" right under it. Shared by the receipt, payout sheet, PIN earnings and the tech phone.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Segmented } from "@/components/kit";
import { canBluetooth, canBuiltIn, isIOS, pickBuiltIn, pickPrinter, pickRawbt, savedPrinter, savePrinter, type SavedPrinter } from "@/lib/print/bluetooth";
import type { Paper } from "@/lib/print/escpos";

export function usePrinter() {
  const [saved, setSaved] = useState<SavedPrinter | null>(null);
  const [ok, setOk] = useState(false);
  const [ios, setIos] = useState(false);
  const [err, setErr] = useState("");
  const [builtIn, setBuiltIn] = useState(false);
  const [rawHint, setRawHint] = useState(false); // built-in pick found nothing → offer the RawBT app
  useEffect(() => { setSaved(savedPrinter()); setOk(canBluetooth() || canBuiltIn()); setIos(isIOS()); setBuiltIn(canBuiltIn()); }, []);
  const paper: Paper = saved?.paper ?? 58;
  return {
    ok, ios, saved, paper, err, builtIn, rawHint,
    refresh: () => setSaved(savedPrinter()),
    setPaper: (p: Paper) => { if (!saved) return; const n = { ...saved, paper: p }; savePrinter(n); setSaved(n); },
    // all = list every Bluetooth device nearby, not only the names we know as printers
    // inner = the terminal's own printer (handheld with a printer inside)
    change: async (all = false, inner = false) => {
      setErr(""); setRawHint(false);
      try { setSaved(inner ? await pickBuiltIn(paper) : await pickPrinter(paper, all)); }
      catch (e) { const m = (e as Error).message; if (inner) setRawHint(true); if (!/cancel|no port selected/i.test(m)) setErr(m); /* else: closed the list */ }
    },
    useRawbt: () => { setErr(""); setRawHint(false); setSaved(pickRawbt(paper)); },
  };
}
export type Printer = ReturnType<typeof usePrinter>;

/** "NETUM · 58 mm" (or "Tap to pick your printer") + paper + Change printer. Nothing on a browser without Bluetooth
 * (a terminal with a printer inside still gets the row: its browser may have no Bluetooth but can reach that printer). */
export function PrinterSetup({ p }: { p: Printer }) {
  const t = useTranslations("checkout");
  if (!p.ok) return p.ios ? <div className="row s"><span className="g cap">{t("btIos")}</span></div> : null;
  return (
    <div className="row s" style={{ gap: 8, flexWrap: "wrap" }} data-testid="printer-setup">
      <span className="g cap">{p.saved ? `${p.saved.name} · ${p.saved.paper} mm` : t("btPair")}</span>
      {p.saved && <Segmented label={t("btPaper")} value={String(p.paper)} onChange={(v) => p.setPaper(Number(v) as Paper)} options={[{ value: "58", label: "58 mm" }, { value: "80", label: "80 mm" }]} />}
      <Button size="sm" variant="ghost" onClick={() => void p.change()}>{p.saved ? t("btChange") : t("printBt")}</Button>
      <Button size="sm" variant="ghost" data-testid="printer-all" onClick={() => void p.change(true)}>{t("btAll")}</Button>
      {p.builtIn && <Button size="sm" variant="ghost" data-testid="printer-builtin" onClick={() => void p.change(false, true)}>{t("btBuiltIn")}</Button>}
      {p.rawHint && <span className="cap" style={{ flexBasis: "100%" }}>{t("btRawbtHint")} <Button size="sm" variant="ghost" data-testid="printer-rawbt" onClick={p.useRawbt}>{t("btRawbt")}</Button></span>}
      {p.err && <span className="cap" role="alert" style={{ flexBasis: "100%" }}>{p.err}</span>}
    </div>
  );
}

