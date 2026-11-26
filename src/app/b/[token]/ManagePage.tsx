"use client";
// Client change / cancel link (Booking board C6). No sign-in: the link is the key. One job per view:
// see the visit → pick a new time (same nail tech) or cancel (asks first). After the salon's cut-off: call the salon.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import { Header } from "@/app/[salon]/BookPage";
import { formatCents } from "@/lib/money";
import { fmtPhone } from "@/lib/onboarding/data";
import { bookDays, cancelBooking, loadManage, moveBooking, moveSlots, type Manage } from "@/lib/booking/page";
import { dayKey, fmtMin, fromDayKey } from "@/lib/booking/grid";

type View = "see" | "move" | "cancel" | "moved" | "canceled";

export default function ManagePage({ token }: { token: string }) {
  const t = useTranslations("book");
  const [m, setM] = useState<Manage | null | undefined>(undefined);
  const [view, setView] = useState<View>("see");
  const [day, setDay] = useState("");
  const [slots, setSlots] = useState<number[] | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const reload = useCallback(() => loadManage(token).then(setM).catch(() => setM(null)), [token]);
  useEffect(() => { void reload(); }, [reload]);
  const days = useMemo(() => (m ? bookDays(m.page) : []), [m]);
  useEffect(() => { if (m && !day) setDay(days.includes(m.day) ? m.day : days[0] ?? m.day); }, [m, day, days]);

  useEffect(() => {
    if (view !== "move" || !m || !day) return;
    let off = false;
    setSlots(null);
    moveSlots(token, m.page, day).then((s) => { if (!off) setSlots(s); }).catch(() => { if (!off) { setSlots([]); setMsg(t("offline")); } });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, day, token, m]);

  if (m === undefined) return <div className="bw" aria-busy="true" />;
  if (!m) return <div className="bw"><div className="bw-empty"><div className="h2">{t("mNotFound")}</div><p className="cap">{t("mNotFoundSub")}</p></div></div>;

  const salon = m.page.salon;
  const longest = Math.max(0, ...m.guests.map((g) => g.minutes));
  const dur = (n: number) => (n < 60 ? t("min", { n }) : n % 60 ? t("hrMin", { h: Math.floor(n / 60), m: n % 60 }) : t("hr", { h: n / 60 }));
  const longDay = (d: string) => fromDayKey(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const total = m.guests.reduce((a, g) => a + g.services.reduce((b, s) => b + s.cents, 0), 0);
  const staff = [...new Set(m.guests.map((g) => g.staff).filter(Boolean))] as string[];
  const call = salon.phone && <a href={`tel:${salon.phone}`}>{fmtPhone(salon.phone)}</a>;
  const fail = (reason: string) => setMsg(t(reason === "taken" ? "taken" : reason === "too_late" ? "mTooLate" : "mGone"));

  const doMove = async () => {
    if (slot === null) return;
    setBusy(true); setMsg("");
    try {
      const r = await moveBooking(token, m.page, day, slot);
      if (r.ok) { await reload(); setSlot(null); setView("moved"); }
      else { fail(r.reason); if (r.reason === "taken") { setSlot(null); setSlots(await moveSlots(token, m.page, day).catch(() => [])); } else { await reload(); setView("see"); } }
    } catch { setMsg(t("offline")); }
    setBusy(false);
  };
  const doCancel = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await cancelBooking(token);
      await reload();
      if (r.ok) setView("canceled"); else { fail(r.reason); setView("see"); }
    } catch { setMsg(t("offline")); }
    setBusy(false);
  };

  const ticket = (
    <div className={`bw-ticket${m.status === "canceled" ? " bw-off" : ""}`}>
      <div className="bw-when">
        <span className="eyebrow">{longDay(m.day)}</span>
        <b className="num">{fmtMin(m.start)} – {fmtMin(m.start + longest)}</b>
        <span className="cap">{staff.map((s) => t("with", { name: s })).join(", ")}{staff.length > 0 && " · "}{dur(longest)}</span>
      </div>
      <div className="bw-items">
        {m.guests.map((g, i) => (
          <div key={i} className="bw-items">
            {m.guests.length > 1 && <span className="eyebrow">{g.name || t("guestN", { n: i + 1 })}</span>}
            {g.services.map((s, j) => <div key={j} className="bw-line"><span className="bw-grow">{s.name}<span className="cap">{dur(s.minutes)}</span></span><span className="num">{formatCents(s.cents)}</span></div>)}
          </div>
        ))}
      </div>
      {total > 0 && <div className="bw-sum"><div className="bw-line"><span>{t("total")}</span><b className="num">{formatCents(total)}</b></div></div>}
    </div>
  );

  const dayParts = [["morning", 0, 720], ["afternoon", 720, 1020], ["evening", 1020, 1440]] as const;
  return (
    <div className="bw">
      <Header page={m.page} />
      <div className="bw-done bw-booked in" data-testid="manage" data-view={view}>
        {view === "see" && <>
          <div className="bw-hero">
            <h2 className="h1 bw-center">{m.status === "canceled" ? t("mCanceledTitle") : m.status === "done" ? t("mDoneTitle") : t("mTitle", { name: m.name })}</h2>
            {m.status === "live" && <p className="cap bw-center bw-sent">{m.canChange ? t("mRule", { hours: salon.settings.cancel_hours }) : <>{t("mTooLate")} {call}</>}</p>}
          </div>
          {ticket}
          {msg && <p className="hint err" role="alert">{msg}</p>}
          <div className="bw-acts">
            {m.status === "live" && m.canChange && <>
              <Button variant="primary" data-testid="m-change" onClick={() => { setMsg(""); setView("move"); }}>{t("mChange")}</Button>
              <Button data-testid="m-cancel" onClick={() => { setMsg(""); setView("cancel"); }}>{t("mCancel")}</Button>
            </>}
            {m.status === "live" && !m.canChange && salon.phone && <a className="btn primary" href={`tel:${salon.phone}`}>{t("mCall", { phone: fmtPhone(salon.phone) })}</a>}
            {m.status !== "live" && <a className="btn primary" href={`/${salon.slug}`}>{t("mBookNew")}</a>}
          </div>
        </>}

        {view === "move" && <>
          <div className="bw-hero">
            <h2 className="h1 bw-center">{t("mPick")}</h2>
            <p className="cap bw-center bw-sent">{t("mNow", { when: `${longDay(m.day)} · ${fmtMin(m.start)}` })}{staff.length > 0 && <> · {t("mSameTech", { name: staff.join(", ") })}</>}</p>
          </div>
          <div className="bw-ticket">
            <div className="bw-days">{days.map((d) => {
              const dt = fromDayKey(d);
              return <button key={d} type="button" className={`bw-day${d === day ? " on" : ""}`} onClick={() => { setDay(d); setSlot(null); setMsg(""); }}>
                <span className="cap">{d === dayKey(new Date()) ? t("today") : dt.toLocaleDateString("en-US", { weekday: "short" })}</span><b>{dt.getDate()}</b></button>;
            })}</div>
            {slots === null ? <p className="cap" aria-busy="true">…</p> : slots.length === 0 ? <p className="cap">{t("noTimes")}</p> : dayParts.map(([k, a, b]) => {
              const part = slots.filter((x) => x >= a && x < b);
              return part.length ? <div key={k} className="bw-stack"><div className="eyebrow">{t(k)}</div>
                <div className="bw-slots">{part.map((x) => {
                  const mine = day === m.day && x === m.start;
                  return <button key={x} type="button" disabled={mine} className={`bw-slot${slot === x ? " on" : ""}${mine ? " bw-mine" : ""}`} data-testid="m-slot" onClick={() => setSlot(x)}>{fmtMin(x)}</button>;
                })}</div></div> : null;
            })}
          </div>
          {msg && <p className="hint err" role="alert">{msg}</p>}
          <div className="bw-acts">
            <Button variant="primary" disabled={slot === null || busy} data-testid="m-save" onClick={doMove}>
              {slot === null ? t("mPickBtn") : t("mMoveBtn", { when: `${fromDayKey(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${fmtMin(slot)}` })}</Button>
            <Button variant="ghost" onClick={() => { setSlot(null); setMsg(""); setView("see"); }}>{t("mKeep")}</Button>
          </div>
        </>}

        {view === "cancel" && <>
          <div className="bw-hero">
            <h2 className="h1 bw-center">{t("mCancelAsk")}</h2>
            <p className="cap bw-center bw-sent">{m.guests.length > 1 ? t("mCancelGroup", { n: m.guests.length }) : t("mCancelSub")}</p>
          </div>
          {ticket}
          {msg && <p className="hint err" role="alert">{msg}</p>}
          <div className="bw-acts">
            <Button className="bw-danger" disabled={busy} data-testid="m-cancel-yes" onClick={doCancel}>{t("mCancelYes")}</Button>
            <Button variant="ghost" onClick={() => setView("see")}>{t("mKeep")}</Button>
          </div>
        </>}

        {view === "moved" && <>
          <div className="bw-hero">
            <div className="bw-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            <h2 className="h1 bw-center">{t("mMoved")}</h2>
            <p className="cap bw-center bw-sent">{t("mMovedSub")}</p>
          </div>
          {ticket}
          <div className="bw-acts"><Button onClick={() => setView("see")}>{t("mBack")}</Button></div>
        </>}

        {view === "canceled" && <>
          <div className="bw-hero">
            <h2 className="h1 bw-center">{t("mCanceledTitle")}</h2>
            <p className="cap bw-center bw-sent">{t("mCanceledSub")}</p>
          </div>
          {ticket}
          <div className="bw-acts"><a className="btn primary" href={`/${salon.slug}`}>{t("mBookNew")}</a></div>
        </>}

        {salon.phone && !(view === "see" && m.status === "live" && !m.canChange) && <div className="bw-foot cap bw-center"><span>{t("callUs")} {call}</span></div>}
      </div>
    </div>
  );
}
