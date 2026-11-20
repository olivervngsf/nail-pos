"use client";
// Settings → Payments: is the salon's Stripe account connected and taking cards? Connect / finish on Stripe from here
// any time after setup. Bank + business details are changed on Stripe's own dashboard (the salon owns the account).
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import { api } from "@/lib/api";
import { usePayLayout } from "@/lib/checkout/payLayout";
import { PAY_LAYOUTS, type PayLayout } from "@/lib/checkout/paypage";
import { useHomeLayout } from "@/lib/checkout/homeLayout";
import { HOME_LAYOUTS, type HomeLayout } from "@/lib/checkout/home";
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
      <HomeLayoutPick a={a} />
      <PayPageLayout a={a} />
      {st?.test && <div className="demo">{t("testNote")}</div>}
    </div>
  );
}

/** Tiny picture of each layout, so the owner sees the difference before tapping Preview. */
function Sketch({ layout }: { layout: PayLayout }) {
  return layout === "receipt" ? (
    <div className="paylay-sketch" aria-hidden>
      <i style={{ height: 14, width: "46%", alignSelf: "center" }} />
      <div className="c"><i style={{ height: 6, width: "70%" }} /></div>
      <div className="c"><div className="r"><i /><i className="k" /><i /></div><div className="r"><i style={{ height: 9 }} /><i style={{ height: 9 }} /></div></div>
      <div className="c"><i style={{ height: 6, width: "55%" }} /></div>
    </div>
  ) : (
    <div className="paylay-sketch" aria-hidden>
      <i style={{ height: 8, width: "50%" }} />
      <div className="c" style={{ flex: 1 }}>
        <i style={{ height: 6, width: "70%" }} />
        <div className="r"><i /><i /><i className="k" /><i /><i /></div>
        <i style={{ height: 6, width: "60%" }} />
        <i style={{ height: 12, width: "38%", alignSelf: "flex-end" }} />
      </div>
    </div>
  );
}

/** Which page clients see when they pay by link / QR. One pick per salon; the owner or a manager changes it. */
function PayPageLayout({ a }: { a: Access }) {
  const t = useTranslations("settings.pay");
  const { layout, save } = usePayLayout(a.salonId, a.demo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pick = async (next: PayLayout) => {
    if (next === layout || busy) return;
    setBusy(true); setMsg(null);
    try { await save(next); setMsg({ ok: true, text: t("layoutSaved") }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <div className="card pad" style={{ gap: 12 }} data-testid="pay-layout">
      <div><b style={{ fontSize: 17 }}>{t("pageTitle")}</b><div className="cap">{t("pageLead")}</div></div>
      <div className="paylay">
        {PAY_LAYOUTS.map((l) => (
          <div key={l} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <button type="button" className={`pick${layout === l ? " on" : ""}`} aria-pressed={layout === l} disabled={busy} data-testid={`pay-layout-${l}`} onClick={() => void pick(l)} style={{ flex: 1 }}>
              <Sketch layout={l} />
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ flex: 1 }}>{t(`layout_${l}`)}</b>{layout === l && <span className="tag jade">{t("inUse")}</span>}</span>
              <span className="cap">{t(`layout_${l}_sub`)}</span>
            </button>
            <a className="btn ghost" href={`/pay/preview-${l}`} target="_blank" rel="noreferrer">{t("preview")}</a>
          </div>
        ))}
      </div>
      {msg && <div className={msg.ok ? "cap" : "hint err"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </div>
  );
}

function HomeSketch({ layout }: { layout: HomeLayout }) {
  return layout === "list" ? (
    <div className="paylay-sketch" aria-hidden>
      <div className="r"><i style={{ height: 16 }} /><i style={{ height: 16 }} /><i style={{ height: 16 }} /></div>
      <div className="c">
        {[0, 1, 2].map((n) => <div key={n} className="r"><i style={{ height: 8, flex: 4 }} /><i style={{ height: 8 }} /><i className="k" style={{ height: 8 }} /></div>)}
      </div>
      <div className="c"><div className="r"><i style={{ height: 8, flex: 4 }} /><i style={{ height: 8 }} /></div></div>
    </div>
  ) : (
    <div className="paylay-sketch" aria-hidden>
      <div className="r"><i style={{ height: 8, flex: "none", width: 34 }} /><i style={{ height: 8, flex: "none", width: 26 }} /><i style={{ height: 8, flex: "none", width: 26 }} /></div>
      {[0, 1].map((n) => (
        <div key={n} className="r" style={{ flex: 1 }}>
          {[0, 1, 2].map((m) => <div key={m} className="c" style={{ flex: 1, justifyContent: "space-between" }}><i style={{ height: 6, width: "70%" }} /><i className={n === 0 ? "k" : ""} style={{ height: 10, width: "50%", alignSelf: "flex-end", background: n === 0 ? "var(--ink)" : undefined }} /></div>)}
        </div>
      ))}
    </div>
  );
}

/** How the Checkout screen lists open tickets. One pick per salon; the owner or a manager changes it. */
function HomeLayoutPick({ a }: { a: Access }) {
  const t = useTranslations("settings.pay");
  const { layout, save } = useHomeLayout(a.salonId, a.demo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pick = async (next: HomeLayout) => {
    if (next === layout || busy) return;
    setBusy(true); setMsg(null);
    try { await save(next); setMsg({ ok: true, text: t("homeSaved") }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <div className="card pad" style={{ gap: 12 }} data-testid="home-layout">
      <div><b style={{ fontSize: 17 }}>{t("homeTitle")}</b><div className="cap">{t("homeLead")}</div></div>
      <div className="paylay">
        {HOME_LAYOUTS.map((l) => (
          <button key={l} type="button" className={`pick${layout === l ? " on" : ""}`} aria-pressed={layout === l} disabled={busy} data-testid={`home-layout-${l}`} onClick={() => void pick(l)}>
            <HomeSketch layout={l} />
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ flex: 1 }}>{t(`home_${l}`)}</b>{layout === l && <span className="tag jade">{t("inUse")}</span>}</span>
            <span className="cap">{t(`home_${l}_sub`)}</span>
          </button>
        ))}
      </div>
      {msg && <div className={msg.ok ? "cap" : "hint err"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
    </div>
  );
}
