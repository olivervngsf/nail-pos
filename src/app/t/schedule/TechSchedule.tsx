"use client";
// Tech app · My schedule (Tech App board T2–T4): Day (my clients in time order, who is in my chair, free gaps) and Week
// (clients + $ booked per day, how full). Tap a client → details (time, services, price, status, care note flag,
// client profile). Own bookings only, no client phone numbers.
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, Segmented } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { addDays, dayKey } from "@/lib/booking/grid";
import { weekStart, isoDay } from "@/lib/closeday";
import type { Appt } from "@/lib/booking/appts";
import { TechShell, useTechMe } from "../tech";
import { svcCents, svcNames, timeOf, useMyAppts } from "../data";

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
      {view === "day" ? <Day day={day} list={list} onOpen={setOpenId} /> : <Week start={wk} list={list} onPick={(d) => { setDay(d); setView("day"); }} />}
      {open && <Details a={open} onClose={() => setOpenId(null)} />}
    </TechShell>
  );
}

function Day({ day, list, onOpen }: { day: string; list: Appt[]; onOpen: (id: string) => void }) {
  const t = useTranslations("tech");
  const booked = list.reduce((x, a) => x + svcCents(a), 0);
  // Free gaps of 30+ minutes between my clients (walk-ins may come).
  const rows: ({ a: Appt } | { gap: [string, string] })[] = [];
  list.forEach((a, i) => {
    rows.push({ a });
    const nx = list[i + 1];
    if (nx && new Date(nx.start).getTime() - new Date(a.end).getTime() >= 30 * 60000) rows.push({ gap: [a.end, nx.start] });
  });
  return <>
    <b data-testid="day-title">{dayLabel(day, { weekday: "short", month: "short", day: "numeric" })} · {t("clientsN", { n: list.filter((x) => x.status !== "blocked").length })}{booked ? ` · ${$(booked)}` : ""}</b>
    {list.length === 0 ? <p className="cap">{t("noClients")}</p> : (
      <div className="card" style={{ padding: 0 }} data-testid="my-day">
        {rows.map((r, i) => "gap" in r
          ? <Link key={`g${i}`} href="/t/book" className="t-row" style={{ textDecoration: "none" }}><span className="when cap">{timeOf(r.gap[0])}</span><span className="cap" style={{ flex: 1 }}>{t("freeGap", { from: timeOf(r.gap[0]), to: timeOf(r.gap[1]) })}</span><span className="cap">+</span></Link>
          : <button key={r.a.id} type="button" className={`t-row${r.a.ticketStatus === "paid" || r.a.status === "done" ? " paid" : r.a.status === "arrived" ? " chair" : ""}`} onClick={() => onOpen(r.a.id)} data-testid="my-appt">
              <span className="when"><b>{timeOf(r.a.start)}</b></span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{r.a.status === "blocked" ? t("brk") : r.a.client?.name || t("walkIn")}</b><span className="cap" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svcNames(r.a)}</span></span>
              <Status a={r.a} />
            </button>)}
      </div>
    )}
  </>;
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
  return <>
    <div className="card" style={{ padding: 0 }} data-testid="my-week">
      {days.map((d) => {
        const mine = list.filter((a) => dayKey(new Date(a.start)) === d);
        const mins = mine.reduce((x, a) => x + (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000, 0);
        const pct = Math.min(100, Math.round((mins / (8 * 60)) * 100));
        return (
          <button key={d} type="button" className="t-row" onClick={() => onPick(d)}>
            <span style={{ width: 48, textAlign: "center" }}><span className="cap">{dayLabel(d, { weekday: "short" })}</span><b style={{ display: "block", fontSize: 18 }}>{dayLabel(d, { day: "numeric" })}</b></span>
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
        <div className="cap">{timeOf(a.start)} – {timeOf(a.end)} · {dayLabel(dayKey(new Date(a.start)), { weekday: "short", month: "short", day: "numeric" })}</div>
        <div className="group" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
          {a.services.map((s, i) => <div key={i} className="row" style={{ minHeight: 44 }}><span className="grow">{s.name}<span className="cap" style={{ display: "block" }}>{t("minutes", { n: s.minutes })}</span></span><b className="num">{$(s.cents)}</b></div>)}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Status a={a} />{a.client?.care && <span className="tag" style={{ background: "#FDEEE6", color: "#B5470A" }}>{t("careNote")}</span>}</div>
        {a.note && <div className="note">{a.note}</div>}
        {a.client?.id && <Link className="btn" href={`/clients/${a.client.id}`} data-testid="appt-client">{t("clientProfile")}</Link>}
        <span className="cap">{t("askDesk")}</span>
      </div>
    </Drawer>
  );
}
