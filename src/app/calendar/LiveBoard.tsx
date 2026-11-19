"use client";
// Calendar left panel = Live board (design: Calendar · Live). Waitlist (longest wait first, numbered, drag onto a tech)
// + every tech's state right now with a live countdown and progress bar. Facts only: the desk decides who's next.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Appt } from "@/lib/booking/appts";
import { fmtMin } from "@/lib/booking/grid";
import { liveBoard, mmss, waitLabel, type BoardRow } from "@/lib/booking/board";
import { onGrid, waitedMin, type TurnFact } from "@/lib/booking/turns";

const COLOR: Record<BoardRow["state"], string> = { busy: "#2A55B0", break: "#5E5E66", soon: "#C2410C", free: "#1F7A33", out: "#8E8E93" };

function useSecond() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  return now;
}

export function LiveBoard({ waiting, dayList, order, nextId, onSeat, onWalkIn, onOpen, onBook }: {
  waiting: Appt[]; dayList: Appt[]; order: TurnFact[]; nextId: string | null;
  onSeat: (a: Appt) => void; onWalkIn: () => void; onOpen: (id: string) => void; onBook: (staffId: string) => void;
}) {
  const t = useTranslations("calendar");
  const nowMs = useSecond();
  const d = new Date(nowMs), nowSec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const rows = liveBoard(order, dayList, nowSec);
  const busy = rows.filter((r) => r.state === "busy").length, free = rows.filter((r) => r.state === "free").length;
  const sorted = [...waiting].sort((a, b) => (a.arrivedAt || a.start).localeCompare(b.arrivedAt || b.start));
  const waits = sorted.map((a) => waitedMin(a, nowMs));
  const longest = waits.length ? Math.max(...waits) : 0, avg = waits.length ? Math.round(waits.reduce((x, y) => x + y, 0) / waits.length) : 0;

  return (
    <div className="lb" data-testid="live-board">
      <div className="lb-h"><span className="eyebrow" style={{ flex: 1 }}>{t("lbTitle")}</span><span className="cap">{t("lbCounts", { busy, free })}</span></div>

      <div className="wl" data-testid="waitlist">
        <div className="lb-sub"><span className="eyebrow" style={{ flex: 1 }}>{t("waitlist")} · <span data-testid="wait-count">{t("waitingN", { n: waiting.length })}</span></span>
          {waiting.length > 0 && <span className="cap" style={{ fontSize: 11.5 }}>{t("lbWaitSum", { longest: waitLabel(longest), avg: waitLabel(avg) })}</span>}</div>
        {sorted.map((a, i) => (
          <button key={a.id} type="button" className="lb-wrow" draggable data-testid="wait-card" data-name={a.client?.name ?? ""}
            onDragStart={(e) => { e.dataTransfer.setData("text/walkin", a.id); e.dataTransfer.effectAllowed = "move"; }}
            onClick={() => onSeat(a)} aria-label={`${a.client?.name || t("walkIn")} · ${t("waitingMin", { n: waits[i] })}`}>
            <span className="lb-pos">{i + 1}</span>
            <span className="lb-mid"><b className="lb-n">{a.client?.name || t("walkIn")} <span className="cap" style={{ fontWeight: 500 }}>{a.note}</span></b>
              <span className="lb-s">{a.services.map((s) => s.name).join(" + ") || t("notSure")}{a.services.length ? ` · ${t("min", { n: a.services.reduce((x, s) => x + s.minutes, 0) })}` : ""}</span></span>
            <span className="lb-timer" style={{ color: waits[i] >= 15 ? "#C2410C" : "#8A6A3A" }}>{waitLabel(waits[i])}</span>
          </button>))}
        {waiting.length > 0 ? <div className="lb-s" style={{ padding: "0 6px", fontSize: 11 }}>{t("lbWaitHint")}</div>
          : <div className="lb-s" style={{ padding: "2px 6px" }}>{t("noneWaiting")}</div>}
        <button type="button" className="wl-add" onClick={onWalkIn} data-testid="walkin-new">{t("addWalkIn")}</button>
      </div>

      <div className="eyebrow" style={{ padding: "8px 6px 2px" }}>{t("lbTechs")}</div>
      {rows.map((r) => {
        const c = COLOR[r.state];
        const line = r.state === "busy" ? `${r.appt?.client?.name || t("walkIn")} · ${r.appt?.services.map((s) => s.name).join(" + ") || ""}`
          : r.state === "break" ? t("lbOnBreak")
          : r.state === "soon" ? `${r.appt?.client?.name || t("walkIn")} · ${fmtMin(Math.floor((r.secs! + nowSec) / 60))}`
          : r.state === "free" ? `${r.nextAt === null ? t("lbFreeDay") : t("lbFreeNext", { min: Math.round((r.nextAt - nowSec) / 60), time: fmtMin(Math.floor(r.nextAt / 60)) })} · ${t("turns", { n: r.turns })}`
          : t("lbOff");
        const label = r.state === "busy" ? t("lbBusy") : r.state === "break" ? t("brk") : r.state === "soon" ? (r.here ? t("lbHere") : r.secs! < 0 ? t("lbLate") : t("lbNextUp"))
          : r.state === "free" ? t("lbFree") : t("lbNotIn");
        const timerColor = r.state === "busy" ? (r.secs! < 0 ? "#E03131" : r.secs! < 300 ? "#C2410C" : "#2A55B0") : c;
        const act = () => { if (r.appt) onOpen(r.appt.id); else if (r.state === "free") onBook(r.id); };
        return (
          <button key={r.id} type="button" className={`lb-row ${r.state}`} onClick={act} disabled={r.state === "out"} data-testid={`lb-${r.name}`}>
            <span className="av" style={{ width: 32, height: 32, fontSize: 13, boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${c}` }}>{r.name[0]}</span>
            <span className="lb-mid">
              <span className="lb-n">{r.name}<span className="lb-st" style={{ color: c }}>{label}</span>{nextId === r.id && <span className="tag jade cal-next">{t("next")}</span>}</span>
              <span className="lb-s">{line}</span>
              {(r.state === "busy" || r.state === "break") && <span className="lb-bar"><i style={{ width: `${r.pct}%`, background: timerColor }} /></span>}
            </span>
            <span className="lb-timer" style={{ color: timerColor }}>{r.state === "free" ? t("lbBook") : r.secs !== null ? mmss(r.secs) : ""}</span>
          </button>);
      })}
    </div>
  );
}

/** Left panel on any day that isn't today: the Live board + waitlist only make sense "right now", so show the day's plan
 *  per tech (bookings, booked time, first → last) and a way back to today. Tap a tech = book them that day. */
export function DayPlan({ day, dayList, techs, onToday, onBook, onOpen }: {
  day: string; dayList: Appt[]; techs: { id: string; name: string }[];
  onToday: () => void; onBook: (staffId: string) => void; onOpen: (id: string) => void;
}) {
  const t = useTranslations("calendar");
  const live = dayList.filter((a) => onGrid(a) && a.status !== "canceled" && a.status !== "no_show" && a.status !== "walked_out" && a.status !== "blocked");
  const minOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
  const [y, m, dd] = day.split("-").map(Number);
  const label = new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const rows = techs.map((s) => {
    const mine = live.filter((a) => a.staffId === s.id).sort((a, b) => a.start.localeCompare(b.start));
    const mins = mine.reduce((x, a) => x + Math.max(0, minOf(a.end) - minOf(a.start)), 0);
    return { ...s, mine, mins };
  }).sort((a, b) => b.mine.length - a.mine.length || a.name.localeCompare(b.name));
  const anyone = live.filter((a) => !a.staffId);
  const hrs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ""}` : `${n}m`);
  return (
    <div className="lb" data-testid="day-plan">
      <div className="lb-h"><span className="eyebrow" style={{ flex: 1 }}>{t("dpTitle", { day: label })}</span><span className="cap">{t("dpCount", { n: live.length })}</span></div>
      <div className="dp-note">
        <span style={{ flex: 1 }}>{t("dpNote")}</span>
        <button type="button" className="btn sm" onClick={onToday} data-testid="dp-today">{t("dpToday")}</button>
      </div>
      <div className="eyebrow" style={{ padding: "8px 6px 2px" }}>{t("lbTechs")}</div>
      {rows.map((r) => (
        <div key={r.id} className="dp-tech" data-testid={`dp-${r.name}`}>
          <button type="button" className="lb-row free" onClick={() => onBook(r.id)}>
            <span className="av" style={{ width: 32, height: 32, fontSize: 13 }}>{r.name[0]}</span>
            <span className="lb-mid">
              <span className="lb-n">{r.name}</span>
              <span className="lb-s">{r.mine.length
                ? `${t("dpAppts", { n: r.mine.length })} · ${hrs(r.mins)} · ${fmtMin(minOf(r.mine[0].start))}–${fmtMin(minOf(r.mine[r.mine.length - 1].end))}`
                : t("dpOpen")}</span>
            </span>
            <span className="lb-timer" style={{ color: "#1F7A33" }}>{t("lbBook")}</span>
          </button>
          {r.mine.map((a) => (
            <button key={a.id} type="button" className="dp-appt" onClick={() => onOpen(a.id)}>
              <span className="dp-time">{fmtMin(minOf(a.start))}</span>
              <span className="dp-who">{a.client?.name || t("walkIn")}</span>
              <span className="dp-svc">{a.services.map((s) => s.name).join(" + ")}</span>
            </button>))}
        </div>))}
      {anyone.length > 0 && <>
        <div className="eyebrow" style={{ padding: "8px 6px 2px" }}>{t("anyone")} · {anyone.length}</div>
        {anyone.map((a) => (
          <button key={a.id} type="button" className="dp-appt" onClick={() => onOpen(a.id)}>
            <span className="dp-time">{fmtMin(minOf(a.start))}</span>
            <span className="dp-who">{a.client?.name || t("walkIn")}</span>
            <span className="dp-svc">{a.services.map((s) => s.name).join(" + ")}</span>
          </button>))}
      </>}
    </div>
  );
}
