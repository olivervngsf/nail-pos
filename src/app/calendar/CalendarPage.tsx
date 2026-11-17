"use client";
// Booking calendar (desk). Booking board: D1–D13 day (drag create / move / resize, 15-min snap, undo, overlaps side by side +
// alert, peek → details, quick-book card), W1–W2 week, M1–M2 month, phone = one staff column at a time.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, LeftMenu, OfflineBanner, SyncPill, Toast, TopBar } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { useDesk, type Desk } from "@/lib/desk";
import { putAppt, pullAppts, useAppts, type Appt } from "@/lib/booking/appts";
import { addDays, at, clamp, dayKey, fmtMin, fromDayKey, lanes, minutesOf, overlapping, snap, startOfWeek } from "@/lib/booking/grid";
import { BookDrawer, DetailsDrawer, statusOf, type BookDraft } from "./BookDrawers";

const H0 = 8 * 60, H1 = 21 * 60;     // grid 8 AM – 9 PM
const PX = 1.1;                      // px per minute
const ANY = "__any";
type View = "day" | "week" | "month";

export default function CalendarPage() {
  const { desk, err } = useDesk();
  if (err) return <main style={{ padding: 24 }}><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;
  return <Calendar desk={desk} />;
}

function Calendar({ desk }: { desk: Desk }) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const sp = useSearchParams();
  const view = (sp.get("view") as View) || "day";
  const day = sp.get("d") || dayKey(new Date());
  const go = useCallback((v: View, d: string) => router.replace(`/calendar?view=${v}&d=${d}`), [router]);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = useCallback((text: string, undo?: () => void) => { setToast({ text, undo }); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 5000); }, []);
  const [draft, setDraft] = useState<BookDraft | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const range = useMemo(() => {
    const d = fromDayKey(day);
    if (view === "day") return { from: at(day, 0), to: at(dayKey(addDays(d, 1)), 0) };
    if (view === "week") { const s = startOfWeek(d); return { from: at(dayKey(s), 0), to: at(dayKey(addDays(s, 7)), 0) }; }
    const s = startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));
    return { from: at(dayKey(s), 0), to: at(dayKey(addDays(s, 42)), 0) };
  }, [day, view]);
  const list = useAppts(desk.salonId, range.from, range.to);
  useEffect(() => {
    if (desk.mode !== "live") return;
    const pull = () => void pullAppts(desk.salonId, range.from, range.to).catch(() => { /* offline: device copy */ });
    pull();
    const iv = setInterval(pull, 30_000);
    return () => clearInterval(iv);
  }, [desk, range]);

  const step = (n: number) => {
    const d = fromDayKey(day);
    go(view, dayKey(view === "day" ? addDays(d, n) : view === "week" ? addDays(d, 7 * n) : new Date(d.getFullYear(), d.getMonth() + n, 1)));
  };
  const title = (() => {
    const d = fromDayKey(day);
    if (view === "day") return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (view === "week") { const s = startOfWeek(d); return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(s, 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`; }
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();

  // Keyboard: N new · T today · ← → day
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      if (e.key === "n" || e.key === "N") setDraft({ day, start: snap(Math.max(H0, nowMin()), 15), minutes: 45 });
      if (e.key === "t" || e.key === "T") go(view, dayKey(new Date()));
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const opened = list.find((a) => a.id === open) ?? null;
  return (
    <div className="app cal-app">
      <LeftMenu active="Calendar" salonInitials={desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={desk.me.display_name[0]} />
      <div className="col">
        <TopBar title={<span className="cal-top">
          <b className="cal-title" data-testid="cal-title">{title}</b>
          <Button size="sm" variant="ghost" aria-label={t("prev")} onClick={() => step(-1)}>‹</Button>
          <Button size="sm" onClick={() => go(view, dayKey(new Date()))}>{t("today")}</Button>
          <Button size="sm" variant="ghost" aria-label={t("next")} onClick={() => step(1)}>›</Button>
          <span className="seg cal-seg">{(["day", "week", "month"] as View[]).map((v) => (
            <button key={v} type="button" className={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => go(v, day)} data-testid={`view-${v}`}>{t(v)}</button>))}</span>
        </span>}>
          <SyncPill />
          <Button variant="primary" onClick={() => setDraft({ day, start: snap(clamp(nowMin(), H0, H1 - 60), 15), minutes: 45 })} data-testid="book-new">{t("book")}</Button>
        </TopBar>
        <OfflineBanner />
        {desk.mode === "demo" && <div className="demo" style={{ margin: "8px 16px 0" }}>{t("demo")}</div>}
        {view === "day" && <DayView desk={desk} day={day} list={list} onBook={setDraft} onOpen={setOpen} say={say} />}
        {view === "week" && <WeekView desk={desk} day={day} list={list} onDay={(d) => go("day", d)} onOpen={setOpen} onBook={setDraft} />}
        {view === "month" && <MonthView day={day} list={list} onDay={(d) => go("day", d)} />}
      </div>
      {draft && <BookDrawer desk={desk} draft={draft} all={list} onClose={() => setDraft(null)} onBooked={(n, name) => { setDraft(null); say(t("booked", { n, name })); }} />}
      {opened && <DetailsDrawer desk={desk} a={opened} onClose={() => setOpen(null)} say={say} />}
      {toast && <Toast action={toast.undo ? { label: t("undo"), onClick: () => { toast.undo?.(); setToast(null); } } : undefined}>{toast.text}</Toast>}
    </div>
  );
}

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const live = (a: Appt) => a.status !== "canceled" && a.status !== "no_show";

/* ---------- Day: staff columns ---------- */
type Drag =
  | { kind: "move"; id: string; y0: number; x0: number; start: number; dur: number; col: number; dy: number; dcol: number; moved: boolean }
  | { kind: "resize"; id: string; y0: number; start: number; dur: number; dy: number }
  | { kind: "new"; col: number; a: number; b: number };

function DayView({ desk, day, list, onBook, onOpen, say }: { desk: Desk; day: string; list: Appt[]; onBook: (d: BookDraft) => void; onOpen: (id: string) => void; say: (s: string, undo?: () => void) => void }) {
  const t = useTranslations("calendar");
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [phoneCol, setPhoneCol] = useState(0);
  const staff = useMemo(() => desk.staff.filter((s) => s.role === "tech" || list.some((a) => a.staffId === s.id)), [desk.staff, list]);
  const hasAny = list.some((a) => !a.staffId);
  const cols = useMemo(() => [...staff.map((s) => ({ id: s.id, name: s.name, sub: s.clockedIn ? t("in") : t("notIn"), on: s.clockedIn })), ...(hasAny ? [{ id: ANY, name: t("anyone"), sub: "", on: true }] : [])], [staff, hasAny, t]);
  const colOf = (a: Appt) => cols.findIndex((c) => c.id === (a.staffId ?? ANY));
  const dayList = list.filter((a) => dayKey(new Date(a.start)) === day);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, booked: 0, confirmed: 0, arrived: 0, done: 0, no_show: 0, canceled: 0 };
    for (const a of dayList) { c.all++; c[statusOf(a)]++; }
    return c;
  }, [dayList]);
  const colW = () => (gridRef.current?.clientWidth ?? 800) / Math.max(1, cols.length);
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches;

  const yMin = (clientY: number) => { const r = gridRef.current!.getBoundingClientRect(); return H0 + (clientY - r.top) / PX; };
  const xCol = (clientX: number) => { const r = gridRef.current!.getBoundingClientRect(); return clamp(Math.floor((clientX - r.left) / colW()), 0, cols.length - 1); };

  const onGridDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".cb")) return;
    const m = snap(yMin(e.clientY) - 7, 15);
    const col = narrow ? phoneCol : xCol(e.clientX);
    gridRef.current!.setPointerCapture(e.pointerId);
    setDrag({ kind: "new", col, a: m, b: m + 15 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "new") setDrag({ ...drag, b: Math.max(drag.a + 15, snap(yMin(e.clientY), 15)) });
    else if (drag.kind === "move") {
      const dy = snap((e.clientY - drag.y0) / PX, 15), dcol = narrow ? 0 : Math.round((e.clientX - drag.x0) / colW());
      setDrag({ ...drag, dy, dcol, moved: drag.moved || Math.abs(e.clientY - drag.y0) > 4 || Math.abs(e.clientX - drag.x0) > 6 });
    } else setDrag({ ...drag, dy: snap((e.clientY - drag.y0) / PX, 15) });
  };
  const onUp = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "new") {
      const c = cols[d.col];
      onBook({ day, start: d.a, minutes: d.b - d.a > 15 ? d.b - d.a : 45, staffId: c && c.id !== ANY ? c.id : undefined });
      return;
    }
    const a = list.find((x) => x.id === d.id);
    if (!a) return;
    if (d.kind === "move" && !d.moved) { onOpen(a.id); return; }
    const before = { ...a };
    let next: Appt;
    if (d.kind === "move") {
      const s = clamp(d.start + d.dy, H0, H1 - 15), col = clamp(d.col + d.dcol, 0, cols.length - 1);
      const sid = cols[col].id === ANY ? null : cols[col].id;
      if (s === d.start && sid === (a.staffId ?? null)) return;
      next = { ...a, start: at(day, s), end: at(day, s + d.dur), staffId: sid };
      putAppt(next);
      say(t("moved", { name: a.client?.name || t("walkIn"), time: fmtMin(s), who: cols[col].name }), () => putAppt(before));
    } else {
      const dur = Math.max(15, d.dur + d.dy);
      if (dur === d.dur) return;
      next = { ...a, end: at(day, d.start + dur) };
      putAppt(next);
      say(t("resized", { name: a.client?.name || t("walkIn"), min: dur }), () => putAppt(before));
    }
  };

  const shown = narrow ? [cols[phoneCol] ?? cols[0]].filter(Boolean) : cols;
  const nowM = nowMin();
  const isToday = day === dayKey(new Date());
  const freeNow = staff.filter((s) => s.clockedIn && !dayList.some((a) => a.staffId === s.id && live(a) && minutesOf(a.start) <= nowM && minutesOf(a.end) > nowM));

  return (
    <main className="cal-main">
      <aside className="cal-left">
        <MiniMonth day={day} list={list} />
        <div className="cap">{t("legend")}</div>
        <div className="cal-legend">
          <span className="cb unconf">{t("st_booked")}</span><span className="cb conf">{t("st_confirmed")}</span><span className="cb chair">{t("st_arrived")}</span><span className="cb paid">{t("st_done")}</span>
        </div>
        <div className="cap">{t("waitLater")}</div>
      </aside>
      <section className="cal-center">
        <div className="cal-counts" role="toolbar" aria-label={t("filter")}>
          {(["all", "booked", "confirmed", "arrived", "done", "no_show", "canceled"] as const).map((k) => (
            <button key={k} type="button" className={`cal-cnt ${filter === k ? "on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`count-${k}`}>
              {counts[k]} <span style={{ fontWeight: 500, opacity: 0.75 }}>{t(k === "all" ? "all" : `st_${k}`)}</span></button>))}
          <span style={{ flex: 1 }} />
          <span className="cap cal-hint">{t("hint")}</span>
        </div>
        {narrow && <div className="cal-phonestaff">{cols.map((c, i) => <button key={c.id} type="button" className={`chip ${i === phoneCol ? "on" : ""}`} onClick={() => setPhoneCol(i)}>{c.name}</button>)}</div>}
        <div className="cal-heads" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
          {shown.map((c) => (
            <div key={c.id} className="cal-head">
              <span className="av" style={{ width: 28, height: 28, fontSize: 12 }}>{c.name[0]}</span>
              <span style={{ minWidth: 0 }}><b style={{ display: "flex", alignItems: "center", gap: 4 }}><span className={`cal-dot ${c.on ? "on" : ""}`} />{c.name}</b><span className="cap" style={{ fontSize: 11 }}>{c.sub}</span></span>
            </div>))}
        </div>
        <div className="cal-scroll">
          <div className="cal-hours" style={{ height: (H1 - H0) * PX }}>
            {Array.from({ length: (H1 - H0) / 60 + 1 }, (_, i) => <div key={i} className="cal-hl" style={{ top: i * 60 * PX }}>{fmtMin(H0 + i * 60).replace(":00", "")}</div>)}
          </div>
          <div ref={gridRef} className="cal-grid" style={{ height: (H1 - H0) * PX }} data-testid="cal-grid"
            onPointerDown={onGridDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
            {Array.from({ length: (H1 - H0) / 30 }, (_, i) => <div key={i} className={i % 2 ? "cal-half" : "cal-hr"} style={{ top: i * 30 * PX }} />)}
            {shown.map((_, i) => i > 0 && <div key={i} className="cal-vl" style={{ left: `${(i / shown.length) * 100}%` }} />)}
            {shown.map((c, ci) => {
              const mine = dayList.filter((a) => (a.staffId ?? ANY) === c.id);
              const spans = mine.filter(live).map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) }));
              const ln = lanes(mine.map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) })));
              const over = overlapping(spans);
              return mine.map((a) => {
                let s = minutesOf(a.start), e = minutesOf(a.end), col = ci;
                if (drag && drag.kind !== "new" && drag.id === a.id) {
                  if (drag.kind === "move") { s += drag.dy; e += drag.dy; col = narrow ? ci : clamp(colOf(a) + drag.dcol, 0, cols.length - 1); }
                  else e = Math.max(s + 15, e + drag.dy);
                }
                const L = ln[a.id] ?? { lane: 0, lanes: 1 };
                const w = 100 / shown.length;
                const st = statusOf(a);
                const svc = a.services.map((x) => x.name).join(" + ");
                return (
                  <div key={a.id} className={`cb ${CLS[st]} ${(e - s) < 30 ? "xs" : ""} ${drag && drag.kind !== "new" && drag.id === a.id ? "drag" : ""} ${filter !== "all" && filter !== st ? "dim" : ""}`}
                    style={{ top: (s - H0) * PX, height: Math.max(14, (e - s) * PX - 2), left: `calc(${col * w + (L.lane * w) / L.lanes}% + 3px)`, width: `calc(${w / L.lanes}% - 6px)` }}
                    data-testid="cal-block" data-name={a.client?.name ?? ""} role="button" tabIndex={0} aria-label={`${a.client?.name ?? t("walkIn")} ${fmtMin(s)}`}
                    onKeyDown={(ev) => ev.key === "Enter" && onOpen(a.id)}
                    onPointerDown={(ev) => {
                      if (st === "done" || st === "canceled" || st === "no_show") { ev.stopPropagation(); onOpen(a.id); return; }
                      ev.stopPropagation();
                      gridRef.current!.setPointerCapture(ev.pointerId);
                      const resize = (ev.target as HTMLElement).classList.contains("cb-rs");
                      setDrag(resize ? { kind: "resize", id: a.id, y0: ev.clientY, start: s, dur: e - s, dy: 0 }
                        : { kind: "move", id: a.id, y0: ev.clientY, x0: ev.clientX, start: s, dur: e - s, col: colOf(a), dy: 0, dcol: 0, moved: false });
                    }}>
                    <b>{a.client?.care ? "▲ " : ""}{a.client?.name || t("walkIn")}</b>
                    <span className="m">{fmtMin(s)} · {svc}</span>
                    <span className="s">{over.has(a.id) ? `⚠ ${t("overlap")}` : t(`st_${st}`)}{a.source !== "desk" ? ` · ${t(`src_${a.source}`)}` : ""}</span>
                    <span className="cb-rs" aria-hidden />
                  </div>
                );
              });
            })}
            {drag?.kind === "new" && (() => { const ci = narrow ? 0 : drag.col, w = 100 / shown.length; return (
              <div className="cb ghost" style={{ top: (drag.a - H0) * PX, height: (drag.b - drag.a) * PX, left: `calc(${ci * w}% + 3px)`, width: `calc(${w}% - 6px)` }}>
                <b>{fmtMin(drag.a)} – {fmtMin(drag.b)}</b></div>); })()}
            {isToday && nowM >= H0 && nowM <= H1 && <div className="cal-now" style={{ top: (nowM - H0) * PX }} />}
          </div>
        </div>
      </section>
      <aside className="cal-right">
        <div style={{ display: "flex", alignItems: "center" }}><b style={{ fontSize: 15, flex: 1 }}>{t("upNext")}</b><span className="tag jade">{t("freeNow", { n: freeNow.length })}</span></div>
        <div className="cap">{t("upNextSub")}</div>
        {[...staff].sort((a, b) => Number(b.clockedIn) - Number(a.clockedIn) || a.turns - b.turns).map((s) => {
          const busy = dayList.find((a) => a.staffId === s.id && live(a) && minutesOf(a.start) <= nowM && minutesOf(a.end) > nowM);
          const nextA = dayList.filter((a) => a.staffId === s.id && live(a) && minutesOf(a.start) > nowM).sort((x, y) => x.start.localeCompare(y.start))[0];
          return (
            <div key={s.id} className={`cal-ucard ${s.clockedIn && !busy ? "free" : ""} ${s.clockedIn ? "" : "out"}`}>
              <span className={`cal-dot ${s.clockedIn ? "on" : ""}`} />
              <span style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b>
                <span className="cap" style={{ display: "block", fontSize: 12 }}>
                  {!s.clockedIn ? t("notIn") : busy ? t("busyUntil", { time: fmtMin(minutesOf(busy.end)) }) : t("freeNowShort")} · {t("turns", { n: s.turns })} · {formatCents(s.centsToday).replace(/\.00$/, "")}
                  {nextA ? ` · ${t("nextAt", { time: fmtMin(minutesOf(nextA.start)) })}` : ""}</span></span>
              {s.clockedIn && <Button size="sm" onClick={() => onBook({ day, start: snap(clamp(busy ? minutesOf(busy.end) : nowM, H0, H1 - 60), 15), minutes: 45, staffId: s.id })}>{t("bookShort")}</Button>}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <div className="cap">{t("keys")}</div>
      </aside>
    </main>
  );
}

const CLS: Record<string, string> = { booked: "unconf", confirmed: "conf", arrived: "chair", done: "paid", no_show: "cancel", canceled: "cancel" };

function MiniMonth({ day, list }: { day: string; list: Appt[] }) {
  const router = useRouter();
  const d = fromDayKey(day);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = startOfWeek(first);
  const busy = new Set(list.filter(live).map((a) => dayKey(new Date(a.start))));
  const today = dayKey(new Date());
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}><b style={{ fontSize: 14, flex: 1 }}>{d.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</b></div>
      <div className="cal-mini">
        {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => <span key={i} className="cap">{x}</span>)}
        {Array.from({ length: 42 }, (_, i) => { const x = addDays(start, i), k = dayKey(x); return (
          <button key={k} type="button" className={`${k === day ? "sel" : ""} ${k === today ? "today" : ""} ${busy.has(k) ? "busy" : ""} ${x.getMonth() !== d.getMonth() ? "out" : ""}`}
            onClick={() => router.replace(`/calendar?view=day&d=${k}`)}>{x.getDate()}</button>); })}
      </div>
    </div>
  );
}

/* ---------- Week (W1–W2) ---------- */
function WeekView({ desk, day, list, onDay, onOpen, onBook }: { desk: Desk; day: string; list: Appt[]; onDay: (d: string) => void; onOpen: (id: string) => void; onBook: (d: BookDraft) => void }) {
  const t = useTranslations("calendar");
  const s = startOfWeek(fromDayKey(day));
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(s, i)));
  const name = (id?: string | null) => desk.staff.find((x) => x.id === id)?.name ?? t("anyone");
  return (
    <main className="cal-week">
      <div className="cal-heads" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", marginLeft: 52 }}>
        {days.map((k) => { const n = list.filter((a) => dayKey(new Date(a.start)) === k && live(a)).length; return (
          <button key={k} type="button" className="cal-head" onClick={() => onDay(k)} style={{ border: 0, background: "none", font: "inherit", cursor: "pointer", textAlign: "left" }}>
            <b>{fromDayKey(k).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</b><span className="cap">{t("nBooked", { n })}</span></button>); })}
      </div>
      <div className="cal-scroll">
        <div className="cal-hours" style={{ height: (H1 - H0) * PX }}>
          {Array.from({ length: (H1 - H0) / 60 + 1 }, (_, i) => <div key={i} className="cal-hl" style={{ top: i * 60 * PX }}>{fmtMin(H0 + i * 60).replace(":00", "")}</div>)}
        </div>
        <div className="cal-grid" style={{ height: (H1 - H0) * PX }}>
          {Array.from({ length: (H1 - H0) / 30 }, (_, i) => <div key={i} className={i % 2 ? "cal-half" : "cal-hr"} style={{ top: i * 30 * PX }} />)}
          {days.map((k, i) => (
            <div key={k} className="cal-wcol" style={{ left: `${(i / 7) * 100}%`, width: `${100 / 7}%` }} data-testid="week-col"
              onDoubleClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onBook({ day: k, start: snap(H0 + (e.clientY - r.top) / PX - 7, 15), minutes: 45 }); }}>
              {(() => { const mine = list.filter((a) => dayKey(new Date(a.start)) === k); const ln = lanes(mine.map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) })));
                return mine.map((a) => { const st = statusOf(a), sm = minutesOf(a.start), em = minutesOf(a.end), L = ln[a.id];
                  return (<button key={a.id} type="button" className={`cb ${CLS[st]} ${em - sm < 40 ? "xs" : ""}`} onClick={() => onOpen(a.id)} data-testid="week-block"
                    style={{ top: (sm - H0) * PX, height: Math.max(14, (em - sm) * PX - 2), left: `calc(${(L.lane * 100) / L.lanes}% + 2px)`, width: `calc(${100 / L.lanes}% - 4px)` }}>
                    <b>{a.client?.name || t("walkIn")}</b><span className="m">{fmtMin(sm)} · {name(a.staffId)}</span></button>); }); })()}
            </div>))}
          {days.map((_, i) => i > 0 && <div key={i} className="cal-vl" style={{ left: `${(i / 7) * 100}%` }} />)}
        </div>
      </div>
    </main>
  );
}

/* ---------- Month (M1–M2) ---------- */
function MonthView({ day, list, onDay }: { day: string; list: Appt[]; onDay: (d: string) => void }) {
  const t = useTranslations("calendar");
  const d = fromDayKey(day);
  const start = startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));
  const today = dayKey(new Date());
  return (
    <main className="cal-month">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <div key={x} className="cap cal-mh">{x}</div>)}
      {Array.from({ length: 42 }, (_, i) => {
        const x = addDays(start, i), k = dayKey(x);
        const mine = list.filter((a) => dayKey(new Date(a.start)) === k && live(a));
        return (
          <button key={k} type="button" className={`cal-mday ${x.getMonth() !== d.getMonth() ? "out" : ""} ${k === today ? "today" : ""}`} onClick={() => onDay(k)} data-testid="month-day">
            <span className="cal-mn">{x.getDate()}</span>
            {mine.slice(0, 3).map((a) => <span key={a.id} className="cal-mrow">{fmtMin(minutesOf(a.start)).replace(":00", "")} {a.client?.name || t("walkIn")}</span>)}
            {mine.length > 3 && <span className="cap">{t("more", { n: mine.length - 3 })}</span>}
          </button>
        );
      })}
    </main>
  );
}

