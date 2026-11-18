"use client";
// Settings → Payments: is the salon's Stripe account connected and taking cards? Connect / finish on Stripe from here
// any time after setup. Bank + business details are changed on Stripe's own dashboard (the salon owns the account).
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import { api } from "@/lib/api";
import SettingsShell, { type Access } from "../SettingsShell";

type Status = { on?: boolean; connected?: boolean; chargesEnabled?: boolean; payoutsEnabled?: boolean; detailsSubmitted?: boolean; test?: boolean; state?: string; missing?: string[]; name?: string };

export default function PaymentsPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.payments")}>{(a) => <Payments a={a} />}</SettingsShell>;
}

function Payments({ a }: { a: Access }) {
  const t = useTranslations("settings.pay");
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    setErr("");
    if (a.demo) { setSt({ on: true, connected: true, chargesEnabled: true, payoutsEnabled: true, test: true, name: a.salonName }); return; }
    try { setSt(await api<Status>("/api/stripe/status", { salonId: a.salonId })); } catch (e) { setErr((e as Error).message); }
  }, [a.demo, a.salonId, a.salonName]);
  useEffect(() => { void check(); }, [check]);
  const pending = !!st?.connected && !st.chargesEnabled && !!st.detailsSubmitted && !st.missing?.length && st.state !== "rejected";
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => void check(), 15000);
    return () => clearInterval(id);
  }, [pending, check]);
  const go = async () => {
    setBusy(true); setErr("");
    try { location.href = (await api<{ url: string }>("/api/stripe/connect", { salonId: a.salonId, back: "/settings/payments" })).url; }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const pill = st?.chargesEnabled ? <span className="pill ok"><span className="dot" aria-hidden />{st.test ? t("test") : t("live")}</span>
    : pending ? <span className="pill warn">{t("checking")}</span>
    : st?.connected ? <span className="pill warn">{t("needsInfo")}</span>
    : st ? <span className="pill">{t("notConnected")}</span> : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }} data-testid="settings-payments">
      <p className="cap" style={{ margin: 0 }}>{t("lead")}</p>
      <div className="card pad" style={{ gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <b style={{ flex: 1, fontSize: 17 }}>Stripe</b>
          {!st && !err ? <span className="cap" role="status">{t("loading")}</span> : pill}
        </div>
        {st?.on === false && <div className="banner" role="status">{t("off")}</div>}
        {st?.connected && <div className="group">
          <div className="row"><span className="g">{t("account")}</span><b>{st.name || a.salonName}</b></div>
          <div className="row"><span className="g">{t("cards")}</span><b>{st.chargesEnabled ? t("on") : t("notYet")}</b></div>
          <div className="row"><span className="g">{t("payouts")}</span><b>{st.payoutsEnabled ? t("on") : t("notYet")}</b></div>
        </div>}
        {st?.connected && !st.chargesEnabled && (
          <div className="banner" role="status">{st.state === "rejected" ? t("rejected") : st.missing?.length ? t("missing", { list: st.missing.join(" · ") }) : pending ? t("pendingWhy") : t("finish")}</div>
        )}
        {st && !st.connected && st.on !== false && <div className="cap">{t("need")}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {st?.chargesEnabled
            ? <a className="btn stripe" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">{t("dashboard")}</a>
            : st && st.on !== false && !pending && <Button className="stripe" disabled={busy || a.demo} onClick={() => void go()}>{st.connected ? t("continue") : t("connect")}</Button>}
          <Button onClick={() => void check()}>{t("checkAgain")}</Button>
        </div>
        {err && <div className="hint err" role="alert">{err}</div>}
      </div>
      <div className="group">
        <div className="row"><span className="g">{t("feeReader")}</span><b>2.7% + 5¢</b></div>
        <div className="row"><span className="g">{t("feeLink")}</span><b>2.9% + 30¢</b></div>
        <div className="row"><span className="g">{t("feeUs")}</span><b>{t("feeUsV")}</b></div>
      </div>
      <p className="cap" style={{ margin: 0 }}>{t("bankHow")}</p>
      {st?.test && <div className="demo">{t("testNote")}</div>}
    </div>
  );
}
