"use client";
// My PIN: type a new one twice (the salon's PIN length), saved at once.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, PinKeypad, Toast } from "@/components/kit";
import { rpc, SMS_ON } from "@/lib/auth";
import { cachedRules, pinProblem, saveRules, type PinRules } from "@/lib/pin";
import { useMe } from "@/lib/me";
import MeSub from "../MeSub";

export default function Page() {
  const t = useTranslations("me");
  const router = useRouter();
  const { me } = useMe();
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
      setStep(""); setToast(t("pinSaved")); setTimeout(() => router.push("/me"), 1200);
    } catch (e) { setErr((e as Error).message.includes("weak") ? t("pinBad.run", { n: rules.length }) : (e as Error).message); setStep("one"); }
  };
  return (
    <MeSub title={t("pinShort")}>
      <div>
        <section className="card pad me-pin" data-testid="pin-page">
          {!step
            ? <>
                <b style={{ fontSize: 17 }}>{t("pinNow", { n: rules.length })}</b>
                <span className="cap">{t("pinUse")}</span>
                <Button variant="primary" data-testid="pin-start" onClick={() => { setErr(""); setStep("one"); }}>{t("changePin")}</Button>
              </>
            : <>
                <b style={{ textAlign: "center" }}>{step === "one" ? t("pinNew", { n: rules.length }) : t("pinAgain")}</b>
                <PinKeypad key={step} length={rules.length} error={err} onDone={(p) => void done(p)} />
                <Button variant="ghost" onClick={() => setStep("")}>{t("cancel")}</Button>
              </>}
        </section>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </MeSub>
  );
}
