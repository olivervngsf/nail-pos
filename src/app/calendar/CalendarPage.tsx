"use client";
// Booking calendar (desk). Booking board: D1–D13 day (drag create / move / resize, 15-min snap, undo, overlaps side by side +
// alert, peek → details, quick-book card), W1–W2 week, M1–M2 month, phone = one staff column at a time.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, LeftMenu, OfflineBanner, SyncPill, Toast, TopBar } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { useStored } from "@/lib/useStored";
import { useDesk, type Desk } from "@/lib/desk";
import { putAppt, pullAppts, useAppts, type Appt } from "@/lib/booking/appts";
import { pullTickets, useTickets } from "@/lib/checkout/store";
import { parseTicketScan } from "@/lib/print/print";
import { ScanDialog } from "./ScanDialog";
import { isHere, isWaiting, onGrid, turnCounts, turnOrder } from "@/lib/booking/turns";
import { getTicket } from "@/lib/checkout/store";
import { totals } from "@/lib/checkout/ticket";
import { SeatDrawer, WalkInDrawer, Waitlist, seatAppt, useTick } from "./WalkIns";
import { addDays, at, clamp, dayKey, fmtMin, fromDayKey, lanes, minutesOf, overlapping, snap, startOfWeek } from "@/lib/booking/grid";
import { BookDrawer, DetailsDrawer, statusOf, ticketFor, type BookDraft } from "./BookDrawers";

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
  const all = useAppts(desk.salonId, range.from, range.to);
  const today = dayKey(new Date());
  const list = useMemo(() => all.filter(onGrid), [all]);
  const waiting = useMemo(() => all.filter((a) => isWaiting(a) && dayKey(new Date(a.arrivedAt || a.start)) === today), [all, today]);
  // Turns = today's tickets per tech (device copy, kept in step with other desks).
  const tickets = useTickets(desk.salonId);
  useEffect(() => {
    if (desk.mode !== "live") return;
    const name = (id: string) => desk.staff.find((s) => s.id === id)?.name ?? "";
    const pull = () => void pullTickets(desk.salonId, name, at(dayKey(new Date()), 0)).catch(() => { /* offline */ });
    pull();
    const iv = setInterval(pull, 60_000);
    return () => clearInterval(iv);
  }, [desk]);
  const deskT = useMemo<Desk>(() => {
    const c = turnCounts(tickets, today);
    return { ...desk, staff: desk.staff.map((s) => ({ ...s, turns: desk.mode === "demo" ? s.turns + (c[s.id] ?? 0) : Math.max(s.turns, c[s.id] ?? 0) })) };
  }, [desk, tickets, today]);
  const [seatFor, setSeatFor] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [walkIn, setWalkIn] = useState(false);
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

  // Scan a receipt or ticket slip (QR link or ticket #) → open that ticket. Desk scanner, camera, or typed + Enter.
  const [scanOpen, setScanOpen] = useState(false);
  const ticketsRef = useRef(tickets); ticketsRef.current = tickets;
  const handleScan = useCallback(async (text: string) => {
    const s = parseTicketScan(text);
    if (!s) { say(t("scanNone")); return false; }
    const find = () => s.id ? ticketsRef.current.find((x) => x.id === s.id) ?? getTicket(s.id) : ticketsRef.current.find((x) => x.number === s.number);
    let hit = find();
    if (!hit && desk.mode === "live") {
      const name = (id: string) => desk.staff.find((x) => x.id === id)?.name ?? "";
      await pullTickets(desk.salonId, name, s.id ? "" : at(dayKey(new Date()), 0), s.id).catch(() => null);
      hit = s.id ? getTicket(s.id) : ticketsRef.current.find((x) => x.number === s.number);
    }
    if (hit && hit.salonId === desk.salonId) { setScanOpen(false); router.push(`/checkout/${hit.id}`); return true; }
    say(t("scanNone"));
    return false;
  }, [desk, router, say, t]);
  const scanBuf = useRef({ buf: "", last: 0 });

  // Keyboard: N new · T today · ← → day. A desk scanner types fast + Enter: caught here, no shortcuts fire.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      const sb = scanBuf.current, now = Date.now(), fast = now - sb.last < 60;
      if (!fast) sb.buf = "";
      sb.last = now;
      if (e.key === "Enter") { if (sb.buf.length >= 4) { e.preventDefault(); void handleScan(sb.buf); } sb.buf = ""; return; }
      if (e.key.length === 1) sb.buf += e.key;
      if (fast && sb.buf.length > 1) return;
      if (e.key === "n" || e.key === "N") setDraft({ day, start: snap(Math.max(H0, nowMin()), 15), minutes: 45 });
      if (e.key === "t" || e.key === "T") go(view, dayKey(new Date()));
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const opened = list.find((a) => a.id === open) ?? null;

  // Alerts (facts that need someone): overlaps, staff not in with bookings, long waits, not confirmed soon.
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const todayList = list.filter((a) => dayKey(new Date(a.start)) === today && a.status !== "canceled" && a.status !== "no_show");
  const alerts: { id: string; text: string; sub?: string; open?: string; kind: "overlap" | "cover" | "wait" | "unconf" | "here" }[] = [];
  for (const a of todayList) if (isHere(a)) alerts.push({ id: `h-${a.id}`, kind: "here", open: a.id,
    text: t("hereAlert", { name: a.client?.name || t("walkIn"), min: Math.max(0, Math.round((Date.now() - new Date(a.arrivedAt!).getTime()) / 60_000)) }),
    sub: t("hereAlertSub", { time: fmtMin(minutesOf(a.start)), who: deskT.staff.find((s) => s.id === a.staffId)?.name ?? t("anyone") }) });
  for (const s of deskT.staff) {
    const mine = todayList.filter((a) => a.staffId === s.id).sort((x, y) => x.start.localeCompare(y.start));
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      const A = mine[i], B = mine[j];
      if (B.start < A.end && A.start < B.end) alerts.push({ id: `o-${A.id}-${B.id}`, kind: "overlap", open: B.id,
        text: t("overlapBanner", { who: s.name, from: fmtMin(minutesOf(B.start)).replace(/ [AP]M$/, ""), to: fmtMin(Math.min(minutesOf(A.end), minutesOf(B.end))) }),
        sub: t("overlapWho", { a: A.client?.name || t("walkIn"), b: B.client?.name || t("walkIn"), who: s.name }) });
    }
    const later = mine.filter((a) => minutesOf(a.end) > nowM).length;
    if (!s.clockedIn && s.role === "tech" && later) alerts.push({ id: `c-${s.id}`, kind: "cover", text: t("notInBooked", { name: s.name, n: later }) });
  }
  for (const a of waiting) { const m = Math.round((Date.now() - new Date(a.arrivedAt || a.start).getTime()) / 60_000); if (m >= 20) alerts.push({ id: `w-${a.id}`, kind: "wait", text: t("longWait", { name: a.client?.name || t("walkIn"), min: m }) }); }
  for (const a of todayList) if (a.status === "booked" && minutesOf(a.start) > nowM && minutesOf(a.start) - nowM <= 120 && a.source !== "kiosk" && a.source !== "walk_in")
    alerts.push({ id: `u-${a.id}`, kind: "unconf", open: a.id, text: t("unconfSoon", { name: a.client?.name || t("walkIn"), time: fmtMin(minutesOf(a.start)) }) });
  const ov = alerts.find((x) => x.kind === "overlap"), cover = alerts.find((x) => x.kind === "cover");
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
          <label className="cal-search"><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} data-testid="cal-search"
            onKeyDown={(e) => { if (e.key === "Enter" && parseTicketScan(q)) { e.preventDefault(); void handleScan(q).then((ok) => ok && setQ("")); } }} />
            <button type="button" className="cal-scan" onClick={() => setScanOpen(true)} aria-label={t("scanBtn")} title={t("scanBtn")} data-testid="scan-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>
              <span className="cal-scanl">{t("scanShort")}</span></button>
            <span className="kbd">/</span></label>
          <span className="cal-alertwrap">
            <button type="button" className={`cal-alertbtn ${alerts.length ? "on" : ""}`} onClick={() => setAlertsOpen((x) => !x)} aria-expanded={alertsOpen}
              aria-label={`${t("alerts")} ${alerts.length}`} title={t("alerts")} data-testid="alerts">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" /></svg>
              {alerts.length > 0 && <span className="cal-acount">{alerts.length}</span>}</button>
            {alertsOpen && <div className="cal-alp card" role="dialog" aria-label={t("alerts")}>
              {alerts.length === 0 ? <div className="cap" style={{ padding: "8px 16px" }}>{t("noAlerts")}</div> : alerts.map((x) => (
                <button key={x.id} type="button" className="cal-alr" onClick={() => { setAlertsOpen(false); if (x.kind === "overlap") { go("day", today); setFilter("overlap"); } else if (x.open) setOpen(x.open); else if (x.kind === "wait") go("day", today); }}>
                  <b>{x.text}</b>{x.sub && <span className="cap">{x.sub}</span>}</button>))}
            </div>}
          </span>
          <SyncPill />
          <Button variant="primary" onClick={() => setDraft({ day, start: snap(clamp(nowMin(), H0, H1 - 60), 15), minutes: 45 })} data-testid="book-new">{t("book")} <span className="kbd cal-kbd">N</span></Button>
        </TopBar>
        {view === "day" && day === today && (ov || cover) && <div className="cal-banner" role="status">
          {ov && <><b className="cal-bwarn">⚠ {ov.text}</b><span className="cal-bsub">{ov.sub}</span><button type="button" className="btn sm" onClick={() => setFilter(filter === "overlap" ? "all" : "overlap")}>{t("show")}</button></>}
          <span style={{ flex: 1 }} />
          {cover && <span className="cap">{cover.text}</span>}
        </div>}
        <OfflineBanner />
        {desk.mode === "demo" && <div className="demo" style={{ margin: "8px 16px 0" }}>{t("demo")}</div>}
        {view === "day" && <DayView desk={deskT} day={day} list={list} onBook={setDraft} onOpen={setOpen} say={say}
          waiting={day === today ? waiting : []} onSeat={(a) => setSeatFor(a.id)} onWalkIn={() => setWalkIn(true)} q={q} filter={filter} setFilter={setFilter} />}
        {view === "week" && <WeekView desk={desk} day={day} list={list} onDay={(d) => go("day", d)} onOpen={setOpen} onBook={setDraft} />}
        {view === "month" && <MonthView day={day} list={list} onDay={(d) => go("day", d)} />}
      </div>
      {draft && <BookDrawer desk={desk} draft={draft} all={list} onClose={() => setDraft(null)} onBooked={(n, name) => { setDraft(null); say(t("booked", { n, name })); }} />}
      {opened && <DetailsDrawer desk={desk} a={opened} onClose={() => setOpen(null)} say={say} />}
      {walkIn && <WalkInDrawer desk={desk} today={today} all={all} onClose={() => setWalkIn(false)} say={(x) => say(x)} />}
      {seatFor && (() => { const a = all.find((x) => x.id === seatFor); if (!a) return null;
        const nowM = new Date().getHours() * 60 + new Date().getMinutes();
        const order = turnOrder(deskT.staff.filter((x) => x.role === "tech"), list.filter((x) => dayKey(new Date(x.start)) === today), nowM);
        return <SeatDrawer desk={deskT} a={a} order={order} onClose={() => setSeatFor(null)} say={say} />; })()}
      {scanOpen && <ScanDialog onCode={(x) => void handleScan(x)} onClose={() => setScanOpen(false)} />}
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
  | { kind: "new"; col: number; a: number; b: number; touch?: boolean };

function DayView({ desk, day, list, onBook, onOpen, say, waiting, onSeat, onWalkIn, q, filter, setFilter }: { desk: Desk; day: string; list: Appt[]; onBook: (d: BookDraft) => void; onOpen: (id: string) => void; say: (s: string, undo?: () => void) => void;
  waiting: Appt[]; onSeat: (a: Appt) => void; onWalkIn: () => void; q: string; filter: string; setFilter: (f: string) => void }) {
  const [waitOpen, setWaitOpen] = useState(false);
  const t = useTranslations("calendar");
  const isToday0 = day === dayKey(new Date());
  useTick(isToday0 ? 1000 : 30_000);
  const [rowH, setRowH] = useStored("nailpos.calRowH", () => ({ i: 1 }));
  const PX = ROW_PX[rowH.i] ?? 1.1;
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropAt, setDropAt] = useState<{ col: number; m: number } | null>(null);
  const [cat, setCat] = useState("");
  const [avail, setAvail] = useState<"all" | "avail" | "working" | "out">("all");
  const [phoneCol, setPhoneCol] = useState(0);
  const isToday = day === dayKey(new Date());
  const nowM = nowMin();
  const dayStart = fromDayKey(day).getTime();
  const dayList = list.filter((a) => dayKey(new Date(a.start)) === day);
  // Grid hours: 9 AM – 7 PM, stretched to fit any booking outside that.
  const H0 = Math.min(9 * 60, ...dayList.map((a) => Math.floor(minutesOf(a.start) / 60) * 60));
  const H1 = Math.max(19 * 60, ...dayList.map((a) => Math.ceil(minutesOf(a.end) / 60) * 60));
  const techs = useMemo(() => desk.staff.filter((s) => s.role === "tech" || list.some((a) => a.staffId === s.id)), [desk.staff, list]);
  const busyNow = (id: string) => isToday && dayList.some((a) => a.staffId === id && live(a) && minutesOf(a.start) <= nowM && minutesOf(a.end) > nowM);
  const order = turnOrder(techs, isToday ? dayList : [], nowM);
  const next = isToday ? order.find((f) => f.clockedIn && f.busyUntil === null) : undefined;
  const nAvail = techs.filter((s) => s.clockedIn && !busyNow(s.id)).length, nWork = techs.filter((s) => s.clockedIn).length, nOut = techs.filter((s) => !s.clockedIn).length;
  const staff = techs.filter((s) => avail === "all" || (avail === "avail" ? s.clockedIn && !busyNow(s.id) : avail === "working" ? s.clockedIn : !s.clockedIn));
  const hasAny = dayList.some((a) => !a.staffId);
  const cols = useMemo(() => [...staff.map((s) => ({ id: s.id, name: s.name, on: s.clockedIn })), ...(hasAny ? [{ id: ANY, name: t("anyone"), on: true }] : [])], [staff, hasAny, t]);
  const colOf = (a: Appt) => cols.findIndex((c) => c.id === (a.staffId ?? ANY));
  const kind = (a: Appt) => blockKind(a, isToday ? nowM : -1);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, online: 0, walk: 0, unconf: 0, conf: 0, here: 0, chair: 0, ready: 0, cancel: 0 };
    for (const a of dayList) {
      const k = kind(a);
      if (k !== "cancel") c.all++;
      if (ONLINE.has(a.source)) c.online++;
      if (a.source === "kiosk" || a.source === "walk_in") c.walk++;
      if (k in c) c[k]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayList, nowM]);
  const overlapIds = useMemo(() => {
    const out = new Set<string>();
    for (const c of cols) {
      const sp = dayList.filter((a) => (a.staffId ?? ANY) === c.id && live(a)).map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) }));
      overlapping(sp).forEach((x) => out.add(x));
    }
    return out;
  }, [dayList, cols]);
  const ql = q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
  const matches = (a: Appt) => {
    if (cat && !a.services.some((s) => desk.services.find((x) => x.id === s.serviceId || x.name === s.name)?.cat === cat)) return false;
    if (ql && !((a.client?.name ?? "").toLowerCase().includes(ql) || (qd.length >= 3 && (a.client?.phone ?? "").includes(qd))
      || (desk.staff.find((s) => s.id === a.staffId)?.name ?? "").toLowerCase().includes(ql))) return false;
    if (filter === "all") return true;
    if (filter === "overlap") return overlapIds.has(a.id);
    if (filter === "online") return ONLINE.has(a.source);
    if (filter === "walk") return a.source === "kiosk" || a.source === "walk_in";
    return kind(a) === filter;
  };
  const colW = () => (gridRef.current?.clientWidth ?? 800) / Math.max(1, cols.length);
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches;

  const yMin = (clientY: number) => { const r = gridRef.current!.getBoundingClientRect(); return H0 + (clientY - r.top) / PX; };
  const xCol = (clientX: number) => { const r = gridRef.current!.getBoundingClientRect(); return clamp(Math.floor((clientX - r.left) / colW()), 0, cols.length - 1); };

  // Touch (iPad/phone): nothing happens on a swipe, so scrolling never books or moves by mistake.
  // Hold ~0.45 s (small buzz) → then drag. Tap a booking = open it; tap empty time = a hint.
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean; tap?: () => void; pid: number } | null>(null);
  const stopScroll = useCallback((ev: TouchEvent) => { if (ev.cancelable) ev.preventDefault(); }, []);
  const holdStart = (e: React.PointerEvent, fire: () => void, tap?: () => void) => {
    const h: NonNullable<typeof hold.current> = { x: e.clientX, y: e.clientY, fired: false, tap, pid: e.pointerId };
    h.timer = setTimeout(() => {
      h.fired = true;
      navigator.vibrate?.(15);
      try { gridRef.current?.setPointerCapture(h.pid); } catch { /* pointer already gone */ }
      document.addEventListener("touchmove", stopScroll, { passive: false });
      fire();
    }, 450);
    hold.current = h;
  };
  const holdEnd = () => { const h = hold.current; hold.current = null; if (h?.timer) clearTimeout(h.timer); document.removeEventListener("touchmove", stopScroll); return h; };
  useEffect(() => () => document.removeEventListener("touchmove", stopScroll), [stopScroll]);
  const [menu, setMenu] = useState<{ x: number; y: number; id?: string; col?: number; m?: number } | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const router = useRouter();

  const onGridDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    if ((e.target as HTMLElement).closest(".cb")) return;
    const m = snap(yMin(e.clientY) - 7, 15);
    const col = narrow ? phoneCol : xCol(e.clientX);
    if (e.pointerType === "touch") { holdStart(e, () => setDrag({ kind: "new", col, a: m, b: m + 45, touch: true }), () => say(t("holdHint"))); return; }
    gridRef.current!.setPointerCapture(e.pointerId);
    setDrag({ kind: "new", col, a: m, b: m + 15 });
  };
  const onMove = (e: React.PointerEvent) => {
    const h = hold.current;
    if (h && !h.fired) { if (Math.abs(e.clientX - h.x) + Math.abs(e.clientY - h.y) > 10) holdEnd(); return; }
    if (!drag) return;
    if (drag.kind === "new") { if (drag.touch && h && Math.abs(e.clientY - h.y) < 8) return; setDrag({ ...drag, b: Math.max(drag.a + 15, snap(yMin(e.clientY), 15)) }); }
    else if (drag.kind === "move") {
      const dy = snap((e.clientY - drag.y0) / PX, 15), dcol = narrow ? 0 : Math.round((e.clientX - drag.x0) / colW());
      setDrag({ ...drag, dy, dcol, moved: drag.moved || Math.abs(e.clientY - drag.y0) > 4 || Math.abs(e.clientX - drag.x0) > 6 });
    } else setDrag({ ...drag, dy: snap((e.clientY - drag.y0) / PX, 15) });
  };
  const onUp = (ev?: React.PointerEvent) => {
    const h = holdEnd();
    if (h && !h.fired) { setDrag(null); h.tap?.(); return; }
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
    if (d.kind === "move" && !d.moved) { if (h?.fired && ev) setMenu({ x: ev.clientX, y: ev.clientY, id: a.id }); else onOpen(a.id); return; }
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
  const freeN = order.filter((f) => f.clockedIn && f.busyUntil === null).length;
  const cats = [...new Set(desk.services.map((s) => s.cat))];

  // Drag a walk-in from the waitlist onto a column → seated with that tech at that time.
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("text/walkin")) return;
    e.preventDefault();
    setDropAt({ col: narrow ? phoneCol : xCol(e.clientX), m: clamp(snap(yMin(e.clientY), 15), H0, H1 - 15) });
  };
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData("text/walkin");
    const at0 = dropAt;
    setDropAt(null);
    const a = waiting.find((x) => x.id === id);
    const c = at0 ? cols[at0.col] : null;
    if (!a || !c || c.id === ANY || !at0) return;
    e.preventDefault();
    const before = { ...a };
    seatAppt(desk, a, c.id, at(day, at0.m));
    say(t("droppedMsg", { name: a.client?.name || t("walkIn"), staff: c.name, time: fmtMin(at0.m) }), () => putAppt(before));
  };

  return (
    <main className="cal-main">
      <aside className="cal-left">
        {isToday && <Waitlist waiting={waiting} onSeat={onSeat} onWalkIn={onWalkIn} />}
        <div style={{ flex: 1 }} />
        <MiniMonth day={day} list={list} />
      </aside>
      <section className="cal-center">
        <div className="cal-filters">
          <select className="cal-svc" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("serviceAny")}>
            <option value="">{t("serviceAny")}</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="seg cal-avail">{([["all", t("fAll", { n: techs.length })], ["avail", t("fAvail", { n: nAvail })], ["working", t("fWorking", { n: nWork })], ["out", t("fNotIn", { n: nOut })]] as const).map(([k, label]) => (
            <button key={k} type="button" className={avail === k ? "on" : ""} aria-pressed={avail === k} onClick={() => setAvail(k)}>{label}</button>))}</span>
          <span className="cap cal-rowlbl">{t("rowH")}</span>
          <span className="seg cal-avail" data-testid="row-height">{ROW_LBL.map((l, i) => (
            <button key={l} type="button" className={rowH.i === i ? "on" : ""} aria-pressed={rowH.i === i} onClick={() => setRowH({ i })}>{l}</button>))}</span>
          <span style={{ flex: 1 }} />
        </div>
        <div className="cal-counts" role="toolbar" aria-label={t("filter")}>
          <span className="cal-cscroll">
          {COUNTS.map(([k, , color]) => (
            <button key={k} type="button" className={`cal-cnt ${filter === k ? "on" : ""}`} aria-pressed={filter === k} title={t(`ct_${k}`)} data-testid={`count-${k}`}
              onClick={() => setFilter(filter === k || k === "all" ? "all" : k)}>
              {color && <i className="cal-cdot" style={{ background: color }} />}{t(`p_${k}`)}<span className="cal-cn">{counts[k]}</span></button>))}
          {isToday && <button type="button" className={`cal-cnt cal-waitpill ${waiting.length ? "on" : ""}`} onClick={() => setWaitOpen(true)} data-testid="wait-pill">
            {t("waitingN", { n: waiting.length })}</button>}
          </span>
          <span className="cal-key" tabIndex={0} aria-label={t("keyTitle")} data-testid="cal-key">
            <span className="cal-keysw" aria-hidden><i className="unconf" /><i className="conf" /><i className="chair" /><i className="ready" /></span>{t("key")}
            <span className="cal-keypop card" role="tooltip">
              <b className="eyebrow">{t("keyTitle")}</b>
              {(["unconf", "conf", "here", "chair", "ready", "paid", "cancel"] as const).map((k) => (
                <span key={k} className="cal-kr"><i className={k} /><span><b>{t(`ct_${k}`)}</b>{t(`key_${k}`)}</span></span>))}
              <span className="cap" style={{ marginTop: 6 }}>{t("key_src")}</span>
              <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{["srcTagOnline", "srcTagPhone", "srcTagDesk", "srcTagWalk"].map((k) => <span key={k} className={`cb-src ${k === "srcTagOnline" ? "web" : k === "srcTagWalk" ? "walk" : ""}`} style={{ position: "static" }}>{t(k)}</span>)}</span>
            </span>
          </span>
        </div>
        {narrow && <div className="cal-phonestaff">{cols.map((c, i) => <button key={c.id} type="button" className={`chip ${i === phoneCol ? "on" : ""}`} onClick={() => setPhoneCol(i)}>{c.name}</button>)}</div>}
        <div className="cal-scroll">
        <div className="cal-inner" style={{ minWidth: narrow ? undefined : `max(100%, ${52 + shown.length * MIN_COL}px)` }}>
        <div className="cal-heads" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
          {shown.map((c) => {
            const s = desk.staff.find((x) => x.id === c.id);
            const appts = dayList.filter((a) => (a.staffId ?? ANY) === c.id && live(a)).length;
            const late = !!s && !c.on && appts > 0 && isToday;
            const curA = isToday ? dayList.find((a) => a.staffId === c.id && live(a) && minutesOf(a.start) <= nowM && minutesOf(a.end) > nowM) : undefined;
            const dot = !c.on ? "#8E8E93" : curA ? "#2A55B0" : "#2F9E44";
            const sub = !s ? "" : !c.on ? t("notInSub", { a: appts }) : curA ? t("headBusy", { left: `${minutesOf(curA.end) - nowM} min`, t: s.turns }) : isToday ? t("headFree", { t: s.turns }) : t("headSub", { t: s.turns, a: appts });
            return (
              <div key={c.id} className={`cal-head ${late ? "late" : ""}`} data-testid={`head-${c.name}`}>
                <span className="av" style={{ width: 28, height: 28, fontSize: 12, boxShadow: c.id !== ANY ? `0 0 0 2px #fff, 0 0 0 3.5px ${dot}` : undefined }}>{c.name[0]}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b className="cal-hname">{c.name}{next?.id === c.id && <span className="tag jade cal-next">{t("next")}</span>}</b>
                  {s && <span className="cal-hsub" style={{ color: curA ? "#2A55B0" : undefined }}>{sub}</span>}</span>
              </div>);
          })}
        </div>
        <div className="cal-body">
          <div className="cal-hours" style={{ height: (H1 - H0) * PX }}>
            {Array.from({ length: (H1 - H0) / 60 + 1 }, (_, i) => <div key={i} className="cal-hl" style={{ top: i * 60 * PX }}>{fmtMin(H0 + i * 60).replace(":00", "")}</div>)}
            {isToday && nowM >= H0 && nowM <= H1 && <div className="cal-nowlbl" style={{ top: (nowM - H0) * PX }}>{fmtMin(nowM).replace(/ [AP]M$/, "")}</div>}
          </div>
          <div ref={gridRef} className="cal-grid" style={{ height: (H1 - H0) * PX }} data-testid="cal-grid"
            onPointerDown={onGridDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { if (hold.current?.fired) return; holdEnd(); setDrag(null); }}
            onContextMenu={(e) => { e.preventDefault(); if (hold.current || (e.target as HTMLElement).closest(".cb")) return;
              setMenu({ x: e.clientX, y: e.clientY, col: narrow ? phoneCol : xCol(e.clientX), m: clamp(snap(yMin(e.clientY) - 7, 15), H0, H1 - 15) }); }}
            onDragOver={onDragOver} onDragLeave={() => setDropAt(null)} onDrop={onDrop}>
            {Array.from({ length: (H1 - H0) / 30 }, (_, i) => <div key={i} className={i % 2 ? "cal-half" : "cal-hr"} style={{ top: i * 30 * PX }} />)}
            {shown.map((_, i) => i > 0 && <div key={i} className="cal-vl" style={{ left: `${(i / shown.length) * 100}%` }} />)}
            {shown.map((c, i) => { const w = 100 / shown.length; return !c.on && c.id !== ANY && isToday && dayList.some((a) => a.staffId === c.id && live(a))
              ? <div key={`late-${c.id}`} className="cal-latecol" style={{ left: `${i * w}%`, width: `${w}%` }} /> : null; })}
            {shown.map((c, ci) => {
              const mine = dayList.filter((a) => (a.staffId ?? ANY) === c.id);
              const ln = lanes(mine.map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) })));
              return mine.map((a) => {
                let s = minutesOf(a.start), e = minutesOf(a.end), col = ci;
                if (drag && drag.kind !== "new" && drag.id === a.id) {
                  if (drag.kind === "move") { s += drag.dy; e += drag.dy; col = narrow ? ci : clamp(colOf(a) + drag.dcol, 0, cols.length - 1); }
                  else e = Math.max(s + 15, e + drag.dy);
                }
                const L = ln[a.id] ?? { lane: 0, lanes: 1 };
                const w = 100 / shown.length;
                const st = statusOf(a);
                const k = kind(a);
                const tk = a.ticketId ? getTicket(a.ticketId) : undefined;
                const svc = a.services.map((x) => x.name).join(" + ");
                const usual = minutesOf(a.end) - minutesOf(a.start);
                const inFor = isToday ? Math.max(0, nowM - minutesOf(a.start)) : 0;
                const leftS = isToday ? Math.round(dayStart + minutesOf(a.end) * 60_000 - Date.now()) / 1000 : 0;
                const status = overlapIds.has(a.id) && live(a) ? `⚠ ${t("overlap")}`
                  : k === "here" ? t("stx_here", { min: Math.max(0, Math.round((Date.now() - new Date(a.arrivedAt!).getTime()) / 60_000)) })
                  : k === "chair" && isToday ? (leftS >= 0 ? t("stx_left", { t: mmss(leftS) }) : t("stx_over", { t: mmss(-leftS) }))
                  : k === "chair" ? t("stx_chair", { min: inFor, usual })
                  : k === "ready" ? t("stx_ready", { amt: formatCents(tk ? totals(tk).toPay : a.services.reduce((x, y) => x + y.cents, 0)).replace(/\.00$/, "") })
                  : k === "paid" ? t("stx_paid", { how: payHow(tk, t) })
                  : k === "cancel" ? (st === "no_show" ? t("stx_noshow") : t("stx_cancel"))
                  : k === "conf" ? t("stx_conf") : t("stx_unconf");
                const srcTag = ONLINE.has(a.source) ? ["web", t("srcTagOnline")] : a.source === "kiosk" || a.source === "walk_in" ? ["walk", t("srcTagWalk")]
                  : a.source === "phone" ? ["", t("srcTagPhone")] : ["", t("srcTagDesk")];
                return (
                  <div key={a.id} className={`cb ${k} ${a.source === "kiosk" || a.source === "walk_in" ? "walk" : ""} ${(e - s) < 30 ? "xs" : ""} ${drag && drag.kind !== "new" && drag.id === a.id ? "drag" : ""} ${matches(a) ? "" : "dim"}`}
                    style={{ top: (s - H0) * PX + 1, height: Math.max(22, (e - s) * PX - 2), left: `calc(${col * w + (L.lane * w) / L.lanes}% + 3px)`, width: `calc(${w / L.lanes}% - 6px)` }}
                    data-testid="cal-block" data-name={a.client?.name ?? ""} role="button" tabIndex={0} aria-label={`${a.client?.name ?? t("walkIn")} ${fmtMin(s)}`}
                    onKeyDown={(ev) => ev.key === "Enter" && onOpen(a.id)}
                    onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); if (!hold.current) setMenu({ x: ev.clientX, y: ev.clientY, id: a.id }); }}
                    onPointerDown={(ev) => {
                      if (ev.button === 2) return;
                      ev.stopPropagation();
                      if (st === "done" || st === "canceled" || st === "no_show") { if (ev.pointerType === "touch") holdStart(ev, () => { /* nothing to move */ }, () => onOpen(a.id)); else onOpen(a.id); return; }
                      const resize = (ev.target as HTMLElement).classList.contains("cb-rs");
                      const d0: Drag = resize ? { kind: "resize", id: a.id, y0: ev.clientY, start: s, dur: e - s, dy: 0 }
                        : { kind: "move", id: a.id, y0: ev.clientY, x0: ev.clientX, start: s, dur: e - s, col: colOf(a), dy: 0, dcol: 0, moved: false };
                      if (ev.pointerType === "touch") { holdStart(ev, () => setDrag(d0), () => onOpen(a.id)); return; }
                      gridRef.current!.setPointerCapture(ev.pointerId);
                      setDrag(d0);
                    }}>
                    <b>{a.client?.care ? "▲ " : ""}{a.client?.name || t("walkIn")}</b>
                    {(e - s) >= 30 && L.lanes === 1 && <span className={`cb-src ${srcTag[0]}`}>{srcTag[1]}</span>}
                    <span className="m">{svc}{svc ? " · " : ""}{fmtMin(s).replace(/ [AP]M$/, "")}</span>
                    <span className="s">{status}</span>
                    {k === "chair" && <span className="pb" style={{ width: `${Math.min(100, Math.round((inFor / Math.max(1, usual)) * 100))}%` }} />}
                    <span className="cb-rs" aria-hidden />
                  </div>
                );
              });
            })}
            {drag?.kind === "new" && (() => { const ci = narrow ? 0 : drag.col, w = 100 / shown.length; return (
              <div className="cb ghost" style={{ top: (drag.a - H0) * PX, height: (drag.b - drag.a) * PX, left: `calc(${ci * w}% + 3px)`, width: `calc(${w}% - 6px)` }}>
                <b>{fmtMin(drag.a)} – {fmtMin(drag.b)}</b></div>); })()}
            {dropAt && (() => { const ci = narrow ? 0 : dropAt.col, w = 100 / shown.length; return (
              <div className="cb ghost" style={{ top: (dropAt.m - H0) * PX, height: 45 * PX, left: `calc(${ci * w}% + 3px)`, width: `calc(${w}% - 6px)` }}>
                <b>{cols[dropAt.col]?.name} · {fmtMin(dropAt.m)}</b></div>); })()}
            {isToday && nowM >= H0 && nowM <= H1 && <div className="cal-now" style={{ top: (nowM - H0) * PX }} />}
          </div>
        </div>
        </div>
        </div>
        <div className="cap cal-foot cal-hint">{t("hint")}</div>
      </section>
      <aside className="cal-right">
        <div style={{ display: "flex", alignItems: "center" }}><b style={{ fontSize: 15, flex: 1 }}>{t("upNext")}</b><span className="tag jade">{t("freeNow", { n: freeN })}</span></div>
        <div className="cap" style={{ marginTop: -4 }}>{t("turnFacts")}</div>
        {order.map((f) => {
          const free = f.clockedIn && f.busyUntil === null;
          const tag = !f.clockedIn ? t("tagOut") : free ? t("tagFree") : t("tagBusy");
          const sub = !f.clockedIn ? t("notInTurns", { n: f.turns }) : !free ? t("freeAtTurns", { time: fmtMin(f.busyUntil!).replace(/ [AP]M$/, ""), n: f.turns })
            : f.freeSince ? t("openFor", { min: nowM - f.freeSince, n: f.turns }) : t("freeTurns", { n: f.turns });
          return (
            <div key={f.id} className={`cal-ucard ${free ? "free" : ""} ${f.clockedIn ? "" : "out"}`} data-testid={`up-${f.name}`}>
              <span className="cal-dot" style={{ width: 8, height: 8, background: !f.clockedIn ? "#8E8E93" : free ? "#2F9E44" : "#E03131" }} />
              <span style={{ flex: 1, minWidth: 0 }}><b>{f.name}</b> <span className={`cal-utag ${!f.clockedIn ? "out" : free ? "free" : "busy"}`}>{tag}</span>
                <span className="cap" style={{ display: "block", fontSize: 12 }}>{sub}</span></span>
              {f.clockedIn && <Button size="sm" onClick={() => onBook({ day, start: snap(clamp(f.busyUntil ?? nowM, H0, H1 - 60), 15), minutes: 45, staffId: f.id })}>{t("bookShort")}</Button>}
            </div>);
        })}
        <div style={{ flex: 1 }} />
        <div className="cap cal-keys">{t("shortcuts")} <span className="kbd">N</span> {t("kNew")} · <span className="kbd">T</span> {t("kToday")} · <span className="kbd">←</span><span className="kbd">→</span> {t("kDay")} · <span className="kbd">/</span> {t("kSearch")}</div>
      </aside>
      {menu && (() => {
        const items: { label: string; run: () => void; danger?: boolean }[] = [];
        const go2 = (f: () => void) => () => { setMenu(null); f(); };
        let title = "";
        if (menu.id) {
          const a = list.find((x) => x.id === menu.id);
          if (a) {
            const st = statusOf(a), before = { ...a }, nm = a.client?.name || t("walkIn"), s0 = minutesOf(a.start), e0 = minutesOf(a.end);
            const put = (patch: Partial<Appt>, msg: string) => { putAppt({ ...a, ...patch }); say(msg, () => putAppt(before)); };
            title = `${nm} · ${fmtMin(s0)}`;
            items.push({ label: t("m_open"), run: go2(() => onOpen(a.id)) });
            if ((st === "booked" || st === "confirmed") && !isHere(a) && a.source !== "kiosk" && a.source !== "walk_in")
              items.push({ label: t("hereBtn"), run: go2(() => put({ arrivedAt: new Date().toISOString() }, t("hereMsg", { name: nm }))) });
            if (st === "booked" || st === "confirmed") items.push({ label: t("startService"), run: go2(() => { const id = ticketFor(desk, a, a.staffId ?? null); putAppt({ ...a, status: "arrived", ticketId: id }); router.push(`/checkout/${id}`); }) });
            if (st === "booked") items.push({ label: t("confirm"), run: go2(() => put({ status: "confirmed" }, t("confirmedMsg"))) });
            if (st === "booked" || st === "confirmed" || st === "arrived") {
              items.push({ label: t("m_later"), run: go2(() => put({ start: at(day, s0 + 15), end: at(day, e0 + 15) }, t("m_movedMsg", { name: nm, time: fmtMin(s0 + 15) }))) });
              items.push({ label: t("m_earlier"), run: go2(() => put({ start: at(day, Math.max(H0, s0 - 15)), end: at(day, Math.max(H0, s0 - 15) + e0 - s0) }, t("m_movedMsg", { name: nm, time: fmtMin(Math.max(H0, s0 - 15)) }))) });
              items.push({ label: t("m_longer"), run: go2(() => put({ end: at(day, e0 + 15) }, t("resized", { name: nm, min: e0 - s0 + 15 }))) });
              items.push({ label: t("m_move"), run: go2(() => setMoveId(a.id)) });
            }
            if (st === "booked" || st === "confirmed") {
              items.push({ label: t("noShow"), run: go2(() => put({ status: "no_show" }, t("noShowMsg"))) });
              items.push({ label: t("cancel"), danger: true, run: go2(() => put({ status: "canceled" }, t("canceledMsg"))) });
            }
          }
        } else if (menu.col !== undefined && menu.m !== undefined) {
          const c = cols[menu.col], m = menu.m;
          title = `${c?.name ?? ""} · ${fmtMin(m)}`;
          items.push({ label: t("m_newHere"), run: go2(() => onBook({ day, start: m, minutes: 45, staffId: c && c.id !== ANY ? c.id : undefined })) });
          if (c && c.id !== ANY) for (const w of waiting.slice(0, 2)) items.push({ label: t("m_seatHere", { name: w.client?.name || t("walkIn") }), run: go2(() => {
            const b = { ...w }; seatAppt(desk, w, c.id, at(day, m)); say(t("droppedMsg", { name: w.client?.name || t("walkIn"), staff: c.name, time: fmtMin(m) }), () => putAppt(b)); }) });
        }
        if (!items.length) return null;
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200, vh = typeof window !== "undefined" ? window.innerHeight : 800;
        return <>
          <button type="button" className="cal-mscrim" aria-label={t("close")} onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="cal-menu card" role="menu" aria-label={title} style={{ left: Math.max(8, Math.min(menu.x, vw - 250)), top: Math.max(8, Math.min(menu.y, vh - 40 - items.length * 36)) }} data-testid="cal-menu">
            <div className="cal-menuh">{title}</div>
            {items.map((x) => <button key={x.label} type="button" role="menuitem" className={`cal-mi ${x.danger ? "danger" : ""}`} onClick={x.run}>{x.label}</button>)}
          </div>
        </>;
      })()}
      {moveId && (() => {
        const a = list.find((x) => x.id === moveId);
        if (!a) return null;
        const s0 = minutesOf(a.start), e0 = minutesOf(a.end), ci = colOf(a);
        const put = (patch: Partial<Appt>) => putAppt({ ...a, ...patch });
        const toCol = (k: number) => { const c = cols[clamp(ci + k, 0, cols.length - 1)]; if (c) put({ staffId: c.id === ANY ? null : c.id }); };
        return (
          <div className="cal-movebar" role="toolbar" aria-label={t("m_move")} data-testid="move-bar">
            <span className="cal-mvt"><b>{a.client?.name || t("walkIn")}</b> · {fmtMin(s0)} · {desk.staff.find((x) => x.id === a.staffId)?.name ?? t("anyone")}</span>
            <button type="button" aria-label={t("mv_earlier")} onClick={() => put({ start: at(day, Math.max(H0, s0 - 15)), end: at(day, Math.max(H0, s0 - 15) + e0 - s0) })}>↑ 15</button>
            <button type="button" aria-label={t("mv_later")} onClick={() => put({ start: at(day, s0 + 15), end: at(day, e0 + 15) })}>↓ 15</button>
            {!narrow && <button type="button" aria-label={t("mv_left")} onClick={() => toCol(-1)}>◀</button>}
            {!narrow && <button type="button" aria-label={t("mv_right")} onClick={() => toCol(1)}>▶</button>}
            <button type="button" aria-label={t("mv_shorter")} onClick={() => put({ end: at(day, Math.max(s0 + 15, e0 - 15)) })}>−15m</button>
            <button type="button" aria-label={t("mv_longer")} onClick={() => put({ end: at(day, e0 + 15) })}>+15m</button>
            <button type="button" className="on" onClick={() => { setMoveId(null); say(t("m_movedMsg", { name: a.client?.name || t("walkIn"), time: fmtMin(s0) })); }}>{t("mv_done")}</button>
          </div>);
      })()}
      {waitOpen && <Drawer title={t("waitlist")} onClose={() => setWaitOpen(false)}>
        <Waitlist waiting={waiting} onSeat={(a) => { setWaitOpen(false); onSeat(a); }} onWalkIn={() => { setWaitOpen(false); onWalkIn(); }} />
      </Drawer>}
    </main>
  );
}

const ONLINE = new Set(["web", "google", "website", "instagram", "qr", "text"]);
const COUNTS: [string, string, string][] = [["all", "", ""], ["unconf", "", "#D9A979"], ["conf", "", "#B8B8C0"], ["here", "", "#1F7A33"], ["chair", "", "#2F9E44"], ["ready", "", "#E8590C"], ["cancel", "", "#C92A2A"], ["online", "", "#2A55B0"], ["walk", "", "#B35C00"]];
/** Timeline row height (px per minute), picked per device: S · M · L · XL. */
const ROW_PX = [0.8, 1.1, 1.6, 2.2];
const ROW_LBL = ["S", "M", "L", "XL"];
/** Min width per staff column: with 10–20 techs the grid scrolls sideways instead of squashing names. */
const MIN_COL = 140;
const mmss = (sec: number) => { const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(x).padStart(2, "0")}`; };
/** Block look (Booking board Cal): unconf · conf · chair (in now) · ready (time's up, not paid) · paid · cancel. */
export function blockKind(a: Appt, nowM: number): string {
  const st = statusOf(a);
  if (st === "canceled" || st === "no_show") return "cancel";
  if (st === "done") return "paid";
  if (st === "arrived") return nowM >= 0 && minutesOf(a.end) <= nowM ? "ready" : "chair";
  if (isHere(a)) return "here";
  return st === "confirmed" ? "conf" : "unconf";
}
function payHow(tk: ReturnType<typeof getTicket>, t: (k: "paidCard" | "paidCash" | "paidGift") => string) {
  const m = tk?.payment?.method;
  return m === "cash" ? t("paidCash") : m ? t("paidCard") : tk?.giftPays?.length ? t("paidGift") : t("paidCard");
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
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((x, i) => <span key={i} className="cap">{x}</span>)}
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

