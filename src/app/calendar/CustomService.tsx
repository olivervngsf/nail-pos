"use client";
// Booking drawer: a service that isn't on the menu. Added to this booking only, or (with an owner/manager OK)
// also saved to the salon's menu so it's there next time. Saving needs internet; the booking itself never waits on it.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Chip } from "@/components/kit";
import { OwnerOkPanel, useOwnerOk } from "@/components/OwnerOk";
import type { Desk } from "@/lib/desk";
import { addToMenu, onMenu, readCustom } from "@/lib/booking/menu";

type Svc = { id?: string; name: string; minutes: number; cents: number };

export function CustomService({ desk, cats, cat0, onAdd, onClose, onMenuChanged }: {
  desk: Desk; cats: string[]; cat0: string; onAdd: (s: Svc) => void; onClose: () => void; onMenuChanged?: () => void;
}) {
  const t = useTranslations("calendar");
  const [f, setF] = useState({ name: "", price: "", min: "" });
  const [save, setSave] = useState(false);
  const [cat, setCat] = useState(cat0 || "Custom");
  const [step, setStep] = useState<"form" | "ok">("form");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = useOwnerOk({ mode: desk.mode, salonId: desk.salonId, role: desk.me.role }, save, "menu");
  const s = readCustom(f);
  const dup = !!s && onMenu(s.name, desk.services);

  const justThis = () => { if (s) { onAdd(s); onClose(); } };
  const saving = useRef(false);
  const doSave = async () => {
    if (!s || saving.current) return;
    saving.current = true; setBusy(true); setErr("");
    try {
      const approvalId = await ok.approvalId();
      const id = await addToMenu(desk.mode, desk.salonId, { ...s, cat }, approvalId);
      onAdd({ ...s, id });
      onMenuChanged?.();
      onClose();
    } catch (e) {
      const m = (e as Error).message;
      setErr(!navigator.onLine ? t("b2_saveNet") : /already on the menu/.test(m) ? t("b2_saveDup") : /OK|not_manager/.test(m) ? t("b2_saveDenied") : m);
      setStep("form"); setBusy(false); saving.current = false;
    }
  };
  // PIN given on the salon device → save straight away.
  useEffect(() => { if (step === "ok" && ok.okd) void doSave(); }, [step, ok.okd]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    if (!s) return;
    if (!save) return justThis();
    if (!navigator.onLine && desk.mode === "live") return setErr(t("b2_saveNet"));
    if (ok.gate === "denied") return setErr(t("b2_saveDenied"));
    if (ok.open) return void doSave();
    setStep("ok");
  };

  if (step === "ok") return (
    <div className="bk-cx" data-testid="menu-ok">
      <b style={{ fontSize: 13 }}>{t("b2_saveOkTitle")}</b>
      <span className="cap">{t("b2_saveOkWhy", { name: s?.name ?? "" })}</span>
      <OwnerOkPanel ok={ok} deniedText={t("b2_saveDenied")} />
      <div style={{ display: "flex", gap: 8 }}><Button onClick={() => setStep("form")}>{t("b2_back")}</Button><Button onClick={justThis}>{t("b2_justThis")}</Button></div>
    </div>
  );
  return (
    <div className="bk-cx">
      <b style={{ fontSize: 13 }}>{t("b2_customTitle")}</b>
      <input className="inp" placeholder={t("b2_customName")} aria-label={t("b2_customName")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ height: 40 }} data-testid="cx-name" />
      <div style={{ display: "flex", gap: 8 }}>
        <input className="inp" inputMode="decimal" placeholder={t("b2_customPrice")} aria-label={t("b2_customPrice")} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} style={{ height: 40 }} data-testid="cx-price" />
        <input className="inp" inputMode="numeric" placeholder={t("b2_customMin")} aria-label={t("b2_customMin")} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} style={{ height: 40 }} />
      </div>
      <label className="bk-save" data-testid="cx-save">
        <input type="checkbox" checked={save} onChange={(e) => { setSave(e.target.checked); setErr(""); }} />
        <span><b>{t("b2_saveMenu")}</b><span className="cap" style={{ display: "block" }}>{t("b2_saveMenuSub")}</span></span>
      </label>
      {save && <>
        <span className="cap">{t("b2_saveGroup")}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[...new Set([...cats, "Custom"])].map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
      </>}
      {save && dup && <span className="hint err">{t("b2_saveDup")}</span>}
      {err && <span className="hint err" data-testid="cx-err">{err}</span>}
      {!save && <span className="cap">{t("b2_customNote")}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={onClose}>{t("b2_cancel")}</Button>
        <Button variant="primary" onClick={add} disabled={!s || busy || (save && dup)} data-testid="cx-add">{save ? t("b2_saveAdd") : t("b2_customAdd")}</Button>
      </div>
    </div>
  );
}
