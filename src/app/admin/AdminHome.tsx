"use client";
// Founder Admin · Home = alerts inbox (variation B): what needs us today, worst first; Handled hides it for the day (logged).
// Side: today's totals across salons + every salon with a health dot. Salons tab (variation A) = /admin/salons.
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { fmtPhone } from "@/lib/onboarding/data";
import { alertsFor, healthOf, openAlerts, totals, vsWeekAgo, type Alert, type Overview } from "@/lib/admin/health";
import { Button } from "@/components/kit";
import { AdminShell, useAdmin } from "./shell";

const $0 = (c: number) => formatCents(Math.round(c / 100) * 100).replace(/\.00$/, "");
const hello = (now: Date) => (now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening");
const ago = (iso: string | null, now: number) => {
  if (!iso) return "";
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function AdminHome() {
  const admin = useAdmin();
  return (
    <AdminShell tab="home" admin={admin} title="Founder Admin">
      {admin.data && <Inbox o={admin.data} onHandle={admin.handle} />}
    </AdminShell>
  );
}

function Inbox({ o, onHandle }: { o: Overview; onHandle: (salon: string, kind: string) => Promise<void> }) {
  const now = new Date(o.now);
  const alerts = openAlerts(o);
  const t = totals(o);
  const fine = o.salons.filter((s) => !alertsFor(s, o.now).length).length;
  const bad = alerts.filter((a) => a.level === "bad");
  const warn = alerts.filter((a) => a.level === "warn");
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const trend = vsWeekAgo(t.ticketsToday, t.ticketsWeekAgo, weekday);
  const name = (id: string) => o.salons.find((s) => s.salon_id === id)?.salon_name ?? "Salon";
  const kindTitle = (id: string, kind: string) => {
    const s = o.salons.find((x) => x.salon_id === id);
    return (s && alertsFor(s, o.now).find((a) => a.kind === kind)?.title) ?? kind.replace(/_/g, " ");
  };

  return (
    <div className="ad-split">
      <section className="ad-wide-col" aria-label="Needs you">
        <div>
          <div className="eyebrow">{now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
          <h1 className="h1" style={{ margin: "2px 0 4px" }}>{hello(now)}{o.me ? `, ${o.me.split(" ")[0]}` : ""}</h1>
          <p style={{ margin: 0, color: "var(--ink-soft)" }} data-testid="inbox-sum">
            {alerts.length ? `${alerts.length} thing${alerts.length === 1 ? "" : "s"} need you today.` : "Nothing needs you today."} {fine} salon{fine === 1 ? " is" : "s are"} fine.
          </p>
        </div>

        {bad.length > 0 && <><div className="eyebrow">Now</div>{bad.map((a) => <AlertCard key={a.salon_id + a.kind} a={a} big now={+now} onHandle={onHandle} />)}</>}
        {warn.length > 0 && <><div className="eyebrow">Today</div>{warn.map((a) => <AlertCard key={a.salon_id + a.kind} a={a} now={+now} onHandle={onHandle} />)}</>}
        {!alerts.length && <div className="card pad" style={{ textAlign: "center", padding: 32 }}><div className="h2">All good</div><p className="cap">Every salon is healthy right now.</p></div>}

        {o.handled.length > 0 && <>
          <div className="eyebrow">Done today</div>
          <div className="group" data-testid="done-today">
            {o.handled.map((h) => (
              <div key={h.salon_id + h.kind} className="row s"><span className="g">{name(h.salon_id)}: {kindTitle(h.salon_id, h.kind)}</span><span className="cap">{h.by} · {time(h.at)}</span></div>
            ))}
          </div>
        </>}
      </section>

      <aside className="ad-side" aria-label="All salons today">
        <div className="card pad">
          <div className="eyebrow">Today, all salons</div>
          <div className="money" style={{ marginTop: 6 }} data-testid="today-total">{$0(t.centsToday)}</div>
          <div className="cap">{t.ticketsToday} tickets{trend ? ` · ${trend}` : ""} · salons’ money, not ours</div>
          <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
            <div><b className="num" style={{ fontSize: 18 }}>{t.salons}</b><div className="cap">salons</div></div>
            <div><b className="num" style={{ fontSize: 18 }}>{t.live}</b><div className="cap">live</div></div>
            <div><b className="num" style={{ fontSize: 18 }}>{t.settingUp}</b><div className="cap">setting up</div></div>
          </div>
        </div>
        <div className="group">
          <div className="row s" style={{ justifyContent: "space-between" }}><b style={{ fontWeight: 600 }}>Salons</b><Link className="btn sm" href="/admin/salons?add=1">+ Invite</Link></div>
          {o.salons.map((s) => {
            const h = healthOf(s, alertsFor(s, o.now));
            return (
              <Link key={s.salon_id} href={`/admin/salons/${s.salon_id}`} className="row s ad-link">
                <span className={`ad-dot ${h}`} aria-hidden />
                <span className="g">{s.salon_name}</span>
                <span className="num cap">{s.owner_joined && s.setup_step >= 9 ? $0(s.cents_today) : "Setting up"}</span>
              </Link>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function AlertCard({ a, big, now, onHandle }: { a: Alert; big?: boolean; now: number; onHandle: (salon: string, kind: string) => Promise<void> }) {
  const phone = a.phone ? fmtPhone(a.phone.replace(/^\+1/, "")) : "";
  return (
    <article className={`card pad ad-alert${big ? " bad" : ""}`} data-testid="alert">
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className={`ad-pill ${a.level}`}>{a.level === "bad" ? "Problem" : "Needs action"}</span>
        {a.since && <span className="cap">{ago(a.since, now)}</span>}
      </div>
      <h2 className={big ? "h2" : ""} style={{ margin: 0, fontSize: big ? undefined : 16, fontWeight: 600 }}>{a.salon}: {a.title}</h2>
      <p className="cap" style={{ margin: 0, fontSize: 14 }}>{a.why}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {phone && <a className={`btn${big ? " primary" : ""}`} href={`tel:${a.phone}`}>Call {a.owner?.split(" ")[0] ?? "owner"} · {phone}</a>}
        <Link className="btn" href={`/admin/salons/${a.salon_id}`}>Open salon</Link>
        <Button style={{ marginLeft: "auto" }} onClick={() => void onHandle(a.salon_id, a.kind)} data-testid="handled">Handled</Button>
      </div>
    </article>
  );
}
