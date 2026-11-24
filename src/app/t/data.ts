"use client";
// Tech app data: my bookings for a range (own only) and my earnings for a period (own only). Works offline from the
// device copy; refreshes from the server when there is internet.
import { useEffect, useMemo, useState } from "react";
import { rpc } from "@/lib/auth";
import { pullMyAppts, useAppts, type Appt } from "@/lib/booking/appts";
import { addDays, at, dayKey } from "@/lib/booking/grid";
import { demoPayout, isoDay, nums, weekStart, type PayoutRow } from "@/lib/closeday";
import type { TechMe } from "./tech";

/** The time now, ticking every `everyMs` (screens that show "in 12 min" / timers). */
export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(i); }, [everyMs]);
  return now;
}

/** Pull again every minute and whenever the phone comes back to this screen (the desk may have moved a client). */
const REFRESH_MS = 60000;

/** My bookings from `fromDay` for `days` days (YYYY-MM-DD), newest server copy merged in. */
export function useMyAppts(me: TechMe | null, fromDay: string, days: number) {
  const from = useMemo(() => at(fromDay, 0), [fromDay]);
  const to = useMemo(() => at(dayKey(addDays(new Date(`${fromDay}T12:00:00`), days)), 0), [fromDay, days]);
  const all = useAppts(me?.salonId ?? "", from, to);
  useEffect(() => {
    if (!me?.live) return;
    const pull = () => { if (document.visibilityState !== "hidden") void pullMyAppts(me.salonId, from, to, me.id).catch(() => { /* offline: device copy */ }); };
    pull();
    const i = setInterval(pull, REFRESH_MS);
    document.addEventListener("visibilitychange", pull);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", pull); };
  }, [me, from, to]);
  return useMemo(() => all.filter((a) => a.staffId === me?.id && !["canceled", "no_show", "walked_out"].includes(a.status)), [all, me]);
}

export type Period = "today" | "week" | "last";
export function periodRange(p: Period): [string, string] {
  const today = isoDay();
  if (p === "today") return [today, today];
  if (p === "week") return [weekStart(today), today];
  const s = dayKey(addDays(new Date(`${weekStart(today)}T12:00:00`), -7));
  return [s, dayKey(addDays(new Date(`${s}T12:00:00`), 6))];
}

/** My earnings for a period (`my_earnings` checks who is signed in). Test copy = sample numbers. */
export function useMyEarnings(me: TechMe | null, p: Period) {
  const [row, setRow] = useState<PayoutRow | null | undefined>(undefined);
  useEffect(() => {
    if (!me) return;
    if (!me.live) {
      const r = demoPayout()[0];
      const k = p === "today" ? 0.12 : p === "week" ? 1 : 0.9;
      const sc = (c: number) => Math.round(c * k);
      setRow({ ...r, name: me.name, tickets: Math.max(1, Math.round(r.tickets * k)), services_cents: sc(r.services_cents), pay_cents: sc(r.pay_cents),
        tips_card_cents: sc(r.tips_card_cents), tips_cash_cents: sc(r.tips_cash_cents), total_cents: sc(r.total_cents), check_cents: sc(r.check_cents), cash_cents: sc(r.cash_cents),
        lines: p === "today" ? r.lines : r.lines });
      return;
    }
    const [from, to] = periodRange(p);
    setRow(undefined);
    void rpc<PayoutRow | null>("my_earnings", { p_salon: me.salonId, p_from: from, p_to: to }).then((r) => setRow(r ? nums(r) : null)).catch(() => setRow(null));
  }, [me, p]);
  return row;
}

export const svcNames = (a: Appt) => a.services.map((s) => s.name).join(" + ");
export const svcCents = (a: Appt) => a.services.reduce((x, s) => x + s.cents, 0);
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
