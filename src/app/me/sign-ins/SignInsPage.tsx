"use client";
// Profile → My sign-ins (board "Settings, Activity log + Timesheet" → SignIns.dc.html): every phone, computer and app
// where YOUR login is signed in, last used, Sign out one / all others, 2-step status, sign-ins in the last 30 days.
// Lost a phone? Sign it out here from any computer. Data: my_sessions / my_signin_history (migration 20270129000001).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLang } from "@/components/AppProviders";
import { Banner, Button } from "@/components/kit";
import { rpc, SMS_ON } from "@/lib/auth";
import { myFactors } from "@/lib/mfa";
import { isAdminRole, useMe } from "@/lib/me";
import { daysIdle, demoHistory, demoSessions, describeAgent, isStale, lastSeen, type HistoryRow, type Session } from "@/lib/signins";
import MeSub from "../MeSub";

const ICON = {
  computer: "M4 5h16v11H4zM2 19h20",
  phone: "M7 2h10v20H7zM11 18h2",
  tablet: "M5 3h14v18H5zM11 18h2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5",
};
const Ico = ({ d }: { d: string }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

export default function SignInsPage() {
  const t = useTranslations("signins");
  const { lang } = useLang();
  const vi = lang === "vi";
  const { me, isDevice } = useMe();
  const [rows, setRows] = useState<Session[] | null>(null);
  const [hist, setHist] = useState<HistoryRow[]>([]);
  const [twoStep, setTwoStep] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const now = Date.now();

  const load = useCallback(() => {
    if (!SMS_ON) { setRows((r) => r ?? demoSessions()); setHist((h) => (h.length ? h : demoHistory())); setTwoStep(true); return; }
    setErr("");
    rpc<Session[]>("my_sessions").then((r) => setRows(r ?? [])).catch((e: Error) => setErr(e.message));
    rpc<HistoryRow[]>("my_signin_history").then((h) => setHist(h ?? [])).catch(() => {});
    myFactors().then((f) => setTwoStep(f.length > 0)).catch(() => setTwoStep(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const signOut = async (s: Session) => {
    setBusy(s.id); setErr(""); setMsg("");
    try {
      if (SMS_ON) await rpc("my_session_end", { p_id: s.id });
      setRows((r) => (r ?? []).filter((x) => x.id !== s.id));
      setHist((h) => [{ at: new Date().toISOString(), what: "signed_out", agent: s.agent }, ...h]);
      setMsg(t("outOne", { name: describeAgent(s.agent).name }));
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  const signOutOthers = async () => {
    setBusy("all"); setErr(""); setMsg(""); setConfirmAll(false);
    try {
      const n = SMS_ON ? await rpc<number>("my_sessions_end_others") : (rows ?? []).filter((x) => !x.this).length;
      setRows((r) => (r ?? []).filter((x) => x.this));
      setHist((h) => [{ at: new Date().toISOString(), what: "signed_out_others", agent: `${n} devices` }, ...h]);
      setMsg(t("outAll", { n }));
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };

  const others = (rows ?? []).filter((s) => !s.this).length;
  const admin = !!me && isAdminRole(me.role);

  return (
    <MeSub title={t("title")}>
      <div className="si-page" data-testid="signins">
        <p className="me-hint" style={{ marginTop: 0 }}>{t.rich("intro", { b: (c) => <b style={{ color: "var(--ink)" }}>{c}</b> })}</p>
        {isDevice && <Banner tone="info" title={t("deviceTitle")}>{t("deviceBody")}</Banner>}
        {err && <Banner tone="bad" title={t("errTitle")} onClose={() => setErr("")}>{err}</Banner>}
        {msg && <Banner tone="ok" title={msg} onClose={() => setMsg("")}>{t("outNote")}</Banner>}

        <section className="me-card si-list" aria-busy={!rows}>
          {(rows ?? []).map((s) => {
            const d = describeAgent(s.agent);
            const stale = isStale(s, now);
            return (
              <div key={s.id} className="si-row" data-testid={s.this ? "signin-this" : "signin-row"}>
                <span className="si-ico" aria-hidden><Ico d={ICON[d.kind]} /></span>
                <span className="si-g">
                  <span className="si-n"><b>{d.name}</b>
                    {s.this && <span className="act-tag ok">{t("thisDevice")}</span>}
                    {stale && <span className="act-tag warn">{t("notUsed", { n: daysIdle(s, now) })}</span>}
                  </span>
                  <span className="cap">{[s.two_step ? t("withTwoStep") : t("withCode"), s.ip ? t("network", { ip: s.ip }) : ""].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="cap num si-when">{lastSeen(s.last_active, now, vi)}</span>
                {s.this
                  ? <span className="si-btn" aria-hidden />
                  : <Button size="sm" className="si-btn" disabled={busy === s.id} onClick={() => void signOut(s)} data-testid="signin-out">{busy === s.id ? t("working") : t("signOut")}</Button>}
              </div>
            );
          })}
          {rows && rows.length === 0 && <p className="cap" style={{ padding: 16, margin: 0 }}>{t("none")}</p>}
        </section>

        {others > 0 && (confirmAll
          ? <div className="si-confirm">
              <span>{t("allSure", { n: others })}</span>
              <Button size="sm" onClick={() => setConfirmAll(false)}>{t("cancel")}</Button>
              <Button size="sm" variant="primary" disabled={busy === "all"} onClick={() => void signOutOthers()} data-testid="signin-out-all-yes">{t("allYes")}</Button>
            </div>
          : <Button className="si-all" onClick={() => setConfirmAll(true)} data-testid="signin-out-all">{t("outAllBtn", { n: others })}</Button>)}

        {admin && !isDevice && twoStep !== null && (
          <section className="me-card si-two">
            <span className={`si-ico${twoStep ? " ok" : " warn"}`} aria-hidden><Ico d={ICON.shield} /></span>
            <span className="si-g"><b>{twoStep ? t("twoOn") : t("twoOff")}</b><span className="cap">{twoStep ? t("twoOnSub") : t("twoOffSub")}</span></span>
            <Link href="/me/sign-in" className="btn sm" data-testid="signin-2step">{twoStep ? t("change") : t("turnOn")}</Link>
          </section>
        )}

        <div>
          <div className="me-h">{t("recent")}</div>
          <section className="me-card" data-testid="signin-history">
            {hist.map((h, i) => (
              <div key={`${h.at}-${i}`} className="si-h">
                <span className="cap num si-ht">{new Date(h.at).toLocaleString(vi ? "vi-VN" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className="si-g">{h.what === "signed_out_others" ? t("othersLine", { what: h.agent ?? "" }) : describeAgent(h.agent).name}</span>
                <span className={`act-tag${h.what === "signed_in" ? " ok" : ""}`}>{t(`what.${h.what}`)}</span>
              </div>
            ))}
            {hist.length === 0 && <p className="cap" style={{ padding: 16, margin: 0 }}>{t("noHistory")}</p>}
          </section>
        </div>
        <p className="me-hint">{t("footer")}</p>
      </div>
    </MeSub>
  );
}
