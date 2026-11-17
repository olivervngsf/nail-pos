"use client";
// Payout sheet (PRD "Tech payout sheet", issue #15): per person for a day / week / any range — services done, pay (commission
// on full price or hourly from clock-ins), card + cash tips (salon keeps none), card fee on tips only where the state allows,
// total, and how it's paid: check vs cash (owner sets % per person). Print the sheet or one slip per person; export CSV for payroll.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, LeftMenu, OfflineBanner, Segmented, SyncPill, Toast, TopBar } from "@/components/kit";
import { rpc } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { useDesk } from "@/lib/desk";
import { addDays, demoPayout, isoDay, nums, payoutCsv, weekStart, type PayoutRow } from "@/lib/closeday";
import { worked } from "@/lib/print/earnings";
import { useEarningsPrint } from "@/app/earnings/Earnings";

const $ = formatCents;
type Range = "today" | "week" | "last" | "custom";

export default function Payouts() {
  const t = useTranslations("payouts");
  const { desk, err } = useDesk();
  const today = isoDay();
  const [range, setRange] = useState<Range>("week");
  const [from, setFrom] = useState(weekStart(today));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [printing, setPrinting] = useState(false);
  const printSlips = useEarningsPrint();
  const [toast, setToast] = useState("");
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 3500); };

  const pick = (r: Range) => {
    setRange(r);
    if (r === "today") { setFrom(today); setTo(today); }
    if (r === "week") { setFrom(weekStart(today)); setTo(today); }
    if (r === "last") { const s = addDays(weekStart(today), -7); setFrom(s); setTo(addDays(s, 6)); }
  };

  const load = useCallback(async () => {
    if (!desk) return;
    setLoadErr("");
    if (desk.mode === "demo") { setRows(demoPayout()); return; }
    try { setRows((await rpc<PayoutRow[]>("payout_sheet", { p_salon: desk.salonId, p_from: from, p_to: to })).map(nums)); }
    catch (e) { setLoadErr(navigator.onLine ? (e as Error).message : t("needNet")); }
  }, [desk, from, to, t]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <main className="pad"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;
  const demo = desk.mode === "demo";
  const admin = demo || desk.me.role === "owner" || desk.me.role === "manager";
  const sum = (k: keyof PayoutRow) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);

  const setPct = async (r: PayoutRow, pct: number) => {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    const total = r.total_cents, check = Math.round(total * pct / 100);
    setRows((rs) => rs!.map((x) => x.membership_id === r.membership_id ? { ...x, check_pct: pct, check_cents: check, cash_cents: total - check } : x));
    if (demo) return;
    try { await rpc("set_check_pct", { p_membership: r.membership_id, p_pct: pct }); } catch (e) { say((e as Error).message); void load(); }
  };
  const csv = () => {
    const blob = new Blob([payoutCsv(rows ?? [], from, to)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `payroll-${from}-to-${to}.csv`; a.click();
  };
  const period = from === to ? from : `${from} → ${to}`;
  // One paper per person (Bluetooth NETUM: each slip its own job + cut; computer: one page each).
  const printPeople = async (people: PayoutRow[]) => {
    if (!people.length) return say(t("noneToPrint"));
    setPrinting(true);
    try {
      const n = await printSlips(people, desk.salonName, period, (i) => people.length > 1 && setToast(t("printing", { n: i + 1, total: people.length })));
      say(t("printedN", { count: n }));
    } catch (e) { say(t("printFail", { msg: (e as Error).message })); }
    setPrinting(false);
  };
  const payLabel = (r: PayoutRow) => r.pay_type === "commission" ? t("commission", { pct: r.commission_pct ?? 0 })
    : r.pay_type === "hourly" ? t("hourly", { hours: (r.minutes / 60).toFixed(1) }) : r.pay_type === "booth_rent" ? t("booth") : "—";

  return (
    <div className="app cd-app">
      <LeftMenu active="Close day" salonInitials={desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={desk.me.display_name[0]} />
      <div className="col">
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Link className="btn ghost sm" href="/close-day">‹ {t("back")}</Link>{t("title")}</span>}><SyncPill /></TopBar>
        <OfflineBanner />
        {demo && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        {!admin ? <main style={{ padding: "20px 24px" }}><p className="hint err">{t("ownerOnly")}</p></main> : (
          <main style={{ flex: 1, overflow: "auto", padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Segmented label={t("range")} value={range} onChange={pick}
                options={[{ value: "today", label: t("today") }, { value: "week", label: t("thisWeek") }, { value: "last", label: t("lastWeek") }, { value: "custom", label: t("custom") }]} />
              {range === "custom" && <>
                <input className="inp" type="date" aria-label={t("from")} value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ height: 36 }} />
                <input className="inp" type="date" aria-label={t("to")} value={to} min={from} onChange={(e) => setTo(e.target.value)} style={{ height: 36 }} />
              </>}
              <span className="cap">{from === to ? from : `${from} → ${to}`}</span>
              <span style={{ flex: 1 }} />
              <Button onClick={() => window.print()} disabled={!rows?.length}>{t("printSheet")}</Button>
              <Button data-testid="po-slips" onClick={() => void printPeople((rows ?? []).filter(worked))} disabled={!rows?.length || printing}>{t("printSlips")}</Button>
              <Button variant="primary" data-testid="po-csv" onClick={csv} disabled={!rows?.length}>{t("exportCsv")}</Button>
            </div>
            {loadErr && <p className="hint err">{loadErr} <Button size="sm" onClick={() => void load()}>{t("retry")}</Button></p>}
            <section className="card" style={{ padding: "8px 18px", overflowX: "auto" }}>
              <table className="cd-table" data-testid="po-table">
                <thead><tr><th>{t("person")}</th><th>{t("services")}</th><th>{t("pay")}</th><th>{t("cardTips")}</th><th>{t("cashTips")}</th><th>{t("feeOnTips")}</th>
                  <th>{t("total")}</th><th>{t("checkPct")}</th><th>{t("byCheck")}</th><th>{t("inCash")}</th><th /></tr></thead>
                <tbody>
                  {rows === null ? <tr><td colSpan={11} className="cap">{t("loading")}</td></tr> : rows.length === 0 ? <tr><td colSpan={11} className="cap">{t("empty")}</td></tr> : rows.map((r) => (
                    <tr key={r.membership_id} data-testid={`po-${r.name}`}>
                      <td><b>{r.name}</b><span className="cap" style={{ display: "block" }}>{payLabel(r)} · {t("tickets", { count: r.tickets })}</span></td>
                      <td>{$(r.services_cents)}</td><td>{$(r.pay_cents)}</td><td>{$(r.tips_card_cents)}</td><td>{$(r.tips_cash_cents)}</td><td>{$(r.tip_fee_cents)}</td>
                      <td><b>{$(r.total_cents)}</b></td>
                      <td><input inputMode="numeric" aria-label={t("checkPctFor", { name: r.name })} defaultValue={r.check_pct} key={`${r.membership_id}-${r.check_pct}`}
                        onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== r.check_pct) void setPct(r, v); }} />%</td>
                      <td>{$(r.check_cents)}</td><td>{$(r.cash_cents)}</td>
                      <td><Button size="sm" data-testid={`po-print-${r.name}`} disabled={printing} onClick={() => void printPeople([r])}>{t("printOne")}</Button></td>
                    </tr>
                  ))}
                </tbody>
                {!!rows?.length && <tfoot><tr style={{ fontWeight: 600 }}><td>{t("allStaff")}</td><td>{$(sum("services_cents"))}</td><td>{$(sum("pay_cents"))}</td><td>{$(sum("tips_card_cents"))}</td>
                  <td>{$(sum("tips_cash_cents"))}</td><td>{$(sum("tip_fee_cents"))}</td><td data-testid="po-total">{$(sum("total_cents"))}</td><td /><td>{$(sum("check_cents"))}</td><td>{$(sum("cash_cents"))}</td><td /></tr></tfoot>}
              </table>
            </section>
            <div className="cap">{t("note")}</div>
          </main>
        )}
      </div>

      {rows && (
        <div className="receipt-print" aria-hidden>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16 }}>{desk.salonName}</div>
          <div style={{ textAlign: "center" }}>{t("title")} · {period}</div>
          <hr />
          {rows.map((r) => (
            <div key={r.membership_id}>
              <b>{r.name}</b>
              <div className="rl"><span>{t("services")} ({r.tickets})</span><span>{$(r.services_cents)}</span></div>
              <div className="rl"><span>{payLabel(r)}</span><span>{$(r.pay_cents)}</span></div>
              <div className="rl"><span>{t("cardTips")}</span><span>{$(r.tips_card_cents)}</span></div>
              <div className="rl"><span>{t("cashTips")}</span><span>{$(r.tips_cash_cents)}</span></div>
              {r.tip_fee_cents > 0 && <div className="rl"><span>{t("feeOnTips")}</span><span>−{$(r.tip_fee_cents)}</span></div>}
              <div className="rl" style={{ fontWeight: 700 }}><span>{t("total")}</span><span>{$(r.total_cents)}</span></div>
              <div className="rl"><span>{t("byCheck")} ({r.check_pct}%)</span><span>{$(r.check_cents)}</span></div>
              <div className="rl"><span>{t("inCash")}</span><span>{$(r.cash_cents)}</span></div>
              <hr />
            </div>
          ))}
        </div>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
