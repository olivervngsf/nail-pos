"use client";
// Settings → PIN rules (board 5.3). Owner changes; manager reads. 6 or 10 digits, wrong-PIN lock, auto-lock, when a PIN is asked.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Chip, Switch, Toast } from "@/components/kit";
import { rpc } from "@/lib/auth";
import { cachedRules, saveRules, type PinRules } from "@/lib/pin";
import SettingsShell, { type Access } from "../SettingsShell";

export default function PinRulesPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.pinRules")}>{(a) => <Rules a={a} />}</SettingsShell>;
}

function Rules({ a }: { a: Access }) {
  const t = useTranslations("settings.pin");
  const [r, setR] = useState<PinRules>(cachedRules(a.salonId));
  const [saved, setSaved] = useState<PinRules>(r);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    if (a.demo) return;
    void rpc<PinRules>("pin_rules", { p_salon: a.salonId }).then((v) => { setR(v); setSaved(v); saveRules(a.salonId, v); }).catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId]);

  const change = async (p: Partial<PinRules>) => {
    if (!a.owner) return;
    const next = { ...r, ...p };
    setR(next); setErr("");
    try {
      const v = a.demo ? next : await rpc<PinRules>("set_pin_rules", { p_salon: a.salonId, p: next });
      setSaved(v); setR(v); saveRules(a.salonId, v);
      setToast(t("saved")); setTimeout(() => setToast(""), 2500);
    } catch (e) { setR(saved); setErr((e as Error).message); }
  };
  const dis = !a.owner;

  return (
    <div className="set-cols" data-testid="pin-rules">
      <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {!a.owner && <div className="note">{t("ownerOnly")}</div>}
        <div className="eyebrow">{t("length")}</div>
        <div className="set-lens">
          {([6, 10] as const).map((n) => (
            <button key={n} type="button" className={`set-len card${r.length === n ? " on" : ""}`} aria-pressed={r.length === n} disabled={dis} data-testid={`len-${n}`} onClick={() => void change({ length: n })}>
              <b>{t(`len${n}`)}</b>{n === 6 && <span className="tag jade">{t("recommended")}</span>}
              <span className="cap">{t(`len${n}Note`)}</span>
              <span className="dots" aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} className="on" />)}</span>
            </button>
          ))}
        </div>
        <div className="cap">{t("changeNote", { n: r.length })}</div>
        <div className="eyebrow">{t("wrong")}</div>
        <div className="group">
          <div className="row s"><span className="g">{t("lockAfter")}</span><span className="set-chips">{([3, 5, 10] as const).map((n) => <Chip key={n} disabled={dis} on={r.lock_after === n} onClick={() => void change({ lock_after: n })}>{n}</Chip>)}</span></div>
          <div className="row s"><span className="g">{t("wait")}</span><span className="set-chips">{([1, 5] as const).map((n) => <Chip key={n} disabled={dis} on={r.lock_minutes === n} onClick={() => void change({ lock_minutes: n })}>{t("min", { n })}</Chip>)}</span></div>
          <div className="row s"><span className="g">{t("textOwner")}<span className="cap">{t("textOwnerNote")}</span></span><Switch label={t("textOwner")} on={r.text_owner} onChange={(v) => void change({ text_owner: v })} /></div>
        </div>
        <div className="eyebrow">{t("autoLock")}</div>
        <div className="group">
          <div className="row s"><span className="g">{t("idle")}</span><span className="set-chips">{([1, 2, 5, 10] as const).map((n) => <Chip key={n} disabled={dis} on={r.idle_minutes === n} onClick={() => void change({ idle_minutes: n })}>{t("min", { n })}</Chip>)}</span></div>
        </div>
      </section>
      <section style={{ width: 360, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="eyebrow">{t("askWhen")}</div>
        <div className="group">
          {(["unlock", "clock", "paysheet"] as const).map((k) => <div key={k} className="row s"><span className="g">{t(`always.${k}`)}</span><span className="cap">{t("alwaysOn")}</span></div>)}
          {(["ask_discount", "ask_refund", "ask_void", "ask_no_sale"] as const).map((k) => (
            <div key={k} className="row s"><span className="g">{t(k)}</span><Switch label={t(k)} on={r[k]} onChange={(v) => void change({ [k]: v } as Partial<PinRules>)} /></div>
          ))}
          {(["settings", "close"] as const).map((k) => <div key={k} className="row s"><span className="g">{t(`admin.${k}`)}</span><span className="cap">{t("adminOnly")}</span></div>)}
        </div>
        <div className="card pad cap">{t("forgot")}</div>
      </section>
      {err && <p className="hint err">{err}</p>}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
