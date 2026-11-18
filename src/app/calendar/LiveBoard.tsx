"use client";
// Calendar left panel = Live board (design: Calendar · Live). Waitlist (longest wait first, numbered, drag onto a tech)
// + every tech's state right now with a live countdown and progress bar. Facts only: the desk decides who's next.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Appt } from "@/lib/booking/appts";
import { fmtMin } from "@/lib/booking/grid";
import { liveBoard, mmss, waitLabel, type BoardRow } from "@/lib/booking/board";
import { waitedMin, type TurnFact } from "@/lib/booking/turns";

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
