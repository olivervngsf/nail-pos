"use client";
// Tech app · My schedule (Tech App board T2–T4): Day (my clients in time order, who is in my chair, free gaps) and Week
// (clients + $ booked per day, how full). Tap a client → details (time, services, price, status, care note flag,
// client profile). Own bookings only, no client phone numbers.
import Link from "next/link";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, Segmented } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { addDays, dayKey } from "@/lib/booking/grid";
import { weekStart, isoDay } from "@/lib/closeday";
import type { Appt } from "@/lib/booking/appts";
import { TechShell, useTechMe } from "../tech";
import { dayRows, fmtMins, minsSince } from "@/lib/booking/techday";
import { svcCents, svcNames, timeOf, useMyAppts, useNow } from "../data";

const $ = formatCents;
const shift = (d: string, n: number) => dayKey(addDays(new Date(`${d}T12:00:00`), n));
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", opts);

export default function TechSchedule() {
  const t = useTranslations("tech");
  const { me, err } = useTechMe();
  const params = useSearchParams();
  const [view, setView] = useState<"day" | "week">("day");
  const [day, setDay] = useState(isoDay());
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const wk = weekStart(day);
  const list = useMyAppts(me, view === "day" ? day : wk, view === "day" ? 1 : 7);
  const open = list.find((a) => a.id === openId) ?? null;

  return (
    <TechShell title={t("tab_schedule")} me={me} err={err}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Segmented label={t("view")} value={view} onChange={setView} options={[{ value: "day", label: t("day") }, { value: "week", label: t("week") }]} />
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" aria-label={t("before")} onClick={() => setDay(shift(day, view === "day" ? -1 : -7))}>‹</Button>
        <Button size="sm" variant="ghost" onClick={() => setDay(isoDay())}>{t("today")}</Button>
        <Button size="sm" variant="ghost" aria-label={t("after")} onClick={() => setDay(shift(day, view === "day" ? 1 : 7))}>›</Button>
      </div>
      {view === "day"
        ? <Swipe onPrev={() => setDay(shift(day, -1))} onNext={() => setDay(shift(day, 1))}><Day day={day} list={list} onOpen={setOpenId} /></Swipe>
        : <Week start={wk} list={list} onPick={(d) => { setDay(d); setView("day"); }} />}
      {open && <Details a={open} onClose={() => setOpenId(null)} />}
    </TechShell>
  );
}

/** Swipe left / right on the day to go to the next / previous day (a short, mostly sideways swipe). */
function Swipe({ onPrev, onNext, children }: { onPrev: () => void; onNext: () => void; children: React.ReactNode }) {
  const from = useRef<{ x: number; y: number } | null>(null);
  return (
    <div data-testid="day-swipe" style={{ display: "flex", flexDirection: "column", gap: 14, touchAction: "pan-y" }}
      onTouchStart={(e) => { const p = e.touches[0]; from.current = { x: p.clientX, y: p.clientY }; }}
      onTouchEnd={(e) => {
        const f = from.current; from.current = null;
        if (!f) return;
        const p = e.changedTouches[0], dx = p.clientX - f.x, dy = p.clientY - f.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onPrev)();
      }}>
      {children}
    </div>
  );
}

function Day({ day, list, onOpen }: { day: string; list: Appt[]; onOpen: (id: string) => void }) {
  const t = useTranslations("tech");
  const now = useNow();
  const isToday = day === isoDay();
  const booked = list.reduce((x, a) => x + svcCents(a), 0);
  // My clients in time order, free gaps of 30+ minutes (walk-ins may come, or book one), and a now line on today.
  const rows = dayRows(list, isToday ? now : undefined);
  return <>
    <b data-testid="day-title">{isToday ? `${t("today")} · ` : ""}{dayLabel(day, { weekday: "short", month: "short", day: "numeric" })} · {t("clientsN", { n: list.filter((x) => x.status !== "blocked").length })}{booked ? ` · ${$(booked)}` : ""}</b>
    {list.length === 0 ? <p className="cap">{t("noClients")}</p> : (
      <div className="card" style={{ padding: 0, overflow: "hidden" }} data-testid="my-day">
        {rows.map((r, i) => r.kind === "now"
          ? <div key="now" className="t-now" data-testid="now-line" role="separator" aria-label={t("nowLine", { time: timeOf(new Date(now).toISOString()) })}><span>{timeOf(new Date(now).toISOString())}</span><i /></div>
          : r.kind === "gap"
          ? <Link key={`g${i}`} href="/t/book" className="t-row t-gap" data-testid="free-gap"><span className="when cap">{timeOf(r.from)}</span><span className="cap" style={{ flex: 1 }}>{t("freeGap", { from: timeOf(r.from), to: timeOf(r.to) })}</span><b className="cap" style={{ color: "var(--ink)" }}>{t("bookPlus")}</b></Link>
          : <ApptRow key={r.a.id} a={r.a} now={now} onOpen={onOpen} />)}
      </div>
    )}
    <span className="cap">{t("swipeHint")}</span>
  </>;
}

function ApptRow({ a, now, onOpen }: { a: Appt; now: number; onOpen: (id: string) => void }) {
  const t = useTranslations("tech");
  const paid = a.ticketStatus === "paid" || a.status === "done";
  const chair = !paid && a.status === "arrived";
  const unconf = a.status === "booked";
  return (
    <button type="button" className={`t-row${paid ? " paid" : chair ? " chair" : unconf ? " unconf" : ""}`} onClick={() => onOpen(a.id)} data-testid="my-appt">
      <span className="when"><b>{timeOf(a.start)}</b></span>
      <span style={{ flex: 1, minWidth: 0 }}><b>{a.status === "blocked" ? t("brk") : a.client?.name || t("walkIn")}</b>
        <span className="cap" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {chair ? t("chairFor", { time: fmtMins(minsSince(a.arrivedAt ?? a.start, now), t("minUnit")) }) + " · " : ""}{svcNames(a)}</span></span>
      <Status a={a} />
    </button>
  );
}

function Status({ a }: { a: Appt }) {
  const t = useTranslations("tech");
  if (a.ticketStatus === "paid" || a.status === "done") return <span className="tag">{t("sPaid")}</span>;
  if (a.status === "arrived") return <span className="tag jade">{t("sChair")}</span>;
  if (a.status === "confirmed") return <span className="tag">{t("confirmed")}</span>;
  if (a.status === "blocked") return <span className="tag">{t("brk")}</span>;
  return <span className="tag" style={{ background: "var(--orange-soft)", color: "#B5470A" }}>{t("notConfirmed")}</span>;
}

function Week({ start, list, onPick }: { start: string; list: Appt[]; onPick: (d: string) => void }) {
  const t = useTranslations("tech");
  const days = Array.from({ length: 7 }, (_, i) => shift(start, i));
  const today = isoDay();
  return <>
    <div className="card" style={{ padding: 0 }} data-testid="my-week">
      {days.map((d) => {
        const mine = list.filter((a) => dayKey(new Date(a.start)) === d);
        const mins = mine.reduce((x, a) => x + (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000, 0);
        const pct = Math.min(100, Math.round((mins / (8 * 60)) * 100));
        return (
          <button key={d} type="button" className={`t-row${d === today ? " today" : d < today ? " past" : ""}`} onClick={() => onPick(d)} aria-current={d === today ? "date" : undefined}>
            <span style={{ width: 48, textAlign: "center" }}><span className="cap">{d === today ? t("today") : dayLabel(d, { weekday: "short" })}</span><b style={{ display: "block", fontSize: 18 }}>{dayLabel(d, { day: "numeric" })}</b></span>
            <span style={{ flex: 1 }}><b>{mine.length ? t("clientsBooked", { n: mine.length, amount: $(mine.reduce((x, a) => x + svcCents(a), 0)) }) : t("noClientsShort")}</b>
              <div className="t-bar" style={{ marginTop: 6 }}><span style={{ width: `${pct}%` }} /></div></span>
          </button>
        );
      })}
    </div>
    <span className="cap">{t("weekHint")}</span>
  </>;
}

function Details({ a, onClose }: { a: Appt; onClose: () => void }) {
  const t = useTranslations("tech");
  return (
    <Drawer title={a.client?.name || t("walkIn")} onClose={onClose} footer={<Button block onClick={onClose}>{t("close")}</Button>}>
      <div data-testid="appt-detail" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="cap">{timeOf(a.start)} – {timeOf(a.end)} · {dayLabel(dayKey(new Date(a.start)), { weekday: "short", month: "short", day: "numeric" })} · {fmtMins((new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000, t("minUnit"))}</div>
        <div className="group" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
          {a.services.map((s, i) => <div key={i} className="row" style={{ minHeight: 44 }}><span className="grow">{s.name}<span className="cap" style={{ display: "block" }}>{t("minutes", { n: s.minutes })}</span></span><b className="num">{$(s.cents)}</b></div>)}
          {a.services.length > 1 && <div className="row" style={{ minHeight: 44 }}><b className="grow">{t("totalBeforeTip")}</b><b className="num">{$(svcCents(a))}</b></div>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Status a={a} />{a.repeat && <span className="tag">{t("repeats", { n: a.repeat.everyWeeks })}</span>}{a.source === "web" || a.source === "website" || a.source === "instagram" || a.source === "google" ? <span className="tag">{t("bookedOnline")}</span> : null}{a.client?.care && <span className="tag" style={{ background: "#FDEEE6", color: "#B5470A" }}>{t("careNote")}</span>}</div>
        {a.note && <div className="note">{a.note}</div>}
        {a.client?.id && <Link className="btn" href={`/clients/${a.client.id}`} data-testid="appt-client">{t("clientProfile")}</Link>}
        <span className="cap">{t("askDesk")}</span>
      </div>
    </Drawer>
  );
}
