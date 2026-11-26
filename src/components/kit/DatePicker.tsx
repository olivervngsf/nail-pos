"use client";
// Kit date pickers (Nov 26): ONE look for every date in the app, never the browser's own date box.
// Pattern = shadcn/ui date picker (a button that opens a month grid in a popover), drawn with kit.css `.dp-*`.
//   <DatePicker>       one day        (value "YYYY-MM-DD", "" = none)
//   <DateRangePicker>  first → last   (presets on the left, Apply / Cancel)
//   <MonthPicker>      ‹ October 2026 › (value "YYYY-MM-01"; tap the name for a month grid)
// Phones (<600px): the popover is a sheet from the bottom with 44px days. Keys: arrows, PageUp/Down, Enter, Esc.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { backDays, weekdayOrder, type WeekStart } from "@/lib/weekStart";
import { useWeekStart } from "@/lib/useWeekStart";
import { useLocale, useTranslations } from "next-intl";

/* ---------- day math on "YYYY-MM-DD" strings (UTC, so time zones never shift a day) ---------- */
const toD = (s: string) => new Date(`${s}T00:00:00Z`);
const toS = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysIso = (s: string, n: number) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return toS(d); };
const addMonths = (s: string, n: number) => { const d = toD(s.slice(0, 7) + "-01"); d.setUTCMonth(d.getUTCMonth() + n); return toS(d); };
const monthOf = (s: string) => s.slice(0, 7) + "-01";
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysBetween = (a: string, b: string) => Math.round((toD(b).getTime() - toD(a).getTime()) / 864e5);
const inRange = (s: string, min?: string, max?: string) => (!min || s >= min) && (!max || s <= max);
/** 42 days (6 weeks, first day = the salon's week start) covering the month of `month`. */
function grid(month: string, ws: WeekStart) {
  const first = toD(monthOf(month));
  const start = addDaysIso(toS(first), -backDays(first.getUTCDay(), ws));
  return Array.from({ length: 42 }, (_, i) => addDaysIso(start, i));
}

function useFmt() {
  const locale = useLocale();
  return useMemo(() => {
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o });
    const day = f({ month: "short", day: "numeric", year: "numeric" });
    const month = f({ month: "long", year: "numeric" });
    const mShort = f({ month: "short" });
    const wd = f({ weekday: "narrow" });
    const full = f({ weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return {
      day: (s: string) => day.format(toD(s)),
      full: (s: string) => full.format(toD(s)),
      month: (s: string) => month.format(toD(monthOf(s))),
      mShort: (m: number) => mShort.format(new Date(Date.UTC(2026, m, 1))),
      weekday: (dow: number) => wd.format(new Date(Date.UTC(2026, 10, 1 + dow))), // Nov 1 2026 = Sunday
      range: (a: string, b: string) => (a === b ? day.format(toD(a)) : (day as Intl.DateTimeFormat & { formatRange?: (x: Date, y: Date) => string }).formatRange?.(toD(a), toD(b)) ?? `${day.format(toD(a))} – ${day.format(toD(b))}`),
    };
  }, [locale]);
}

const CalIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
const Chev = () => <svg className="dp-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

/* ---------- popover: fixed under the button (flips up when there's no room), portal to <body> so drawers never cut it ---------- */
function Popover({ anchor, onClose, label, children }: { anchor: HTMLElement | null; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const place = useCallback(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect(), p = ref.current.getBoundingClientRect();
    const below = a.bottom + 6, above = a.top - 6 - p.height;
    const top = below + p.height <= window.innerHeight - 8 || above < 8 ? Math.max(8, Math.min(below, window.innerHeight - p.height - 8)) : above;
    setPos({ left: Math.max(8, Math.min(a.left, window.innerWidth - p.width - 8)), top });
  }, [anchor]);
  useLayoutEffect(place, [place, children]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); anchor?.focus(); } };
    window.addEventListener("keydown", k, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("keydown", k, true); window.removeEventListener("resize", place); };
  }, [onClose, place, anchor]);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("[data-focus]")?.focus(); }, []);
  return createPortal(
    <>
      <button type="button" className="dp-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={ref} className="dp-pop" role="dialog" aria-label={label} style={pos ?? { left: -9999, top: 0 }}>{children}</div>
    </>,
    document.body,
  );
}

/* ---------- one month grid (shared by single + range) ---------- */
function MonthGrid({ view, setView, min, max, isOn, band, onPick, onHover, focus, setFocus }: {
  view: string; setView: (m: string) => void; min?: string; max?: string;
  isOn: (s: string) => boolean; band?: (s: string) => "" | "band" | "band first" | "band last" | "band first last";
  onPick: (s: string) => void; onHover?: (s: string | null) => void; focus: string; setFocus: (s: string) => void;
}) {
  const t = useTranslations("picker");
  const fmt = useFmt();
  const today = localToday();
  const ws = useWeekStart();
  const days = grid(view, ws);
  const move = (s: string) => { const c = min && s < min ? min : max && s > max ? max : s; setFocus(c); if (monthOf(c) !== monthOf(view)) setView(monthOf(c)); };
  const onKey = (e: React.KeyboardEvent) => {
    const n = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    if (n) { e.preventDefault(); move(addDaysIso(focus, n)); }
    else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); move(addMonths(focus, e.key === "PageUp" ? -1 : 1).slice(0, 8) + focus.slice(8)); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); move(addDaysIso(focus, e.key === "Home" ? -backDays(toD(focus).getUTCDay(), ws) : 6 - backDays(toD(focus).getUTCDay(), ws))); }
  };
  useEffect(() => { document.querySelector<HTMLElement>(`.dp-pop [data-day="${focus}"]`)?.focus(); }, [focus]);
  return (
    <>
      <div className="dp-head">
        <b aria-live="polite">{fmt.month(view)}</b>
        <button type="button" className="dp-nav" aria-label={t("prevMonth")} disabled={!!min && monthOf(view) <= monthOf(min)} onClick={() => setView(addMonths(view, -1))}>‹</button>
        <button type="button" className="dp-nav" aria-label={t("nextMonth")} disabled={!!max && monthOf(view) >= monthOf(max)} onClick={() => setView(addMonths(view, 1))}>›</button>
      </div>
      <div className="dp-grid" role="grid" onKeyDown={onKey} onMouseLeave={() => onHover?.(null)}>
        {weekdayOrder(ws).map((d) => <div key={d} className="dp-wd" aria-hidden>{fmt.weekday(d)}</div>)}
        {days.map((s) => {
          const out = s.slice(0, 7) !== view.slice(0, 7);
          const ok = inRange(s, min, max);
          return (
            <div key={s} className={`dp-cell ${band?.(s) ?? ""}`}>
              <button type="button" data-day={s} tabIndex={s === focus ? 0 : -1} {...(s === focus ? { "data-focus": "" } : {})}
                className={`dp-day${out ? " out" : ""}${s === today ? " today" : ""}${isOn(s) ? " on" : ""}`}
                aria-label={fmt.full(s)} aria-pressed={isOn(s)} aria-current={s === today ? "date" : undefined} disabled={!ok}
                onClick={() => { setFocus(s); onPick(s); }} onMouseEnter={() => onHover?.(s)}>{Number(s.slice(8))}</button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- <DatePicker>: one day ---------- */
export function DatePicker({ value, onChange, min, max, label, placeholder, clearable, block, id, "data-testid": testId }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; label: string;
  placeholder?: string; clearable?: boolean; block?: boolean; id?: string; "data-testid"?: string;
}) {
  const t = useTranslations("picker");
  const fmt = useFmt();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const start = value || (max && localToday() > max ? max : localToday());
  const [view, setView] = useState(monthOf(start));
  const [focus, setFocus] = useState(start);
  const show = () => { setView(monthOf(start)); setFocus(start); setOpen(true); };
  const close = useCallback(() => setOpen(false), []);
  const pick = (s: string) => { onChange(s); setOpen(false); btn.current?.focus(); };
  const today = localToday();
  return (
    <>
      <button ref={btn} id={id} type="button" className={`dp-btn${block ? " block" : ""}`} aria-label={`${label}: ${value ? fmt.full(value) : placeholder ?? t("pick")}`}
        aria-haspopup="dialog" aria-expanded={open} data-testid={testId} data-value={value} onClick={() => (open ? close() : show())}>
        <CalIcon />{value ? fmt.day(value) : <span className="dp-ph">{placeholder ?? t("pick")}</span>}<Chev />
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={close} label={label}>
          <div className="dp-main">
            <MonthGrid view={view} setView={setView} min={min} max={max} isOn={(s) => s === value} onPick={pick} focus={focus} setFocus={setFocus} />
            <div className="dp-foot">
              {clearable && value ? <button type="button" className="dp-link" onClick={() => pick("")}>{t("clear")}</button> : null}
              <span className="dp-sum" />
              {inRange(today, min, max) && <button type="button" className="dp-link" onClick={() => pick(today)}>{t("today")}</button>}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

/* ---------- <DateRangePicker>: first → last, with presets ---------- */
export type RangePreset = { key: string; label: string; from: string; to: string };
export function DateRangePicker({ from, to, onChange, min, max, presets = [], label, "data-testid": testId }: {
  from: string; to: string; onChange: (from: string, to: string, preset?: string) => void; min?: string; max?: string;
  presets?: RangePreset[]; label: string; "data-testid"?: string;
}) {
  const t = useTranslations("picker");
  const ws = useWeekStart();
  const fmt = useFmt();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(from);
  const [b, setB] = useState<string | null>(to);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(monthOf(to));
  const [focus, setFocus] = useState(to);
  const show = () => { setA(from); setB(to); setView(monthOf(to)); setFocus(to); setOpen(true); };
  const close = useCallback(() => setOpen(false), []);
  // While picking the last day, the band follows the mouse (preview).
  const [s0, s1] = b ? [a, b] : hover && hover < a ? [hover, a] : [a, hover ?? a];
  const pick = (s: string) => {
    if (b !== null) { setA(s); setB(null); return; } // start over
    if (s < a) { setB(a); setA(s); } else setB(s);
  };
  const apply = (f = a, l = b ?? a, key?: string) => { onChange(f, l, key); setOpen(false); btn.current?.focus(); };
  const band = (s: string) => {
    if (s < s0 || s > s1 || s0 === s1) return "" as const;
    const col = backDays(toD(s).getUTCDay(), ws); // 0 = first column of the row
    const first = s === s0 || col === 0, last = s === s1 || col === 6;
    return (first && last ? "band first last" : first ? "band first" : last ? "band last" : "band") as "band";
  };
  const on = presets.find((p) => p.from === from && p.to === to)?.key;
  const n = daysBetween(s0, s1) + 1;
  return (
    <>
      <button ref={btn} type="button" className="dp-btn" aria-label={`${label}: ${fmt.range(from, to)}`} aria-haspopup="dialog" aria-expanded={open}
        data-testid={testId} data-from={from} data-to={to} onClick={() => (open ? close() : show())}>
        <CalIcon />{fmt.range(from, to)}<Chev />
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={close} label={label}>
          {presets.length > 0 && (
            <div className="dp-presets" role="group" aria-label={t("quick")}>
              {presets.map((p) => <button key={p.key} type="button" className={p.key === on ? "on" : ""} data-testid={`dp-preset-${p.key}`} onClick={() => apply(p.from, p.to, p.key)}>{p.label}</button>)}
            </div>
          )}
          <div className="dp-main">
            <MonthGrid view={view} setView={setView} min={min} max={max} isOn={(s) => s === a || s === b} band={band}
              onPick={pick} onHover={b === null ? setHover : undefined} focus={focus} setFocus={setFocus} />
            <div className="dp-foot">
              <span className="dp-sum full" data-testid="dp-sum">{b === null ? t("pickLast") : `${fmt.range(a, b)} · ${t("days", { n })}`}</span>
              <span style={{ flex: 1 }} /><button type="button" className="dp-link" onClick={close}>{t("cancel")}</button>
              <button type="button" className="btn sm primary" disabled={b === null} data-testid="dp-apply" onClick={() => apply()}>{t("apply")}</button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

/* ---------- <MonthPicker>: ‹ October 2026 › ---------- */
export function MonthPicker({ value, onChange, min, max, label, "data-testid": testId }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; label: string; "data-testid"?: string;
}) {
  const t = useTranslations("picker");
  const fmt = useFmt();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const close = useCallback(() => setOpen(false), []);
  const v = monthOf(value);
  const ok = (m: string) => (!min || m >= monthOf(min)) && (!max || m <= monthOf(max));
  const now = monthOf(localToday());
  const pick = (m: string) => { onChange(m); setOpen(false); btn.current?.focus(); };
  return (
    <div className="dp-step" role="group" aria-label={label} data-testid={testId} data-value={v}>
      <button type="button" className="dp-nav" aria-label={t("prevMonth")} disabled={!ok(addMonths(v, -1))} onClick={() => onChange(addMonths(v, -1))}>‹</button>
      <button ref={btn} type="button" className="dp-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setYear(Number(v.slice(0, 4))); setOpen(!open); }}>{fmt.month(v)}</button>
      <button type="button" className="dp-nav" aria-label={t("nextMonth")} disabled={!ok(addMonths(v, 1))} onClick={() => onChange(addMonths(v, 1))}>›</button>
      {open && (
        <Popover anchor={btn.current} onClose={close} label={label}>
          <div className="dp-main">
            <div className="dp-head">
              <b>{year}</b>
              <button type="button" className="dp-nav" aria-label={t("prevYear")} disabled={!!min && year <= Number(min.slice(0, 4))} onClick={() => setYear(year - 1)}>‹</button>
              <button type="button" className="dp-nav" aria-label={t("nextYear")} disabled={!!max && year >= Number(max.slice(0, 4))} onClick={() => setYear(year + 1)}>›</button>
            </div>
            <div className="dp-months">
              {Array.from({ length: 12 }, (_, i) => {
                const m = `${year}-${String(i + 1).padStart(2, "0")}-01`;
                return <button key={m} type="button" className={`dp-mo${m === v ? " on" : ""}${m === now ? " today" : ""}`} disabled={!ok(m)} {...(m === v ? { "data-focus": "" } : {})} onClick={() => pick(m)}>{fmt.mShort(i)}</button>;
              })}
            </div>
            {ok(now) && <div className="dp-foot"><span className="dp-sum" /><button type="button" className="dp-link" onClick={() => pick(now)}>{t("thisMonth")}</button></div>}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** A form row: label above, full-width date button (like `Field`, for drawers + forms). */
export function DateField({ id, label, hint, ...p }: Omit<Parameters<typeof DatePicker>[0], "label" | "block"> & { id: string; label: string; hint?: string }) {
  return (
    <div>
      <label className="lbl" htmlFor={id}>{label}</label>
      <DatePicker id={id} label={label} block {...p} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
