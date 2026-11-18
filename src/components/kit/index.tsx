"use client";
// One React component per Design System piece. They only put kit classes (design/kit/kit.css) on real elements:
// never add a look here; change the kit, then `npm run kit:sync`.
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { subscribe, type SyncState } from "@/lib/offline/outbox";
import { CreditRing } from "@/components/CreditRing";

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

/** 4-digit PIN pad. Calls onDone with the 4 digits. */
export function PinKeypad({ length = 4, onDone, error }: { length?: number; onDone: (pin: string) => void; error?: string }) {
  const [pin, setPin] = useState("");
  const press = (k: string) => {
    if (k === "del") return setPin((p) => p.slice(0, -1));
    if (pin.length >= length) return;
    const v = pin + k;
    setPin(v);
    if (v.length === length) setTimeout(() => { onDone(v); setPin(""); }, 150);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="dots" aria-label={`${pin.length} of ${length} digits`}>{Array.from({ length }, (_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}</div>
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
export const Avatar = ({ name, large }: { name: string; large?: boolean }) => (
  <span className={cx("av", large && "lg")} aria-hidden>{name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"}</span>
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
export const Toast = ({ children, action }: { children: ReactNode; action?: { label: string; onClick: () => void } }) => (
  <div className="toast" role="status"><span style={{ flex: 1 }}>{children}</span>{action && <button type="button" onClick={action.onClick}>{action.label}</button>}</div>
);
export const Banner = ({ tone, children }: { tone?: "ok"; children: ReactNode }) => <div className={cx("banner", tone)} role="status">{children}</div>;

/* ---------- shells ---------- */
export function TopBar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <header className="bar"><span className="title">{title}</span>{children}</header>;
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
export type MenuItem = (typeof MENU)[number]["name"] | "Me";
/** Desktop left menu (design/kit/rail.py). Same on every desk screen; only the active item changes. */
export function LeftMenu({ active, salonInitials = "NP", me }: { active: MenuItem; salonInitials?: string; me?: string }) {
  return (
    <nav className="rail" aria-label="Menu">
      <div className="logo">{salonInitials}</div>
      {MENU.map((m) => (
        <a key={m.name} href={m.href} className={m.name === active ? "on" : ""} aria-current={m.name === active ? "page" : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{m.icon}</svg>
          {m.name}
        </a>
      ))}
      <div style={{ flex: 1 }} />
      <CreditRing />
      {me && <Link href="/me" className={active === "Me" ? "on" : ""} aria-label="My profile"><span className="av">{me}</span></Link>}
    </nav>
  );
}

/* ---------- sync status (offline-first) ---------- */
export function useSyncState() {
  const [s, setS] = useState<SyncState>({ pending: 0, parked: 0, online: true, syncing: false });
  useEffect(() => subscribe(setS), []);
  return s;
}

/** Online / Offline · saved / Syncing pill for every top bar and footer. */
export function SyncPill() {
  const t = useTranslations("sync");
  const s = useSyncState();
  if (!s.online) return <span className="pill warn" data-testid="sync-pill" data-state="offline"><span aria-hidden>▲</span>{s.pending ? t("waiting", { count: s.pending }) : t("offline")}</span>;
  // Something the server kept refusing: kept on this device, but someone needs to look (hover shows why).
  if (s.parked) return <span className="pill warn" data-testid="sync-pill" data-state="stuck" title={s.lastError}><span aria-hidden>!</span>{t("stuck", { count: s.parked })}</span>;
  if (s.syncing || s.pending) return <span className="pill" data-testid="sync-pill" data-state="syncing"><span className="dot pulse" aria-hidden />{t("syncing")}</span>;
  return <span className="pill ok" data-testid="sync-pill" data-state="online"><span className="dot" aria-hidden />{t("saved")}</span>;
}

/** Orange strip under the top bar while offline. */
export function OfflineBanner() {
  const t = useTranslations("sync");
  const s = useSyncState();
  return s.online ? null : <Banner>{t("banner")}</Banner>;
}
