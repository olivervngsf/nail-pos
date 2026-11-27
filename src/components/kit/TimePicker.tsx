"use client";
// Kit time picker (Nov 27): never the browser's own time list (on a Mac it fills the whole screen with 70+ rows).
// Pattern = Google Calendar / Calendly: a button that opens a SHORT scrolling list (about 7 rows),
// already scrolled to the picked time. `min` = only times after it (closing time after opening time).
// Phones (<600px): same list as a sheet from the bottom with 44px rows. Keys: ↑ ↓ Home End Enter Esc.
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "./DatePicker";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const fmt12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
/** "HH:MM" every `step` minutes from `from` to `to` (both "HH:MM"). */
export function timeList(from = "05:00", to = "23:00", step = 15) {
  const out: string[] = [];
  for (let m = mins(from); m <= mins(to); m += step) out.push(hhmm(m));
  return out;
}

const ClockIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
const Chev = () => <svg className="dp-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

export function TimePicker({ value, onChange, label, min, from, to, step, bad, className, "data-testid": testId }: {
  value: string; onChange: (v: string) => void; label: string;
  min?: string; from?: string; to?: string; step?: number; bad?: boolean; className?: string; "data-testid"?: string;
}) {
  const v = value.slice(0, 5);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useMemo(() => {
    const all = timeList(from, to, step).filter((t) => !min || t > min.slice(0, 5));
    return v && !all.includes(v) ? [...all, v].sort() : all;
  }, [from, to, step, min, v]);
  const [focus, setFocus] = useState(v);
  useEffect(() => { if (open) setFocus(list.includes(v) ? v : list[0]); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = useRef<HTMLDivElement>(null);
  // Open with the picked time in the middle of the list, no animation jump.
  useEffect(() => {
    if (!open) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-t="${focus}"]`);
    el?.focus({ preventScroll: true });
    if (el && box.current) {
      const b = box.current, top = el.offsetTop - b.clientHeight / 2 + el.offsetHeight / 2;
      if (el.offsetTop < b.scrollTop || el.offsetTop + el.offsetHeight > b.scrollTop + b.clientHeight || b.dataset.placed !== "1") b.scrollTop = Math.max(0, top);
      b.dataset.placed = "1";
    }
  }, [open, focus]);
  const close = () => { setOpen(false); btn.current?.focus(); };
  const pick = (t: string) => { onChange(t); close(); };
  const onKey = (e: React.KeyboardEvent) => {
    const i = list.indexOf(focus);
    const go = (n: number) => { e.preventDefault(); setFocus(list[Math.max(0, Math.min(list.length - 1, n))]); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "PageDown") go(i + 6);
    else if (e.key === "PageUp") go(i - 6);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(focus); }
  };
  return (
    <>
      <button ref={btn} type="button" className={`dp-btn tp-btn${bad ? " err" : ""}${className ? ` ${className}` : ""}`} aria-label={`${label}: ${v ? fmt12(v) : ""}`}
        aria-haspopup="listbox" aria-expanded={open} data-testid={testId} onClick={() => setOpen((o) => !o)}>
        <ClockIcon /><span>{v ? fmt12(v) : "—"}</span><Chev />
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={close} label={label}>
          <div className="tp-main">
            <div className="tp-title">{label}</div>
            <div ref={box} className="tp-list" role="listbox" aria-label={label} onKeyDown={onKey}>
              {list.map((t) => (
                <button key={t} type="button" role="option" data-t={t} aria-selected={t === v} tabIndex={t === focus ? 0 : -1}
                  className={`tp-opt${t === v ? " on" : ""}${t.endsWith(":00") ? " hr" : ""}`} onClick={() => pick(t)} onMouseEnter={() => setFocus(t)}>
                  {fmt12(t)}
                  {t === v && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
