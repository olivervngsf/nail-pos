"use client";
// Calendar search box + results (design: search dropdown). Clients · Receipts · Staff in one list with tabs,
// ↑↓ move · Enter open · Tab next tab · Esc close. Digits = phone, "#" = client number, "T-" = receipt.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Desk } from "@/lib/desk";
import type { Appt } from "@/lib/booking/appts";
import { totals, type Ticket } from "@/lib/checkout/ticket";
import { listClients, type ClientRow } from "@/lib/clients";
import { formatCents } from "@/lib/money";
import { countTabs, initials, maskPhone, search, searchMode, tabOf, type Hit, type SClient, type SearchTab } from "@/lib/search/omni";

const CACHE = "nailpos.searchClients.v1";
const TABS: SearchTab[] = ["all", "clients", "receipts", "staff"];

function readCache(salon: string): Record<string, SClient> {
  try { const r = JSON.parse(localStorage.getItem(CACHE) ?? "{}"); return r.salon === salon ? r.rows ?? {} : {}; } catch { return {}; }
}
function writeCache(salon: string, rows: Record<string, SClient>) {
  try { localStorage.setItem(CACHE, JSON.stringify({ salon, rows })); } catch { /* full or blocked: search still works this session */ }
}
const toS = (r: ClientRow): SClient => ({ id: r.id, number: r.number, name: r.name, phone: r.phone, last_visit: r.last_visit });

export function OmniSearch({ desk, list, tickets, q, setQ, inputRef, onEnterScan, onStaff, children }: {
  desk: Desk; list: Appt[]; tickets: Ticket[]; q: string; setQ: (s: string) => void; inputRef: RefObject<HTMLInputElement | null>;
  /** Enter on a pasted/scanned ticket slip: true = handled. */
  onEnterScan: (q: string) => boolean; onStaff: (name: string) => void; children?: ReactNode;
}) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SearchTab>("all");
  const [sel, setSel] = useState(0);
  const [clients, setClients] = useState<Record<string, SClient>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const who = useMemo(() => ({ mode: desk.mode, salonId: desk.salonId, salonName: desk.salonName, role: desk.me.role, name: desk.me.display_name }), [desk]);

  useEffect(() => { setClients(readCache(desk.salonId)); }, [desk.salonId]);
  // Ask the server as you type (debounced); every client seen is kept on this device so search still works offline.
  useEffect(() => {
    const s = q.trim();
    if (!open || (who.mode === "live" && s.length < 2)) return;
    const id = setTimeout(() => {
      void listClients(who, "all", who.mode === "demo" ? "" : s).then((res) => {
        setClients((prev) => {
          const next = { ...prev };
          res.rows.forEach((r) => { next[r.id] = toS(r); });
          writeCache(desk.salonId, next);
          return next;
        });
      }).catch(() => { /* offline: the device copy answers */ });
    }, who.mode === "demo" ? 0 : 200);
    return () => clearTimeout(id);
  }, [q, open, who, desk.salonId]);

  const hits = useMemo(() => search(q, {
    clients: Object.values(clients),
    receipts: tickets.filter((k) => k.status !== "open" || k.lines.length).map((k) => ({
      id: k.id, number: k.number, client: k.client?.name ?? "", last4: k.payment?.last4, cents: k.payment?.amountCents ?? totals(k).total, at: k.payment?.at ?? k.createdAt, status: k.status })),
    staff: desk.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, clockedIn: s.clockedIn })),
    bookings: list.filter((a) => a.status !== "canceled" && a.status !== "no_show" && a.status !== "walked_out")
      .map((a) => ({ clientId: a.client?.id, phone: a.client?.phone, start: a.start })),
  }), [q, clients, tickets, desk.staff, list]);
  const counts = countTabs(hits);
  const shown = tab === "all" ? hits : hits.filter((h) => tabOf(h) === tab);
  const mode = searchMode(q);
  useEffect(() => { setSel(0); }, [q, tab]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const go = (h: Hit) => {
    setOpen(false);
    if (h.kind === "client") router.push(`/clients/${h.id}`);
    else if (h.kind === "receipt") router.push(`/checkout/${h.id}`);
    else { setQ(h.s.name); onStaff(h.s.name); inputRef.current?.blur(); }
  };
  const today = new Date().toDateString();
  const when = (iso: string) => { const d = new Date(iso);
    const tm = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return d.toDateString() === today ? t("srToday", { time: tm }) : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${tm}`; };
  const hl = (s: string) => { // bold the typed digits in a masked phone / last 4
    const d = q.replace(/\D/g, "");
    if (mode !== "phone" || d.length < 3) return s;
    const i = s.lastIndexOf(d.slice(-4)); if (i < 0) return s;
    return <>{s.slice(0, i)}<b>{s.slice(i, i + Math.min(4, d.length))}</b>{s.slice(i + Math.min(4, d.length))}</>;
  };
  const chip = mode === "phone" ? t("srPhone") : mode === "number" ? t("srClientNo") : mode === "receipt" ? t("srReceipt") : null;
  const showPop = open && q.trim().length > 0;

  return (
    <div className="sr-wrap">
      <label className={`cal-search ${showPop ? "sr-on" : ""}`}>
        <svg className="sr-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        {chip && <span className="sr-chip" data-testid="sr-chip">{chip}</span>}
        <input ref={inputRef} value={q} placeholder={t("search")} aria-label={t("search")} data-testid="cal-search"
          role="combobox" aria-expanded={showPop} aria-controls="sr-list" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // A result in the list wins; with none, a scanned slip / ticket number ("T-1042" or "1042") opens that ticket.
              if (showPop && shown[sel]) { e.preventDefault(); go(shown[sel]); return; }
              if (mode !== "number" && onEnterScan(mode === "receipt" ? q.trim().replace(/^t-?/i, "") : q)) e.preventDefault();
            } else if (e.key === "ArrowDown" && showPop) { e.preventDefault(); setSel((i) => Math.min(shown.length - 1, i + 1)); }
            else if (e.key === "ArrowUp" && showPop) { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
            else if (e.key === "Tab" && showPop) { e.preventDefault(); setTab((x) => TABS[(TABS.indexOf(x) + (e.shiftKey ? 3 : 1)) % 4]); }
            else if (e.key === "Escape") { if (showPop) setOpen(false); else { setQ(""); inputRef.current?.blur(); } }
          }} />
        {children}
        <span className="kbd">{showPop ? "esc" : "/"}</span>
      </label>
      {showPop && <div className="sr-pop card" data-testid="sr-pop" onMouseDown={(e) => e.preventDefault()}>
        <div className="sr-tabs" role="tablist">
          {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sr-tab ${tab === k ? "sel" : ""}`}
            onClick={() => setTab(k)} data-testid={`sr-tab-${k}`}>{t(`sr_${k}`)}{counts[k] > 0 && <span className="sr-n">{counts[k]}</span>}</button>)}
        </div>
        <div className="sr-list" id="sr-list" role="listbox" ref={listRef}>
          {shown.length === 0 && <div className="sr-empty">{t("srNone")}</div>}
          {shown.map((h, i) => (
            <button key={`${h.kind}-${h.id}`} type="button" role="option" aria-selected={i === sel} data-i={i} className={`sr-row ${i === sel ? "sel" : ""}`}
              onMouseEnter={() => setSel(i)} onClick={() => go(h)} data-testid="sr-row" data-kind={h.kind}>
              {h.kind === "client" && <>
                <span className="sr-av">{initials(h.c.name)}</span>
                <span className="sr-mid"><span className="sr-t"><b>{h.c.name}</b>{h.c.number && <span className="sr-code">#{h.c.number}</span>}
                  {h.sameLast4 && <span className="sr-warn" data-testid="sr-same">{t("srSame")}</span>}</span>
                  <span className="sr-s">{[maskPhone(h.c.phone) && hl(maskPhone(h.c.phone)), h.next ? t("srBooked", { when: when(h.next) })
                    : h.c.last_visit ? t("srLast", { when: new Date(h.c.last_visit).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }) : t("srNew")]
                    .filter(Boolean).map((x, j) => <span key={j}>{j > 0 && " · "}{x}</span>)}</span></span></>}
              {h.kind === "receipt" && <>
                <span className="sr-av">$</span>
                <span className="sr-mid"><span className="sr-t"><span className="sr-code">T-{h.r.number ?? h.r.id.slice(0, 4).toUpperCase()}</span><span>{h.r.client || t("walkIn")}</span>
                  {h.r.status === "open" && <span className="sr-tag">{t("srOpen")}</span>}{h.r.status === "refunded" && <span className="sr-tag">{t("srRefunded")}</span>}</span>
                  <span className="sr-s">{h.r.last4 ? <>{t("srCard")} ••{hl(h.r.last4)} · </> : null}{formatCents(h.r.cents)} · {when(h.r.at)}</span></span></>}
              {h.kind === "staff" && <>
                <span className="sr-av">{initials(h.s.name)}</span>
                <span className="sr-mid"><span className="sr-t"><b>{h.s.name}</b></span>
                  <span className="sr-s">{h.s.clockedIn ? t("srIn") : t("srOut")} · {t("srShowBookings")}</span></span></>}
              {i === sel && <span className="kbd sr-enter" aria-hidden>↵</span>}
            </button>))}
        </div>
        <div className="sr-foot">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> {t("srMove")}</span>
          <span><span className="kbd">↵</span> {t("srOpenK")}</span>
          <span><span className="kbd">⇥</span> {t("srFilter")}</span>
          <span className="sr-hint">{t("srHint")}</span>
        </div>
      </div>}
    </div>
  );
}
