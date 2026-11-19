"use client";
// Time clock (board 3.1): a salon tablet for staff. Faces → PIN → clock in/out + my pay sheet (every ticket, then totals),
// print or done. Only your own info shows, and it goes back to the faces screen after 30 seconds.
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Segmented, Toast } from "@/components/kit";
import FacesLock, { type Unlocked } from "@/components/FacesLock";
import ClockQr from "@/components/ClockQr";
import { useLang } from "@/components/AppProviders";
import { PrinterSetup, usePrinter } from "@/components/PrinterSetup";
import { EarningsSlip, useEarningsPrint } from "@/app/earnings/Earnings";
import { pinMessage, rpc, SMS_ON, type PinResult } from "@/lib/auth";
import { useDesk } from "@/lib/desk";
import { demoPayout, addDays, isoDay, nums, weekStart, type PayoutRow } from "@/lib/closeday";
import { formatCents } from "@/lib/money";
import { cachedRules, saveRules, type PinRules } from "@/lib/pin";

const IDLE = 30_000;
type Period = "today" | "week" | "two";

export default function ClockPage() {
  const t = useTranslations("clock");
  const f = useFormatter();
  const { desk, err, refresh } = useDesk();
  const { lang } = useLang();
  const printSlips = useEarningsPrint(desk?.salonId, desk?.mode === "demo");
  const [rules, setRules] = useState<PinRules>(cachedRules(null));
  const [who, setWho] = useState<Unlocked | null>(null);
  const [inNow, setInNow] = useState(false);
  const [period, setPeriod] = useState<Period>("today");
  const [row, setRow] = useState<PayoutRow | null>(null);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [left, setLeft] = useState(30);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const printer = usePrinter();

  useEffect(() => {
    if (!desk) return;
    setRules(cachedRules(desk.salonId));
    if (desk.mode === "live") void rpc<PinRules>("pin_rules", { p_salon: desk.salonId }).then((r) => { setRules(r); saveRules(desk.salonId, r); }).catch(() => {});
  }, [desk]);

  const done = useCallback(() => { setWho(null); setRow(null); setMsg(""); clearInterval(timer.current); void refresh(); }, [refresh]);
  const poke = useCallback(() => {
    clearInterval(timer.current);
    const end = Date.now() + IDLE;
    setLeft(30);
    timer.current = setInterval(() => { const s = Math.ceil((end - Date.now()) / 1000); if (s <= 0) done(); else setLeft(s); }, 1000);
  }, [done]);
  useEffect(() => () => clearInterval(timer.current), []);

  const today = isoDay();
  const from = period === "today" ? today : period === "week" ? weekStart(today) : addDays(today, -13);
  const periodLabel = from === today ? t("today") : `${from} → ${today}`;

  const load = useCallback(async (u: Unlocked, p: Period) => {
    if (!desk) return;
    const fr = p === "today" ? today : p === "week" ? weekStart(today) : addDays(today, -13);
    if (desk.mode === "demo") { const r = demoPayout().find((x) => x.name === u.name) ?? demoPayout()[0]; setRow({ ...r, name: u.name }); return; }
    try {
      const r = await rpc<PinResult & { earnings?: PayoutRow }>("pin_earnings", { p_device: desk.device?.id, p_membership: u.id, p_pin: u.pin, p_from: fr, p_to: today });
      if (!r.ok) return setMsg(pinMessage(r));
      setRow(r.earnings ? nums(r.earnings) : null);
    } catch (e) { setMsg((e as Error).message); }
  }, [desk, today]);

  if (err) return <main className="pad"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;

  if (!who) {
    return (
      <>
        <FacesLock salonName={desk.salonName} title={t("title")} rules={rules} deviceId={desk.device?.id}
          faces={desk.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, clockedIn: s.clockedIn, hasPin: desk.mode === "demo" || !!s.pinLen, pinLen: s.pinLen }))}
          onUnlock={(u) => {
            setWho(u); setInNow(!!desk.staff.find((s) => s.id === u.id)?.clockedIn); setPeriod("today"); setRow(null); setMsg(""); poke(); void load(u, "today");
          }} />
        <ClockQr salonId={desk.salonId} demo={desk.mode === "demo"} vi={lang === "vi"} />
        {desk.mode === "demo" && <div className="demo clock-demo">{t("demo")}</div>}
        {toast && <Toast>{toast}</Toast>}
      </>
    );
  }

  const clock = async () => {
    poke();
    const kind = inNow ? "out" : "in";
    const at = f.dateTime(new Date(), { hour: "numeric", minute: "2-digit" });
    if (SMS_ON && desk.mode === "live") {
      const r = await rpc<PinResult>("pin_clock", { p_device: desk.device?.id, p_membership: who.id, p_pin: who.pin, p_kind: kind }).catch((e: Error) => ({ ok: false, reason: undefined, msg: e.message }) as PinResult);
      if (!r.ok) return setMsg(pinMessage(r));
    }
    setInNow(!inNow);
    setToast(kind === "in" ? t("clockedIn", { name: who.name, time: at }) : t("clockedOut", { name: who.name, time: at }));
    setTimeout(() => setToast(""), 3500);
  };

  return (
    <div className="clock" onPointerDown={poke} data-testid="clock-panel">
      <div className="clock-h">
        <span className="av lg" aria-hidden>{who.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="h1" style={{ fontSize: 26 }}>{t("hi", { name: who.name })}</h1>
          <div className="cap">{t("onlyYou", { s: left })}</div>
        </div>
        <Button data-testid="clock-done" onClick={done}>{t("done")}</Button>
      </div>
      <div className="clock-body">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minWidth: 0 }}>
          <button type="button" className={`clock-big${inNow ? "" : " go"}`} data-testid="clock-toggle" onClick={() => void clock()}>
            {inNow ? t("clockOut") : t("clockIn")}<span className="cap">{inNow ? t("inNow") : t("outNow")}</span>
          </button>
          <section className="card pad" style={{ gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: 18, flex: 1 }}>{t("paySheet")}</b>
              <Segmented label={t("paySheet")} value={period} onChange={(v) => { setPeriod(v); poke(); void load(who, v); }}
                options={[{ value: "today", label: t("today") }, { value: "week", label: t("week") }, { value: "two", label: t("two") }]} />
            </div>
            {row?.lines && row.lines.length > 0 && (
              <div className="group" data-testid="clock-tickets">
                {row.lines.map((l) => (
                  <div key={`${l.number}-${l.at}`} className="row s">
                    <span className="g">#{l.number} · {f.dateTime(new Date(l.at), { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      <span className="cap">{l.services}{l.tip_card_cents + l.tip_cash_cents > 0 ? ` · ${t("tip")} ${formatCents(l.tip_card_cents + l.tip_cash_cents)}` : ""}</span></span>
                    <b className="num">{formatCents(l.services_cents)}</b>
                  </div>
                ))}
              </div>
            )}
            {row ? <EarningsSlip r={row} /> : <div className="cap">{t("nothing")}</div>}
            <Button variant="primary" block data-testid="clock-print" disabled={!row}
              onClick={() => row && void printSlips([row], desk.salonName, periodLabel).then(printer.refresh).catch((e) => setMsg((e as Error).message))}>{t("print")}</Button>
            <PrinterSetup p={printer} />
            {msg && <p className="hint err">{msg}</p>}
          </section>
        </div>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
