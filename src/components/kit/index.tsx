"use client";
// One React component per Design System piece. They only put kit classes (design/kit/kit.css) on real elements:
// never add a look here; change the kit, then `npm run kit:sync`.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import RailAccount from "@/components/RailAccount";
import { useTranslations } from "next-intl";
import { getMenuHidden, onMenuHidden, setMenuHidden } from "@/lib/menuFold";
import { retryParked, subscribe, syncNow, type SyncState } from "@/lib/offline/outbox";
import { CreditRing } from "@/components/CreditRing";
import { hide, isHidden, unhide, type Keep } from "@/lib/banners";
import { collapseOut } from "@/lib/motion";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- controls ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost"; block?: boolean; size?: "sm" };
export function Button({ variant = "default", block, size, className, type = "button", ...p }: BtnProps) {
  return <button type={type} className={cx("btn", variant !== "default" && variant, block && "block", size, className)} {...p} />;
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? "on" : ""} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Chip({ on, suggested, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; suggested?: boolean }) {
  return <button type="button" aria-pressed={on} className={cx("chip", on && "on", suggested && "sug", className)} {...p} />;
}

export function Field({ label, hint, error, id, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; id: string }) {
  return (
    <div>
      <label className="lbl" htmlFor={id}>{label}</label>
      <input id={id} className={cx("inp", error && "err")} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-h` : undefined} {...p} />
      {(error || hint) && <div id={`${id}-h`} className={cx("hint", error && "err")}>{error ?? hint}</div>}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx("sw", on && "on")} onClick={() => onChange(!on)} />;
}

export function Stepper({ value, onChange, step = 1, min = -Infinity, max = Infinity, format = String, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format?: (v: number) => string; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <Button aria-label={`Less ${label}`} disabled={value - step < min} onClick={() => onChange(value - step)}>−</Button>
      <b aria-live="polite">{format(value)}</b>
      <Button aria-label={`More ${label}`} disabled={value + step > max} onClick={() => onChange(value + step)}>+</Button>
    </div>
  );
}

/** PIN pad (6 or 10 digits by salon rule; a person's older PIN keeps its own length). Calls onDone with all digits.
 *  A wrong PIN shakes the dots gently (and buzzes once on Android), every time, even when the message is the same. */
export function PinKeypad({ length = 6, onDone, error }: { length?: number; onDone: (pin: string) => void; error?: string }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(0);
  const [tries, setTries] = useState(0);
  const errRef = useRef(error);
  const lastShake = useRef(0);
  errRef.current = error;
  const nudge = () => {
    if (Date.now() - lastShake.current < 600) return;
    lastShake.current = Date.now();
    setShake((n) => n + 1);
    try { navigator.vibrate?.(40); } catch { /* not on this device */ }
  };
  useEffect(() => { if (error) nudge(); }, [error]);
  useEffect(() => { // same message twice still shakes: look again just after each try
    if (!tries) return;
    const h = setTimeout(() => { if (errRef.current) nudge(); }, 450);
    return () => clearTimeout(h);
  }, [tries]);
  const press = (k: string) => {
    if (k === "del") return setPin((p) => p.slice(0, -1));
    if (pin.length >= length) return;
    const v = pin + k;
    setPin(v);
    if (v.length === length) setTimeout(() => { onDone(v); setPin(""); setTries((n) => n + 1); }, 150);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div key={shake} className={cx("dots", shake > 0 && "shake")} data-shake={shake} aria-label={`${pin.length} of ${length} digits`}>{Array.from({ length }, (_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}</div>
      <div className="hint err" role="alert" style={{ textAlign: "center", minHeight: 18 }}>{error}</div>
      <div className="keys">
        {"123456789".split("").map((k) => <button key={k} type="button" className="key" onClick={() => press(k)}>{k}</button>)}
        <span />
        <button type="button" className="key" onClick={() => press("0")}>0</button>
        <button type="button" className="key" aria-label="Delete" style={{ fontSize: 16 }} onClick={() => press("del")}>⌫</button>
      </div>
    </div>
  );
}

/** A check mark that draws itself (paid, saved, clocked in). Static with reduced motion. */
export const DrawCheck = ({ size = 28, className }: { size?: number; className?: string }) => (
  <svg className={cx("drawck", className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
  </svg>
);

/* ---------- surfaces + lists ---------- */
export const Card = ({ pad, className, ...p }: React.HTMLAttributes<HTMLDivElement> & { pad?: boolean }) => <div className={cx("card", pad && "pad", className)} {...p} />;
export const ListGroup = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cx("group", className)} {...p} />;
export function Row({ size, title, sub, right, className, ...p }: Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & { size?: "xs" | "s" | "m" | "l"; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className={cx("row", size, className)} {...p}>
      <span className="g">{title}{sub && <span className="cap">{sub}</span>}</span>
      {right}
    </div>
  );
}
export const Tag = ({ tone, children }: { tone?: "jade"; children: ReactNode }) => <span className={cx("tag", tone)}>{children}</span>;
export const Avatar = ({ name, large, src, className }: { name: string; large?: boolean; src?: string; className?: string }) => (
  <span className={cx("av", large && "lg", src && "has-photo", className)} aria-hidden>
    {/* eslint-disable-next-line @next/next/no-img-element -- own profile photo (public link or data: URL) */}
    {src ? <img src={src} alt="" /> : name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"}
  </span>
);
export const StatusPill = ({ tone, children }: { tone?: "ok" | "warn"; children: ReactNode }) => (
  <span className={cx("pill", tone)}>{tone === "warn" ? <span aria-hidden>▲</span> : <span className="dot" aria-hidden />}{children}</span>
);
export function StatTile({ label, value, trend, on, onClick }: { label: string; value: ReactNode; trend?: { text: string; up: boolean }; on?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={cx("stat", on && "on")} aria-pressed={on} onClick={onClick}>
      <span className="cap">{label}</span>
      <span className="v">{value}</span>
      {trend && <span className={trend.up ? "up" : "down"}>{trend.up ? "▲" : "▼"} {trend.text}</span>}
    </button>
  );
}
export const ProgressBar = ({ value, thickness, ink, label }: { value: number; thickness?: "thin" | "thick"; ink?: boolean; label: string }) => (
  <div className={cx("prog-bar", thickness, ink && "ink")} role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
    <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
  </div>
);
export function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="dtable">
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}
/** This period (ink) vs last (grey), heights 0..1. */
export function MiniBars({ bars, label }: { bars: { label: string; now: number; last: number }[]; label: string }) {
  return (
    <div className="minibars" role="img" aria-label={label}>
      {bars.map((b) => (
        <div className="b" key={b.label}>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: "100%", width: "100%" }}>
            <i className="last" style={{ height: `${b.last * 100}%` }} />
            <i style={{ height: `${b.now * 100}%` }} />
          </div>
          <span>{b.label}</span>
        </div>
      ))}
    </div>
  );
}
export const MessageBubble = ({ children }: { children: ReactNode }) => <div className="bubble">{children}</div>;
/** Waiting for data: soft shimmer lines in the shape of what's coming (never "Loading…"). */
export const Skeleton = ({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) => (
  <div role="status" aria-label={label} style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
    {Array.from({ length: lines }, (_, i) => <span key={i} className="skel" style={{ height: 14, width: `${[72, 56, 64, 48][i % 4]}%` }} />)}
  </div>
);
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="empty"><div className="h2">{title}</div>{children}</div>;

/* ---------- overlays ---------- */
export function Drawer({ title, onClose, footer, children }: { title: string; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <button className="scrim" aria-label="Close" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-h"><span style={{ flex: 1 }}>{title}</span><Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>✕</Button></div>
        <div className="drawer-b">{children}</div>
        {footer && <div className="drawer-f">{footer}</div>}
      </div>
    </>
  );
}
export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  return (
    <>
      <button className="scrim" aria-label="Close" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </>
  );
}
/* ---------- banners + toasts (board "Notifications & Banners", Nov 25) ---------- */
// 4 tones, each with an icon + a bold first word (never colour alone). Every one has an X.
// What X does: hides it for now (the component's own state), for longer on this device (`id` + `keep`),
// or whatever `onClose` says (clear an error, fold into a pill). X on a money error never cancels anything.
export type BannerTone = "info" | "ok" | "warn" | "bad";
const TONE_ICON: Record<BannerTone, ReactNode> = {
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></>,
  ok: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: <path d="M12 6v8M12 18v.5" />,
  bad: <path d="M7 7l10 10M17 7L7 17" />,
};
const XIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
export function CloseX({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useTranslations("sync");
  return <button type="button" className="bn-x" aria-label={label ?? t("close")} data-testid="banner-close" onClick={onClick}><XIcon /></button>;
}
type BannerProps = {
  tone?: BannerTone; title?: ReactNode; children?: ReactNode; action?: ReactNode;
  /** Remember the X on this device under this id, for `keep`. */ id?: string; keep?: Keep;
  onClose?: () => void; /** Full-width strip under the top bar (no corners). */ strip?: boolean;
  className?: string; "data-testid"?: string;
};
export function Banner({ tone = "warn", title, children, action, id, keep = "visit", onClose, strip, className, ...rest }: BannerProps) {
  const [shut, setShut] = useState(false);
  const [memo, setMemo] = useState(!!id); // hidden until storage is read (no flash of a banner closed earlier)
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (id) setMemo(isHidden(id)); }, [id]);
  if (shut || memo) return null;
  const close = () => { if (id) hide(id, keep); collapseOut(box.current, () => { setShut(true); onClose?.(); }); }; // folds away, then goes
  return (
    <div ref={box} className={cx("banner", tone, strip && "strip", className)} role={tone === "bad" ? "alert" : "status"} data-testid={rest["data-testid"]}>
      <svg className="bn-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TONE_ICON[tone]}</svg>
      <span className="bn-t">{title && <b>{title}</b>}{title && children ? " " : null}{children}</span>
      {action && <span className="bn-a">{action}</span>}
      <CloseX onClick={close} />
    </div>
  );
}
/** Quick news at the bottom (+ optional Undo). X closes it now; a new message opens it again. */
export function Toast({ children, action }: { children: ReactNode; action?: { label: string; onClick: () => void } }) {
  const [shut, setShut] = useState(false);
  const sig = typeof children === "string" ? children : "";
  useEffect(() => setShut(false), [sig]);
  if (shut) return null;
  return <div className="toast" role="status"><span style={{ flex: 1 }}>{children}</span>{action && <button type="button" onClick={action.onClick}>{action.label}</button>}<CloseX onClick={() => setShut(true)} /></div>;
}

/* ---------- shells ---------- */
/** Sidebar button at the start of every top bar: hide / show the left menu (per device). Only shows on screens with a left menu, 600px+. */
export function MenuToggle() {
  const t = useTranslations("kit");
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(getMenuHidden()); return onMenuHidden(setHidden); }, []);
  const label = hidden ? t("menuShow") : t("menuHide");
  return (
    <button type="button" className="menu-tg" aria-label={label} title={label} aria-pressed={!hidden} data-testid="menu-toggle" onClick={() => setMenuHidden(!hidden)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="3.5" /><path d="M8.5 8.5v7" /></svg>
    </button>
  );
}
/** One top bar for every desk screen (board "Top Bar · One Rule", Nov 26):
 *  left = page name + one short fact (never the salon name) · middle = `find` (search / scan, only where people look
 *  things up) · right = `children` (Saved pill, small extras) then `action` = the ONE dark main button, far right.
 *  `back` = "‹ Back" built in, so no screen hand-makes it. */
export function TopBar({ title, fact, back, find, action, children }: {
  title: ReactNode; fact?: ReactNode; back?: { href: string; label: ReactNode }; find?: ReactNode; action?: ReactNode; children?: ReactNode;
}) {
  return (
    <header className={`bar${find ? " has-find" : ""}`}>
      <MenuToggle />
      {back && <Link className="btn ghost sm bar-back" href={back.href} data-testid="bar-back">‹ {back.label}</Link>}
      <span className="title" data-testid="bar-title">{title}{fact != null && fact !== "" && <span className="bar-fact"> · {fact}</span>}</span>
      {find && <div className="bar-find">{find}</div>}
      {children}
      {action}
    </header>
  );
}
export function PhoneBar({ title, left, right }: { title: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return <header className="pbar"><span style={{ minWidth: 70 }}>{left}</span><span>{title}</span><span style={{ minWidth: 70, textAlign: "right" }}>{right}</span></header>;
}
export function PhoneTabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <nav className="ptabs">{tabs.map((t) => <button key={t.value} type="button" className={t.value === value ? "on" : ""} aria-current={t.value === value ? "page" : undefined} onClick={() => onChange(t.value)}>{t.label}</button>)}</nav>;
}

const MENU = [
  { name: "Today", href: "/today", icon: <path d="M3 11l9-7 9 7v9H3z" /> },
  { name: "Calendar", href: "/calendar", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
  { name: "Checkout", href: "/checkout", icon: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></> },
  { name: "Clients", href: "/clients", icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7" /></> },
  { name: "Close day", href: "/close-day", icon: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></> },
] as const;
export type MenuItem = (typeof MENU)[number]["name"] | "Me" | "More";
const MORE_HREF = "/me/more"; // a plain link like the other menu items (full page load keeps each screen light)
/** Desktop left menu (design/kit/rail.py). Same on every desk screen; only the active item changes. Bottom: profile pop-up. */
export function LeftMenu({ active, salonInitials = "NP", me }: { active: MenuItem; salonInitials?: string; me?: string }) {
  return (
    <nav className="rail" aria-label="Menu">
      <div className="logo">{salonInitials}</div>
      {MENU.map((m) => (
        <a key={m.name} href={m.href} className={cx(m.name === active && "on", m.name === "Close day" && "rail-wide")} aria-current={m.name === active ? "page" : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{m.icon}</svg>
          {m.name}
        </a>
      ))}
      {/* phones: Close day + the profile live under More (a list page), so the bar holds 5 big targets */}
      <a href={MORE_HREF} className={cx("rail-more", active === "More" && "on")} aria-current={active === "More" ? "page" : undefined} data-testid="menu-more">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
        More
      </a>
      <div style={{ flex: 1 }} />
      <CreditRing />
      <RailAccount initial={me} />
    </nav>
  );
}

/* ---------- sync status (offline-first) ---------- */
export function useSyncState() {
  const [s, setS] = useState<SyncState>({ pending: 0, parked: 0, online: true, syncing: false });
  useEffect(() => subscribe(setS), []);
  return s;
}

// Offline / not-saved banners FOLD into the sync pill when closed: they must stay known (tap the pill = open again).
// Back online clears the fold, so the next time the internet drops the banner shows again; a new failure reopens it.
const FOLD = "fold-sync";
const foldSubs = new Set<(f: boolean) => void>();
const setFold = (f: boolean) => { if (f) hide(FOLD, "visit"); else unhide(FOLD); foldSubs.forEach((fn) => fn(f)); };
function useFold() {
  const [f, setF] = useState(false);
  useEffect(() => { setF(isHidden(FOLD)); foldSubs.add(setF); return () => { foldSubs.delete(setF); }; }, []);
  return f;
}

/** Online / Offline · saved / Syncing pill for every top bar and footer. */
export function SyncPill() {
  const t = useTranslations("sync");
  const s = useSyncState();
  const folded = useFold();
  const open = folded ? { onClick: () => setFold(false), "aria-label": t("openAgain") } : {};
  // a save that just went through gets a little tick for a moment (then the plain dot)
  const busy = !!(s.syncing || s.pending);
  const wasBusy = useRef(false);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (wasBusy.current && !busy && s.online && !s.parked) { setJustSaved(true); const h = setTimeout(() => setJustSaved(false), 1800); wasBusy.current = busy; return () => clearTimeout(h); }
    wasBusy.current = busy;
  }, [busy, s.online, s.parked]);
  if (!s.online) return <button type="button" className="pill warn" style={{ cursor: folded ? "pointer" : "default", font: "inherit", fontSize: 12, color: "var(--ink)" }} data-testid="sync-pill" data-state="offline" {...open}><span aria-hidden>▲</span>{s.pending ? t("waiting", { count: s.pending }) : t("offline")}</button>;
  // Something the server kept refusing: kept on this device, but someone needs to look (hover shows why).
  // Tap to send them again (e.g. after signing in, or once the server is fixed).
  if (s.parked) return <button type="button" className="pill warn" style={{ cursor: "pointer", font: "inherit", fontSize: 12, color: "var(--ink)" }} data-testid="sync-pill" data-state="stuck" title={s.lastError} onClick={() => void retryParked().then(syncNow)}><span aria-hidden>!</span>{t("stuck", { count: s.parked })}</button>;
  if (s.syncing || s.pending) return <span className="pill" data-testid="sync-pill" data-state="syncing"><span className="dot pulse" aria-hidden />{t("syncing")}</span>;
  return <span className="pill ok" data-testid="sync-pill" data-state="online">{justSaved ? <DrawCheck size={12} className="pill-ck" /> : <span className="dot" aria-hidden />}{t("saved")}</span>;
}

/** Strip under the top bar while offline, or when something didn't save. X folds it into the sync pill. */
export function OfflineBanner() {
  const t = useTranslations("sync");
  const s = useSyncState();
  const folded = useFold();
  const [parkedSeen, setParkedSeen] = useState(0);
  useEffect(() => { if (s.online && !s.parked && folded) setFold(false); }, [s.online, s.parked, folded]);
  useEffect(() => { if (s.parked > parkedSeen) { if (parkedSeen) setFold(false); setParkedSeen(s.parked); } else if (s.parked < parkedSeen) setParkedSeen(s.parked); }, [s.parked, parkedSeen]);
  if (folded) return null;
  if (s.parked) return <Banner strip tone="bad" title={t("stuckTitle", { count: s.parked })} onClose={() => setFold(true)} data-testid="stuck-banner"
    action={<button type="button" className="btn sm" onClick={() => void retryParked().then(syncNow)}>{t("retry")}</button>}>{t("stuckText")}</Banner>;
  if (!s.online) return <Banner strip tone="warn" title={t("offlineTitle")} onClose={() => setFold(true)} data-testid="offline-banner">{t("offlineText")}</Banner>;
  return null;
}
export { DateField, DatePicker, DateRangePicker, MonthPicker, type RangePreset } from "./DatePicker";
