"use client";
// Owner: loyalty program (Loyalty board L1–L2 + L6 receipt preview). V1 = points or a punch card tied to the phone number.
// Packages, perks and referrals come later (shown as "later", not built).
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Stepper, Switch, Toast } from "@/components/kit";
import SettingsShell from "../SettingsShell";
import { rpc } from "@/lib/auth";
import { useDesk, type Desk } from "@/lib/desk";
import { formatCents } from "@/lib/money";
import { DEMO_RULE, demoRule, saveDemoRule, type LoyaltyRule } from "@/lib/loyalty/loyalty";

type Stats = LoyaltyRule & { members: number; ready: number; redeemed30: number };

export default function LoyaltySettings() {
  const t = useTranslations("loyaltyAdmin");
  // Inside the Settings window (Oliver, Nov 27: Settings never jumps to a full page). The window checks owner/manager.
  return <SettingsShell title={t("title")}>{() => <Loader />}</SettingsShell>;
}

function Loader() {
  const { desk, err } = useDesk();
  if (err) return <p className="hint err">{err}</p>;
  if (!desk) return <div aria-busy="true" />;
  return <Settings desk={desk} />;
}

function Settings({ desk }: { desk: Desk }) {
  const t = useTranslations("loyaltyAdmin");
  const demo = desk.mode === "demo";
  const [rule, setRule] = useState<LoyaltyRule | null>(null);
  const [stats, setStats] = useState<Omit<Stats, keyof LoyaltyRule> | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (demo) { setRule(demoRule()); setStats({ members: 212, ready: 18, redeemed30: 9 }); setSlug("demo"); return; }
    void rpc<Stats>("loyalty_settings_get", { p_salon: desk.salonId }).then((s) => {
      setRule({ on: s.on, kind: s.kind, pointsPerDollar: s.pointsPerDollar, rewardPoints: s.rewardPoints, rewardCents: s.rewardCents });
      setStats({ members: s.members, ready: s.ready, redeemed30: s.redeemed30 });
    }).catch((e) => setMsg((e as Error).message));
    void rpc<{ slug: string } | null>("booking_settings_get", { p_salon: desk.salonId }).then((b) => setSlug(b?.slug ?? null)).catch(() => {});
  }, [demo, desk.salonId]);

  const save = async (r: LoyaltyRule) => {
    setRule(r); setMsg("");
    if (demo) { saveDemoRule(r); setToast(t("saved")); setTimeout(() => setToast(""), 2000); return; }
    try { await rpc("loyalty_settings_save", { p_salon: desk.salonId, p: r }); setToast(t("saved")); setTimeout(() => setToast(""), 2000); }
    catch { setMsg(t("failed")); }
  };
  const $ = (c: number) => formatCents(c).replace(/\.00$/, "");
  const r = rule ?? DEMO_RULE;
  const pts = r.kind === "points";
  const link = typeof window !== "undefined" && slug ? `${window.location.origin}/c/${slug}` : "";
  return (
    <>
        {demo && <div className="demo">{t("demo")}</div>}
        {!rule ? <div aria-busy="true">{msg && <p className="hint err">{msg}</p>}</div> : (
        <div className="ly">
          {msg && <p className="hint err" role="alert">{msg}</p>}
          <section className="card pad ly-sec">
            <div className="ly-row"><div style={{ flex: 1 }}><h2 className="h2">{t("program")}</h2><p className="cap">{t("programSub")}</p></div>
              <Switch label={t("program")} on={r.on} onChange={(v) => void save({ ...r, on: v })} /></div>
            {stats && <div className="stat-grid" style={{ ["--n" as string]: 3 }}>
              <div><b data-testid="ly-members">{stats.members}</b><span className="cap">{t("members")}</span></div>
              <div><b>{stats.ready}</b><span className="cap">{t("readyNow")}</span></div>
              <div><b>{stats.redeemed30}</b><span className="cap">{t("used30")}</span></div>
            </div>}
          </section>

          <div className="ly-two">
            <section className="card pad ly-sec">
              <h2 className="h2">{t("how")}</h2>
              <div className="ly-picks">
                {(["points", "visits"] as const).map((k) => (
                  <button key={k} type="button" className={`ly-pick ${r.kind === k ? "on" : ""}`} aria-pressed={r.kind === k} data-testid={`ly-kind-${k}`}
                    onClick={() => void save({ ...r, kind: k, rewardPoints: k === "visits" ? 10 : 100 })}>
                    <b>{t(`kind_${k}`)}</b><span className="cap">{t(`kind_${k}Sub`)}</span></button>))}
              </div>
              <div className="ly-row"><span style={{ flex: 1 }}>{pts ? t("ruleNeedPts") : t("ruleNeedVisits")}</span>
                <Stepper label={t("ruleNeedPts")} value={r.rewardPoints} step={pts ? 50 : 1} min={pts ? 50 : 2} max={pts ? 1000 : 20}
                  format={(n) => (pts ? t("nPts", { n }) : t("nVisit", { n }))} onChange={(v) => void save({ ...r, rewardPoints: v })} /></div>
              <div className="ly-row"><span style={{ flex: 1 }}>{t("rewardOf")}</span>
                <Stepper label={t("rewardOf")} value={r.rewardCents} step={500} min={500} max={5000} format={$} onChange={(v) => void save({ ...r, rewardCents: v })} /></div>
              <ul className="ly-rules cap">
                {pts && <li>{t("perDollar")}</li>}
                <li>{t("never")}</li>
                <li>{t("serviceOnly")}</li>
                <li>{t("askFirst")}</li>
                <li>{t("salonPays")}</li>
              </ul>
            </section>
            <section className="card pad ly-sec">
              <h2 className="h2">{t("clientsSee")}</h2>
              <div className="bubble" data-testid="ly-preview">{t("preview", { salon: desk.salonName, n: pts ? 52 : 1, unit: pts ? t("ptsWord") : t("visitWord"), total: pts ? r.rewardPoints + 72 : r.rewardPoints, amt: $(r.rewardCents) })}</div>
              <p className="cap">{t("previewSub")}</p>
              {link && <><div className="eyebrow">{t("clientPage")}</div>
                <div className="ly-row"><code className="ly-link" data-testid="ly-link">{link.replace(/^https?:\/\//, "")}</code>
                  <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(link); setToast(t("copied")); setTimeout(() => setToast(""), 2000); }}>{t("copy")}</Button></div>
                <p className="cap">{t("clientPageSub")}</p></>}
              <div className="eyebrow">{t("later")}</div>
              <p className="cap">{t("laterSub")}</p>
            </section>
          </div>
        </div>)}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
