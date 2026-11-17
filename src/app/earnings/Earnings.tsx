"use client";
// Print my earnings by PIN (PRD V1 #4, Main Screens · Profile "My earnings"): on the salon device a tech taps their name,
// types their PIN and sees only their own earnings for today or this week, then prints the slip. Nothing stays on screen after.
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar, Button, LeftMenu, ListGroup, PinKeypad, Segmented, SyncPill, TopBar } from "@/components/kit";
import { pinMessage, rpc, type PinResult } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { useDesk } from "@/lib/desk";
import { demoPayout, isoDay, nums, weekStart, type PayoutRow } from "@/lib/closeday";

const $ = formatCents;

export function EarningsSlip({ r, salon, period }: { r: PayoutRow; salon: string; period: string }) {
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
      <div className="receipt-print" aria-hidden>
        <div style={{ textAlign: "center", fontWeight: 600, fontSize: 16 }}>{salon}</div>
        <div style={{ textAlign: "center" }}>{t("slipFor", { name: r.name })} · {period}</div>
        <hr />
        <div className="rl"><span>{t("services")} ({r.tickets})</span><span>{$(r.services_cents)}</span></div>
        <div className="rl"><span>{t("pay")}</span><span>{$(r.pay_cents)}</span></div>
        <div className="rl"><span>{t("cardTips")}</span><span>{$(r.tips_card_cents)}</span></div>
        <div className="rl"><span>{t("cashTips")}</span><span>{$(r.tips_cash_cents)}</span></div>
        {r.tip_fee_cents > 0 && <div className="rl"><span>{t("feeOnTips")}</span><span>−{$(r.tip_fee_cents)}</span></div>}
        <hr />
        <div className="rl" style={{ fontWeight: 700 }}><span>{t("total")}</span><span>{$(r.total_cents)}</span></div>
        <div className="rl"><span>{t("byCheck")}</span><span>{$(r.check_cents)}</span></div>
        <div className="rl"><span>{t("inCash")}</span><span>{$(r.cash_cents)}</span></div>
      </div>
    </>
  );
}

export default function Earnings() {
  const t = useTranslations("payouts");
  const { desk, err } = useDesk();
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [period, setPeriod] = useState<"today" | "week">("today");
  const [pinErr, setPinErr] = useState("");
  const [row, setRow] = useState<PayoutRow | null>(null);

  if (err) return <main className="pad"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;
  const demo = desk.mode === "demo";
  const today = isoDay(), from = period === "today" ? today : weekStart(today);
  const periodLabel = from === today ? today : `${from} → ${today}`;
  const reset = () => { setWho(null); setRow(null); setPinErr(""); };

  const submit = async (pin: string) => {
    if (!who) return;
    setPinErr("");
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
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Link className="btn ghost sm" href="/today">‹ {t("back")}</Link>{t("myEarnings")}</span>}><SyncPill /></TopBar>
        {demo && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        <main style={{ padding: 24, maxWidth: 520, width: "100%", alignSelf: "center", display: "flex", flexDirection: "column", gap: 14 }}>
          <Segmented label={t("range")} value={period} onChange={(v) => { setPeriod(v); setRow(null); }} options={[{ value: "today", label: t("today") }, { value: "week", label: t("thisWeek") }]} />
          {!who ? <>
            <div className="h2">{t("tapName")}</div>
            <ListGroup>{desk.staff.map((s) => <button key={s.id} type="button" className="opt" data-testid={`earn-${s.name}`} onClick={() => setWho({ id: s.id, name: s.name })}><Avatar name={s.name} />{s.name}</button>)}</ListGroup>
          </> : !row ? <>
            <div className="h2">{t("pinFor", { name: who.name })}</div>
            <PinKeypad error={pinErr} onDone={(p) => void submit(p)} />
            <Button variant="ghost" onClick={reset}>{t("notMe")}</Button>
          </> : <>
            <div className="h2">{t("slipFor", { name: row.name })}</div>
            <div className="cap">{periodLabel}</div>
            <EarningsSlip r={row} salon={desk.salonName} period={periodLabel} />
            <Button variant="primary" block onClick={() => window.print()}>{t("printMine")}</Button>
            <Button block data-testid="earn-done" onClick={reset}>{t("done")}</Button>
          </>}
        </main>
      </div>
    </div>
  );
}
