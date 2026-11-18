"use client";
// Owner/manager: Texting & credit (Text Credits board: statement C + quick add A; the menu ring opens here via "Manage credit").
// Service texts are part of the plan and never use credit. Promo texts use prepaid credit (2¢ per text part).
// Every add and every send is a ledger row with the balance after it. Adding credit = test stub (no card charged yet).
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Chip, LeftMenu, OfflineBanner, Switch, SyncPill, Toast, TopBar } from "@/components/kit";
import { useDesk } from "@/lib/desk";
import { formatCents } from "@/lib/money";
import { creditLevel, creditPct, textsLeft, useCredit } from "@/lib/texting/credit";

const ADDS = [1000, 2500, 5000];
const COLOR = { good: "var(--jade)", low: "var(--orange)", empty: "var(--red)" } as const;

export default function TextCredit() {
  const t = useTranslations("credit");
  const { desk } = useDesk();
  const { credit, demo, add, saveSettings } = useCredit(desk?.mode === "live" ? desk.salonId : undefined);
  const [pick, setPick] = useState(2500);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [msg, setMsg] = useState("");
  const owner = demo || desk?.me.role === "owner";
  const initials = (desk?.salonName ?? "PolishOS").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(""), 2200); };

  const doAdd = async () => {
    setBusy(true); setMsg("");
    try { await add(pick); flash(t("added", { money: formatCents(pick) })); }
    catch (e) { setMsg((e as Error).message || t("failed")); }
    finally { setBusy(false); }
  };
  const save = async (p: Partial<{ warnPct: number; autoAddOn: boolean }>) => {
    if (!credit) return;
    try {
      await saveSettings({ warnPct: p.warnPct ?? credit.warnPct, autoAddOn: p.autoAddOn ?? credit.autoAdd.on, autoAddCents: credit.autoAdd.cents, autoAddMaxCents: credit.autoAdd.maxCents });
      flash(t("saved"));
    } catch { setMsg(t("failed")); }
  };

  return (
    <div className="app nm-app">
      <LeftMenu active="Today" salonInitials={initials} me={desk?.me.display_name[0]} />
      <div className="col">
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Link className="btn ghost sm" href="/today">‹ {t("back")}</Link>{t("title")}</span>}>
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        {!credit ? (
          <main style={{ padding: 24 }}>{desk && <p className="hint err">{t("adminOnly")}</p>}</main>
        ) : (() => {
          const level = creditLevel(credit);
          const pct = creditPct(credit);
          return (
            <main className="tc">
              <div className="tc-main">
                {demo && <div className="demo">{t("demo")}</div>}
                {msg && <p className="hint err" role="alert">{msg}</p>}
                <section className="card pad in" style={{ gap: 12 }}>
                  <div className="eyebrow">{t("promoCredit")}</div>
                  <div className="money" data-testid="tc-balance" style={{ color: level === "good" ? undefined : COLOR[level] }}>{formatCents(credit.balanceCents)}</div>
                  <div className="prog-bar"><span style={{ width: `${pct}%`, background: COLOR[level] }} /></div>
                  <div className="cap">{level === "empty" ? t("empty") : level === "low" ? t("low", { n: textsLeft(credit).toLocaleString("en-US") }) : t("left", { n: textsLeft(credit).toLocaleString("en-US"), pct: credit.warnPct })}</div>
                  <div className="sep" />
                  {owner ? (
                    <>
                      <div className="tc-adds">
                        {ADDS.map((c) => <Chip key={c} on={pick === c} onClick={() => setPick(c)} data-testid={`tc-pick-${c}`}>{t("addChip", { money: formatCents(c).replace(/\.00$/, ""), n: (c / 2).toLocaleString("en-US") })}</Chip>)}
                        <div style={{ flex: 1 }} />
                        <Button variant="primary" disabled={busy} onClick={() => void doAdd()} data-testid="tc-add">{t("addBtn", { money: formatCents(pick) })}</Button>
                      </div>
                      <div className="demo">{t("testAdd")}</div>
                    </>
                  ) : <p className="cap">{t("ownerAdds")}</p>}
                </section>

                <section className="card in2" style={{ padding: "14px 18px" }}>
                  <div className="stat-grid" style={{ ["--n" as string]: 3 }}>
                    <div><span className="cap">{t("addedMonth")}</span><b>{formatCents(credit.addedMonthCents)}</b></div>
                    <div><span className="cap">{t("spentMonth")}</span><b>{formatCents(credit.spentMonthCents)}</b></div>
                    <div><span className="cap">{t("includedMonth")}</span><b>{credit.includedMonth.toLocaleString("en-US")}</b></div>
                  </div>
                </section>

                <section className="group in2">
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}><h2 className="h2" style={{ fontSize: 16, margin: 0 }}>{t("activity")}</h2></div>
                  {credit.rows.length === 0 ? <p className="cap" style={{ padding: 16 }}>{t("noRows")}</p> : (
                    <table className="dtable" data-testid="tc-rows">
                      <thead><tr><th>{t("colWhat")}</th><th>{t("colTexts")}</th><th>{t("colCost")}</th><th>{t("colBalance")}</th></tr></thead>
                      <tbody>
                        {credit.rows.map((r) => (
                          <tr key={r.id}>
                            <td>{new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {r.label}{r.who ? <span className="cap"> · {r.who}</span> : r.kind === "spend" ? <span className="cap"> · {t("auto")}</span> : null}</td>
                            <td>{r.texts ? r.texts.toLocaleString("en-US") : "—"}</td>
                            <td style={{ color: r.cents > 0 ? "#1F7A33" : undefined }}>{r.cents > 0 ? "+" : ""}{formatCents(r.cents)}</td>
                            <td>{formatCents(r.balanceCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </div>

              <div className="tc-side">
                <section className="card pad in2">
                  <h2 className="h2" style={{ fontSize: 16, margin: 0 }}>{t("includedTitle")}</h2>
                  <p className="cap" style={{ margin: 0 }}>{t("includedSub")}</p>
                </section>
                <section className="card pad in3">
                  <h2 className="h2" style={{ fontSize: 16, margin: 0 }}>{t("priceTitle")}</h2>
                  <div className="line"><span>{t("pricePart")}</span><b>2¢</b></div>
                  <div className="line"><span>{t("priceEn")}</span><b>{t("letters", { n: 160 })}</b></div>
                  <div className="line"><span>{t("priceVi")}</span><b>{t("letters", { n: 70 })}</b></div>
                  <p className="cap" style={{ margin: 0 }}>{t("priceNote")}</p>
                </section>
                <section className="group in3">
                  <div className="row s"><span className="g">{t("warnAt")}</span>
                    {[10, 20, 30].map((p) => <Chip key={p} on={credit.warnPct === p} onClick={() => void save({ warnPct: p })}>{p}%</Chip>)}
                  </div>
                  <div className="row s"><span className="g">{t("autoAdd")}<span className="cap">{t("autoAddSub", { add: formatCents(credit.autoAdd.cents), max: formatCents(credit.autoAdd.maxCents) })}</span></span>
                    <Switch label={t("autoAdd")} on={credit.autoAdd.on} onChange={(v) => void save({ autoAddOn: v })} />
                  </div>
                </section>
              </div>
            </main>
          );
        })()}
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
