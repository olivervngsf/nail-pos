"use client";
// My PIN (board "Settings Map + Back Rules", After 2): is it set, how long, who sets the length, Change PIN, who to ask
// if forgotten. Type a new one twice (the salon's PIN length), saved at once; stays here after (Back = ‹ Settings).
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, PinKeypad, Toast } from "@/components/kit";
import { rpc, SMS_ON } from "@/lib/auth";
import { cachedRules, pinProblem, saveRules, type PinRules } from "@/lib/pin";
import { isAdminRole, useMe } from "@/lib/me";
import MeSub from "../MeSub";

export default function Page() {
  const t = useTranslations("me");
  const { me, isDevice, acting } = useMe();
  const [rules, setRules] = useState<PinRules>(cachedRules(null));
  const [step, setStep] = useState<"" | "one" | "two">("");
  const [first, setFirst] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!me) return;
    setRules(cachedRules(me.salonId));
    if (SMS_ON) void rpc<PinRules>("pin_rules", { p_salon: me.salonId }).then((r) => { setRules(r); saveRules(me.salonId, r); }).catch(() => {});
  }, [me]);
  const done = async (pin: string) => {
    if (!me) return;
    setErr("");
    if (step === "one") {
      const p = pinProblem(pin, rules.length);
      if (p) return setErr(t(`pinBad.${p}`, { n: rules.length }));
      setFirst(pin); setStep("two"); return;
    }
    if (pin !== first) { setErr(t("pinMismatch")); setStep("one"); return; }
    try {
      if (SMS_ON) await rpc("set_my_pin", { p_salon: me.salonId, p_pin: pin });
      setStep(""); setToast(t("pinSaved")); setTimeout(() => setToast(""), 3000);
    } catch (e) { setErr((e as Error).message.includes("weak") ? t("pinBad.run", { n: rules.length }) : (e as Error).message); setStep("one"); }
  };
  const canRules = isAdminRole(isDevice ? (acting?.role ?? "tech") : (me?.role ?? "tech"));
  return (
    <MeSub title={t("pinShort")}>
      {!step ? (
        <>
          <section className="me-pin-hero" data-testid="pin-page">
            <span className="me-pin-dots" aria-hidden>{Array.from({ length: rules.length }, (_, i) => <i key={i} />)}</span>
            <b>{t("pinIsSet")}</b>
            <span className="cap">{t("pinUse")}</span>
          </section>
          <section className="me-card">
            <div className="me-f"><span className="me-k">{t("pinLength")}</span><span className="me-v r num">{t("pinDigits", { n: rules.length })}</span></div>
            {canRules
              ? <Link href="/settings/pin" className="me-f me-link" data-testid="pin-rules-link"><span className="me-k">{t("pinWhoSets")}</span><span className="me-v r">{t("pinRulesOwner")}</span><span className="me-chev" aria-hidden>›</span></Link>
              : <div className="me-f"><span className="me-k">{t("pinWhoSets")}</span><span className="me-v r">{t("pinRulesOwner")}</span></div>}
          </section>
          <Button variant="primary" block data-testid="pin-start" onClick={() => { setErr(""); setStep("one"); }}>{t("changePin")}</Button>
          <div>
            <div className="me-h">{t("pinForgotH")}</div>
            <section className="me-card"><p className="me-note">{t("pinForgot")}</p></section>
          </div>
        </>
      ) : (
        <section className="card pad me-pin">
          <b style={{ textAlign: "center" }}>{step === "one" ? t("pinNew", { n: rules.length }) : t("pinAgain")}</b>
          <PinKeypad key={step} length={rules.length} error={err} onDone={(p) => void done(p)} />
          <Button variant="ghost" onClick={() => setStep("")}>{t("cancel")}</Button>
        </section>
      )}
      {toast && <Toast>{toast}</Toast>}
    </MeSub>
  );
}
