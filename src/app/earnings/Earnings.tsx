"use client";
// Print my earnings by PIN (PRD V1 #4, Main Screens · Profile "My earnings"): on the salon device a tech taps their name,
// types their PIN and sees only their own earnings for today or this week, then prints the slip. Nothing stays on screen after.
import { pinLenFor } from "@/lib/pin";
import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Button, LeftMenu, ListGroup, PinKeypad, Segmented, SyncPill, TopBar } from "@/components/kit";
import { pinMessage, rpc, type PinResult } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { useDesk } from "@/lib/desk";
import { demoPayout, demoTipMonth, isoDay, lastMonth, nums, tipSignState, weekStart, type PayoutRow, type TipMonthRow } from "@/lib/closeday";
import { earningsDoc, printEarnings, type EarnText } from "@/lib/print/earnings";
import { usePrintSettings } from "@/lib/print/settings";
import { PrinterSetup, usePrinter } from "@/components/PrinterSetup";

const $ = formatCents;

export function EarningsSlip({ r }: { r: PayoutRow }) {
  const t = useTranslations("payouts");
  return (
    <>
      <div className="group" style={{ padding: "6px 16px" }} data-testid="slip">
        <div className="line" style={{ padding: "8px 0" }}><span>{t("services")} ({r.tickets})</span><span>{$(r.services_cents)}</span></div>
        <div className="line" style={{ padding: "8px 0" }}><span>{r.pay_type === "commission" ? t("commission", { pct: r.commission_pct ?? 0 }) : r.pay_type === "hourly" ? t("hourly", { hours: (r.minutes / 60).toFixed(1) }) : t("pay")}</span><span>{$(r.pay_cents)}</span></div>
        <div className="line" style={{ padding: "8px 0" }}><span>{t("cardTips")}</span><span>{$(r.tips_card_cents)}</span></div>
        <div className="line" style={{ padding: "8px 0" }}><span>{t("cashTips")}</span><span>{$(r.tips_cash_cents)}</span></div>
        {r.tip_fee_cents > 0 && <div className="line" style={{ padding: "8px 0" }}><span>{t("feeOnTips")}</span><span>−{$(r.tip_fee_cents)}</span></div>}
        <div className="sep" />
        <div className="line" style={{ padding: "10px 0", fontWeight: 700, fontSize: 18 }}><span>{t("total")}</span><span data-testid="slip-total">{$(r.total_cents)}</span></div>
        <div className="cap" style={{ paddingBottom: 8 }}>{t("splitLine", { check: $(r.check_cents), cash: $(r.cash_cents) })}</div>
      </div>
    </>
  );
}

/** Slip text in the device's language + a print function for one or many people (each its own paper). */
export function useEarningsPrint(salonId?: string | null, demo = false) {
  const { settings } = usePrintSettings(salonId, demo);
  const t = useTranslations("payouts");
  const f = useFormatter();
  const txt: EarnText = {
    slipFor: (name) => t("slipFor", { name }), services: t("services"), cardTips: t("cardTips"), cashTips: t("cashTips"), feeOnTips: t("feeOnTips"),
    total: t("total"), byCheck: t("byCheck"), inCash: t("inCash"), signature: t("signature"), printed: t("printed"),
    tips: t("tipsAll"), colTicket: t("colTicket"), colTips: t("colTips"), colService: t("colService"),
    pay: (r) => r.pay_type === "commission" ? t("commission", { pct: r.commission_pct ?? 0 }) : r.pay_type === "hourly" ? t("hourly", { hours: (r.minutes / 60).toFixed(1) })
      : r.pay_type === "booth_rent" ? t("booth") : t("pay"),
  };
  return (rows: PayoutRow[], salon: string, period: string, onEach?: (i: number) => void) => {
    const at = f.dateTime(new Date(), { dateStyle: "short", timeStyle: "short" });
    return printEarnings(rows.map((r) => earningsDoc(r, salon, period, txt, at, settings.staff)), onEach);
  };
}

export default function Earnings() {
  const t = useTranslations("payouts");
  const { desk, err } = useDesk();
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "tips">("today");
  const [tips, setTips] = useState<TipMonthRow | null>(null);
  const pinRef = useRef("");
  const [busy, setBusy] = useState(false);
  const [pinErr, setPinErr] = useState("");
  const [row, setRow] = useState<PayoutRow | null>(null);
  const printSlips = useEarningsPrint(desk?.salonId, desk?.mode === "demo");
  const printer = usePrinter();
  const f = useFormatter();

  if (err) return <main className="pad"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;
  const demo = desk.mode === "demo";
  const today = isoDay(), from = period === "today" ? today : weekStart(today);
  const periodLabel = from === today ? today : `${from} → ${today}`;
  const month = lastMonth(today);
  const monthLabel = f.dateTime(new Date(`${month}T12:00:00`), { month: "long", year: "numeric" });
  const reset = () => { setWho(null); setRow(null); setTips(null); setPinErr(""); pinRef.current = ""; };
  // Tips report: same PIN signs (kept in memory only until Done / Not me).
  const tipReport = async (pin: string, sign: boolean) => {
    if (!who) return;
    if (demo) { const d = demoTipMonth().find((x) => x.name === who.name) ?? { ...demoTipMonth()[1], name: who.name };
      setTips(sign ? { ...d, signed_at: new Date().toISOString(), signed_cash_cents: d.cash_cents, signed_card_cents: d.card_cents } : d); return; }
    if (!desk.device) return setPinErr(t("needDevice"));
    setBusy(true);
    try {
      const r = await rpc<PinResult & { report?: TipMonthRow }>("pin_tip_report", { p_device: desk.device.id, p_membership: who.id, p_pin: pin, p_month: month, p_sign: sign });
      if (!r.ok) { setBusy(false); return setPinErr(pinMessage(r)); }
      pinRef.current = pin;
      if (r.report) setTips(nums(r.report));
    } catch (e) { setPinErr((e as Error).message); }
    setBusy(false);
  };

  const submit = async (pin: string) => {
    if (!who) return;
    setPinErr("");
    if (period === "tips") return tipReport(pin, false);
    if (demo) { const r = demoPayout().find((x) => x.name === who.name) ?? demoPayout()[0]; setRow({ ...r, name: who.name }); return; }
    if (!desk.device) return setPinErr(t("needDevice"));
    try {
      const r = await rpc<PinResult & { earnings?: PayoutRow }>("pin_earnings", { p_device: desk.device.id, p_membership: who.id, p_pin: pin, p_from: from, p_to: today });
      if (!r.ok) return setPinErr(pinMessage(r));
      setRow(r.earnings ? nums(r.earnings) : { membership_id: who.id, name: who.name, role: "tech", pay_type: null, commission_pct: null, hourly_cents: null, check_pct: 100,
        tickets: 0, services_cents: 0, minutes: 0, pay_cents: 0, tips_card_cents: 0, tips_cash_cents: 0, tip_fee_cents: 0, total_cents: 0, check_cents: 0, cash_cents: 0 });
    } catch (e) { setPinErr((e as Error).message); }
  };

  return (
    <div className="app cd-app">
      <LeftMenu active="Today" salonInitials={desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} />
      <div className="col">
        <TopBar back={{ href: "/today", label: t("back") }} title={t("myEarnings")}><SyncPill /></TopBar>
        {demo && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        <main style={{ padding: 24, maxWidth: 520, width: "100%", alignSelf: "center", display: "flex", flexDirection: "column", gap: 14 }}>
          <Segmented label={t("range")} value={period} onChange={(v) => { setPeriod(v); setRow(null); setTips(null); }} options={[{ value: "today", label: t("today") }, { value: "week", label: t("thisWeek") }, { value: "tips", label: t("tipsMonth") }]} />
          {!who ? <>
            <div className="h2">{t("tapName")}</div>
            <ListGroup>{desk.staff.map((s) => <button key={s.id} type="button" className="opt" data-testid={`earn-${s.name}`} onClick={() => setWho({ id: s.id, name: s.name })}><Avatar name={s.name} />{s.name}</button>)}</ListGroup>
          </> : tips ? <>
            <div className="h2">{t("tipReportFor", { name: who.name, month: monthLabel })}</div>
            <div className="group" style={{ padding: "6px 16px" }} data-testid="tip-month">
              <div className="line" style={{ padding: "8px 0" }}><span>{t("cardTips")}</span><span>{$(tips.card_cents)}</span></div>
              <div className="line" style={{ padding: "10px 0", fontWeight: 700, fontSize: 18 }}><span>{t("cashTips")}</span><span data-testid="tip-cash">{$(tips.cash_cents)}</span></div>
            </div>
            {tipSignState(tips) === "signed" ? <div className="note" data-testid="tip-signed">✓ {t("signedOn", { when: f.dateTime(new Date(tips.signed_at!), { dateStyle: "medium", timeStyle: "short" }) })}</div> : <>
              {tipSignState(tips) === "changed" && <div className="note" style={{ background: "#fdf1e6", color: "#b5470a" }}>{t("changedSince", { cash: $(tips.signed_cash_cents ?? 0) })}</div>}
              <div className="cap">{t("tipSignNote")}</div>
              <Button variant="primary" block data-testid="tip-sign" disabled={busy} onClick={() => void tipReport(pinRef.current, true)}>{t("signTips", { cash: $(tips.cash_cents) })}</Button>
            </>}
            {pinErr && <p className="hint err">{pinErr}</p>}
            <Button block data-testid="earn-done" onClick={reset}>{t("done")}</Button>
          </> : !row ? <>
            <div className="h2">{t("pinFor", { name: who.name })}</div>
            <PinKeypad length={pinLenFor(who.id)} error={pinErr} onDone={(p) => void submit(p)} />
            <Button variant="ghost" onClick={reset}>{t("notMe")}</Button>
          </> : <>
            <div className="h2">{t("slipFor", { name: row.name })}</div>
            <div className="cap">{periodLabel}</div>
            <EarningsSlip r={row} />
            <Button variant="primary" block data-testid="earn-print" onClick={() => void printSlips([row], desk.salonName, periodLabel).then(printer.refresh).catch((e) => setPinErr(t("printFail", { msg: (e as Error).message })))}>{t("printMine")}</Button>
            <PrinterSetup p={printer} />
            {pinErr && <p className="hint err">{pinErr}</p>}
            <Button block data-testid="earn-done" onClick={reset}>{t("done")}</Button>
          </>}
        </main>
      </div>
    </div>
  );
}
