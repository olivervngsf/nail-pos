"use client";
// Today (Main Screens Today H1–H2): owner/manager see the 5 KPIs for today vs the same weekday last week (by now) with the
// chart + one fact; everyone at the desk sees "Needs attention" (late staff, not confirmed soon, ready for bill, license
// expiring, regulars' birthdays). Facts only, one tap to act; done items go away for today on this device.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { rpc } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { pullAppts, useAppts } from "@/lib/booking/appts";
import { at, dayKey, fmtMin, minutesOf } from "@/lib/booking/grid";
import { useNumbers } from "@/lib/numbers/load";
import type { KpiKey } from "@/lib/numbers/kpis";
import { KpiChart, KpiTiles } from "@/app/numbers/NumbersPage";

type Att = { licenses: { name: string; expires: string }[]; birthdays: { id: string; name: string; birthday: string; visits: number }[]; readyForBill: { ticketId: string; name: string; cents: number }[] };
type StaffLite = { membership_id: string; display_name: string; role: string; clocked_in: boolean };

export function OwnerKpis({ salonId }: { salonId: string }) {
  const t = useTranslations("numbers");
  const [k, setK] = useState<KpiKey>("sales");
  const { facts, now } = useNumbers(salonId, true, "day");
  if (!facts) return null;
  return (
    <section className="nm-today" data-testid="today-kpis">
      <KpiTiles facts={facts} now={now} per="day" k={k} setK={setK} lostN={facts.lost.length} />
      <KpiChart facts={facts} now={now} per="day" k={k} />
      <Link className="cap" href="/numbers" style={{ fontWeight: 600 }}>{t("open")}</Link>
    </section>
  );
}

export function NeedsAttention({ salonId, staff }: { salonId: string; staff: StaffLite[] }) {
  const t = useTranslations("numbers");
  const tc = useTranslations("calendar");
  const today = dayKey(new Date());
  const from = useMemo(() => at(today, 0), [today]), to = useMemo(() => at(today, 24 * 60), [today]);
  const appts = useAppts(salonId, from, to);
  const [att, setAtt] = useState<Att | null>(null);
  const doneKey = `nailpos.attDone.${salonId}.${today}`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(doneKey) || "[]")); } catch { /* */ } }, [doneKey]);
  useEffect(() => {
    const load = () => { void pullAppts(salonId, from, to).catch(() => {}); void rpc<Att>("today_attention", { p_salon: salonId }).then(setAtt).catch(() => {}); };
    load();
    const i = setInterval(load, 60_000);
    return () => clearInterval(i);
  }, [salonId, from, to]);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const live = appts.filter((a) => a.status === "booked" || a.status === "confirmed");
  const items: { id: string; mark: string; tone: string; title: string; sub?: string; href?: string; cta: string }[] = [];
  for (const s of staff.filter((x) => x.role === "tech" && !x.clocked_in)) {
    const mine = live.filter((a) => a.staffId === s.membership_id).sort((a, b) => a.start.localeCompare(b.start));
    if (mine.length && minutesOf(mine[0].start) <= nowM + 15) items.push({ id: `late-${s.membership_id}`, mark: "▲", tone: "warn", title: t("a_late", { name: s.display_name, n: mine.length }), sub: t("a_lateSub", { time: fmtMin(minutesOf(mine[0].start)) }), href: "/calendar", cta: t("cta_cover") });
  }
  for (const a of live.filter((x) => x.status === "booked" && x.source !== "kiosk" && x.source !== "walk_in" && minutesOf(x.start) > nowM && minutesOf(x.start) - nowM <= 180))
    items.push({ id: `unc-${a.id}`, mark: "?", tone: "warn", title: t("a_unconf", { name: a.client?.name || tc("walkIn"), time: fmtMin(minutesOf(a.start)) }), sub: t("a_unconfSub", { src: tc(`src_${a.source}` as "src_web") }), href: "/calendar", cta: t("cta_open") });
  if (att?.readyForBill.length) items.push({ id: "ready", mark: "$", tone: "ink", title: t("a_ready", { n: att.readyForBill.length }),
    sub: att.readyForBill.slice(0, 3).map((r) => `${r.name || tc("walkIn")} ${formatCents(r.cents).replace(/\.00$/, "")}`).join(" · "), href: "/checkout", cta: t("cta_open") });
  for (const l of att?.licenses ?? []) {
    const days = Math.round((new Date(l.expires).getTime() - Date.now()) / 86_400_000);
    items.push({ id: `lic-${l.name}-${l.expires}`, mark: "!", tone: "red", title: t("a_license", { name: l.name, date: new Date(l.expires + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) }), sub: t("a_licenseSub", { n: Math.max(0, days) }), cta: t("cta_ok") });
  }
  for (const b of att?.birthdays ?? []) {
    const d = new Date(b.birthday + "T12:00"); d.setFullYear(new Date().getFullYear());
    items.push({ id: `bday-${b.id}`, mark: "★", tone: "ok", title: t("a_bday", { name: b.name, date: d.toLocaleDateString(undefined, { weekday: "long" }) }), sub: t("a_bdaySub", { n: b.visits }), href: `/clients/${b.id}`, cta: t("cta_profile") });
  }
  const shown = items.filter((x) => !done.includes(x.id));
  const finish = (id: string) => { const n = [...done, id]; setDone(n); try { localStorage.setItem(doneKey, JSON.stringify(n)); } catch { /* */ } };
  return (
    <section className="group nm-att" data-testid="needs-attention">
      <div className="eyebrow" style={{ padding: "12px 14px 4px" }}>{t("attention", { n: shown.length })}</div>
      {shown.length === 0 ? <div className="nm-attrow" style={{ justifyContent: "center", color: "#5C5C5E" }}>{t("allClear")}</div> : shown.map((x) => (
        <div key={x.id} className="nm-attrow">
          <span className={`nm-mk ${x.tone}`} aria-hidden>{x.mark}</span>
          <span className="nm-tx"><b>{x.title}</b>{x.sub && <span className="cap">{x.sub}</span>}</span>
          {x.href ? <Link className="btn sm" href={x.href} onClick={() => finish(x.id)}>{x.cta}</Link>
            : <button type="button" className="btn sm" onClick={() => finish(x.id)}>{x.cta}</button>}
        </div>))}
    </section>
  );
}
