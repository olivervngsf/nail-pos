"use client";
// Settings → Tap to Pay on iPhone (Apple's rules R4 + R5, docs/tap-to-pay-iphone-plan.md): the owner or a manager turns
// it on for THIS iPhone and accepts Apple's terms here, before any checkout; staff never see the terms. Shows whether it
// is on and ready. Outside the iPhone app it says how to get there.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Banner, Button } from "@/components/kit";
import { inIosApp } from "@/lib/app/bridge";
import { canTapToPay, onTapWarm, showHowToTap, tapErrorKey, tapOnHere, tapWarmNow, resetTapForVideo, turnOffTap, turnOnTap, turnOnTapDemo, type TapCheck, type TapWarm } from "@/lib/app/reader";
import { HowToTapButton, HowToTapSteps } from "@/components/HowToTap";
import SettingsShell, { type Access } from "../SettingsShell";

export default function TapToPayPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.tapToPay")}>{(a) => <TapToPay a={a} />}</SettingsShell>;
}

function TapToPay({ a }: { a: Access }) {
  const t = useTranslations("settings.tapToPay");
  const tc = useTranslations("checkout");
  const [app, setApp] = useState<boolean | null>(null);
  const [check, setCheck] = useState<TapCheck | null>(null);
  const [on, setOn] = useState(false);
  const [warm, setWarm] = useState<TapWarm>({ state: "off" });
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    const ios = inIosApp();
    setApp(ios);
    setOn(tapOnHere());
    setWarm(tapWarmNow());
    const stop = onTapWarm(setWarm);
    if (ios) void canTapToPay().then(setCheck); else setCheck({ supported: false });
    return stop;
  }, []);

  const words = (e: unknown) => {
    const key = tapErrorKey((e as { code?: unknown }).code, typeof navigator === "undefined" || navigator.onLine);
    return key ? tc(key) : (e as Error).message;
  };
  const turnOn = async () => {
    setBusy(true); setErr(""); setText("");
    try {
      if (a.demo) turnOnTapDemo(); else await turnOnTap(a.salonId, setText);
      setOn(true);
      // Apple R8: right after turning on, show how the client taps (Apple's screens, else ours).
      if ((await showHowToTap()) === "own") setSteps(true);
    }
    catch (e) { if ((e as Error).message !== "canceled") setErr(words(e)); }
    setBusy(false); setText("");
  };
  const resetForVideo = async () => {
    if (!confirm(t("resetAsk"))) return;
    setBusy(true); setErr("");
    await resetTapForVideo();
    setOn(false); setBusy(false);
  };
  const turnOff = async () => {
    if (!confirm(t("offAsk"))) return;
    setBusy(true); setErr("");
    await turnOffTap();
    setOn(false); setBusy(false);
  };

  if (app === null) return <p className="cap" role="status">{t("loading")}</p>;
  const ready = on && warm.state === "ready";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }} data-testid="settings-tap">
      <p style={{ margin: 0, fontSize: 15 }}>{t("what")}</p>

      {!app && <div className="card pad" style={{ gap: 10 }} data-testid="tap-not-app">
        <b>{t("notAppTitle")}</b>
        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
          <li>{t("n1")}</li><li>{t("n2")}</li><li>{t("n3")}</li>
        </ol>
      </div>}

      {app && check && !check.supported && <Banner tone="info" id="tap-unsupported" keep="device" data-testid="tap-unsupported">{tc("tapErr.unsupported")}</Banner>}

      {app && check?.supported && <div className="card pad" style={{ gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Apple's own symbol, handed over by the app */}
          {check.icon && <img src={check.icon} alt="" width={32} height={32} />}
          <b style={{ flex: 1, fontSize: 17 }}>{tc("tapTitleIphone")}</b>
          <span className={`pill ${on ? "ok" : ""}`} data-testid="tap-state">
            {on && <span className="dot" aria-hidden />}{!on ? t("stateOff") : ready ? t("stateReady") : warm.state === "warming" ? t("stateWarming") : t("stateOn")}
          </span>
        </div>
        {!on && <>
          <p style={{ margin: 0, fontSize: 15 }}>{t("offWhy")}</p>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
            <li>{t("s1")}</li><li>{t("s2")}</li><li>{t("s3")}</li>
          </ol>
          <div><Button variant="primary" data-testid="tap-turn-on" disabled={busy} onClick={() => void turnOn()}>{busy ? t("turningOn") : t("turnOn")}</Button></div>
          {busy && text && <div className="cap" aria-live="polite">{text}</div>}
        </>}
        {on && <>
          <p style={{ margin: 0, fontSize: 15 }}>{t("onWhy")}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <HowToTapButton variant="primary" />
            <Button variant="ghost" data-testid="tap-turn-off" disabled={busy} onClick={() => void turnOff()}>{t("turnOff")}</Button>
          </div>
        </>}
      </div>}

      {app && a.demo && <div className="demo">{t("demo")}</div>}
      {app && check?.supported && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="cap" style={{ flex: 1, minWidth: 200 }}>{t("resetWhy")}</span>
        <Button size="sm" variant="ghost" data-testid="tap-reset-video" disabled={busy} onClick={() => void resetForVideo()}>{t("reset")}</Button>
      </div>}
      {err && <div className="hint err" role="alert" data-testid="tap-error">{err} {/Stripe/.test(err) && <Link href="/settings/payments">{t("toPayments")}</Link>}</div>}
      <p className="cap" style={{ margin: 0 }}>{t("fee")}</p>
      {steps && <HowToTapSteps onClose={() => setSteps(false)} />}
    </div>
  );
}
