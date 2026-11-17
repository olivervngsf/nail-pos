"use client";
// Walk-in check-in iPad at the door. Booking board Kiosk K1–K4: welcome (language, wait now), phone keypad,
// "same as last time?" + service tiles + optional tech, done (#n in line, ticket B·n, resets in 10 s).
// Today's booking for that phone → marked arrived. Otherwise a walk-in joins the line as a kiosk booking.
// Saved on this device first (works offline), synced to the calendar through the outbox.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button, Segmented } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { e164, rpc } from "@/lib/auth";
import { useDesk, type Desk } from "@/lib/desk";
import { fmtPhone } from "@/lib/onboarding/data";
import { formatCents } from "@/lib/money";
import { pullAppts, putAppt, useAppts, type Appt } from "@/lib/booking/appts";
import { at, dayKey, fmtMin, minutesOf } from "@/lib/booking/grid";
import { isLive } from "@/lib/checkout/store";
import { isWaiting, nextWalkCode } from "@/lib/booking/turns";

type Step = "welcome" | "phone" | "services" | "done";
type Last = { first: string; last: { id: string | null; name: string; staffId: string | null }[] | null } | null;
const RESET_S = 10;

export default function KioskPage() {
  const { desk, err } = useDesk();
  if (err) return <main className="ki"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="ki" aria-busy="true" />;
  return <Kiosk desk={desk} />;
}

function Kiosk({ desk }: { desk: Desk }) {
  const t = useTranslations("kiosk");
  const { lang, setLang } = useLang();
  const today = dayKey(new Date());
  const from = useMemo(() => at(today, 0), [today]), to = useMemo(() => at(today, 24 * 60), [today]);
  const appts = useAppts(desk.salonId, from, to);
  useEffect(() => {
    const pull = () => void pullAppts(desk.salonId, from, to).catch(() => {});
    pull();
    const i = setInterval(pull, 60_000);
    return () => clearInterval(i);
  }, [desk.salonId, from, to]);
  const line = appts.filter(isWaiting);
  const ahead = line.length;

  const [step, setStep] = useState<Step>("welcome");
  const [digits, setDigits] = useState("");
  const [who, setWho] = useState<Last>(null);
  const [name, setName] = useState("");
  const [pick, setPick] = useState<string | "same" | "unsure" | null>(null);
  const [staff, setStaff] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: "appt"; name: string; time: string } | { kind: "line"; n: number; ticket: string; min: number } | null>(null);
  const [left, setLeft] = useState(RESET_S);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const reset = useCallback(() => {
    clearInterval(timer.current);
    setStep("welcome"); setDigits(""); setWho(null); setName(""); setPick(null); setStaff(null); setDone(null);
  }, []);
  useEffect(() => {
    if (step !== "done") return;
    setLeft(RESET_S);
    timer.current = setInterval(() => setLeft((s) => { if (s <= 1) { reset(); return RESET_S; } return s - 1; }), 1000);
    return () => clearInterval(timer.current);
  }, [step, reset]);
  // Idle on a half-filled screen → back to welcome after 60 s.
  useEffect(() => {
    if (step === "welcome" || step === "done") return;
    const i = setTimeout(reset, 60_000);
    return () => clearTimeout(i);
  }, [step, digits, pick, staff, name, reset]);

  const phone = e164(digits);
  const techs = desk.staff.filter((s) => s.role === "tech" && s.clockedIn);
  const tiles = desk.services.slice(0, 7);
  const svcOf = (id: string) => desk.services.find((s) => s.id === id);

  const lookup = async () => {
    // Booked for today? → arrived.
    const mine = appts.find((a) => a.client?.phone === phone && (a.status === "booked" || a.status === "confirmed") && a.source !== "kiosk");
    if (mine) {
      putAppt({ ...mine, status: "arrived" });
      setDone({ kind: "appt", name: mine.client?.name.split(" ")[0] ?? "", time: fmtMin(minutesOf(mine.start)) });
      setStep("done");
      return;
    }
    let w: Last = null;
    if (isLive()) w = await rpc<Last>("kiosk_hello", { p_salon: desk.salonId, p_phone: phone }).catch(() => null);
    else if (phone === "+14085550142") w = { first: "Lan", last: [{ id: desk.services[1]?.id ?? null, name: desk.services[1]?.name ?? "", staffId: desk.staff[0]?.id ?? null }] };
    setWho(w);
    if (w?.last?.length) { setPick("same"); setStaff(w.last[0].staffId); }
    setStep("services");
  };

  const checkIn = () => {
    const chosen = pick === "same" ? (who?.last ?? []).map((l) => (l.id ? svcOf(l.id) : undefined)).filter(Boolean) : pick && pick !== "unsure" ? [svcOf(pick)].filter(Boolean) : [];
    const minutes = chosen.reduce((a, s) => a + (s?.minutes ?? 0), 0) || 45;
    const code = nextWalkCode(appts, today);
    const now = new Date();
    const a: Appt = {
      id: crypto.randomUUID(), salonId: desk.salonId, start: now.toISOString(), end: new Date(now.getTime() + minutes * 60_000).toISOString(),
      staffId: staff, client: { name: who?.first && !name ? who.first : name.trim(), phone },
      services: chosen.map((s) => ({ serviceId: s!.id, name: s!.name, minutes: s!.minutes, cents: s!.cents })),
      status: "booked", source: "kiosk", note: code, arrivedAt: now.toISOString(), updatedAt: "",
    };
    putAppt(a);
    setDone({ kind: "line", n: ahead + 1, ticket: code, min: Math.max(5, ahead * 15) });
    setStep("done");
  };

  return (
    <div className="ki">
      <div className="ki-top">
        <Segmented label="Language" value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }]} />
        <Link href="/today" className="cap ki-exit">{t("exit")}</Link>
      </div>
      {desk.mode === "live" && !desk.device && <p className="demo ki-note">{t("needDevice")}</p>}

      {step === "welcome" && (
        <div className="ki-card in">
          <div className="bw-logo">{desk.salonName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</div>
          <h1 className="h1">{t("welcome", { salon: desk.salonName })}</h1>
          <p className="cap" data-testid="ki-wait">{ahead ? t("wait", { min: ahead * 15, n: ahead }) : t("noWait")}</p>
          <Button variant="primary" className="ki-big" data-testid="ki-start" onClick={() => setStep("phone")}>{t("checkIn")}</Button>
          <p className="cap">{t("haveAppt")}</p>
        </div>
      )}

      {step === "phone" && (
        <div className="ki-card in">
          <h1 className="h2">{t("yourPhone")}</h1>
          <div className="ki-phone num" aria-live="polite">{digits ? fmtPhone(digits) : "(___) ___-____"}</div>
          <div className="keys ki-keys">
            {"123456789".split("").map((k) => <button key={k} type="button" className="key" onClick={() => setDigits((d) => (d.length < 10 ? d + k : d))}>{k}</button>)}
            <button type="button" className="key" aria-label="Delete" onClick={() => setDigits((d) => d.slice(0, -1))}>⌫</button>
            <button type="button" className="key" onClick={() => setDigits((d) => (d.length < 10 ? d + "0" : d))}>0</button>
            <button type="button" className="key ki-ok" aria-label={t("checkIn")} data-testid="ki-phone-ok" disabled={digits.length !== 10} onClick={() => void lookup()}>✓</button>
          </div>
          <p className="cap">{t("textNote")}</p>
          <Button variant="ghost" onClick={reset}>{t("back")}</Button>
        </div>
      )}

      {step === "services" && (
        <div className="ki-card ki-wide in">
          <h1 className="h2">{who?.first ? t("hi", { name: who.first }) : t("whatToday")}</h1>
          {!who?.first && <input className="inp" aria-label={t("yourName")} placeholder={t("yourName")} value={name} onChange={(e) => setName(e.target.value)} data-testid="ki-name" />}
          {who?.last?.length ? (
            <button type="button" className={`ki-tile ki-same${pick === "same" ? " on" : ""}`} onClick={() => setPick("same")}>
              <b>{t("same")}</b><span className="cap">{who.last.map((l) => l.name).join(" + ")}{who.last[0].staffId && ` · ${desk.staff.find((s) => s.id === who.last![0].staffId)?.name ?? ""}`}</span>
            </button>) : null}
          <div className="ki-tiles">
            {tiles.map((s) => <button key={s.id} type="button" className={`ki-tile${pick === s.id ? " on" : ""}`} data-testid="ki-tile" onClick={() => setPick(s.id)}>
              <b>{s.name}</b><span className="cap">{s.priceFrom ? "from " : ""}{formatCents(s.cents)}</span></button>)}
            <button type="button" className={`ki-tile${pick === "unsure" ? " on" : ""}`} onClick={() => setPick("unsure")}><b>{t("notSure")}</b><span className="cap">{t("askDesk")}</span></button>
          </div>
          {techs.length > 0 && <>
            <div className="eyebrow">{t("want")}</div>
            <div className="bw-chips">
              <button type="button" className={`chip${staff === null ? " on" : ""}`} onClick={() => setStaff(null)}>{t("anyone")}</button>
              {techs.map((s) => <button key={s.id} type="button" className={`chip${staff === s.id ? " on" : ""}`} onClick={() => setStaff(s.id)}>{s.name}</button>)}
            </div>
          </>}
          <Button variant="primary" className="ki-big" data-testid="ki-checkin" disabled={!pick || (!who?.first && !name.trim())} onClick={checkIn}>{t("checkIn")}</Button>
          <Button variant="ghost" onClick={() => setStep("phone")}>{t("back")}</Button>
        </div>
      )}

      {step === "done" && done && (
        <div className="ki-card in" data-testid="ki-done">
          <div className="bw-check">✓</div>
          {done.kind === "line" ? <>
            <h1 className="h1">{t("line", { n: done.n, ticket: done.ticket })}</h1>
            <p>{t("lineSub", { min: done.min })}</p>
          </> : <>
            <h1 className="h1">{t("appt", { name: done.name })}</h1>
            <p>{t("apptSub", { time: done.time })}</p>
          </>}
          <p className="cap">{t("reset", { s: left })}</p>
          <Button onClick={reset}>{t("done")}</Button>
        </div>
      )}
    </div>
  );
}
