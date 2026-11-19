"use client";
// Founder Admin · one salon (board A2 + A8): totals (today, 8 days), health rows, open alerts, activity log with filters,
// call/text owner, call notes (admin_note), support access (off; owner-granted 24h comes next). Totals only, no private data.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { rpc } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { fmtPhone } from "@/lib/onboarding/data";
import { TEXTING, alertsFor, healthOf, isLive, stripeState, type Health, type SalonFacts, type Texting } from "@/lib/admin/health";
import { GROUPS, dayIn, describe, lastDays, sampleSalon, whoLabel, type Group, type SalonDetail } from "@/lib/admin/salon";
import { Button, Chip } from "@/components/kit";
import DeviceMark from "@/components/DeviceMark";
import { deviceState } from "@/lib/devices";
import { AdminShell, useAdmin, type Admin } from "../../shell";

const $0 = (c: number) => formatCents(Math.round(c / 100) * 100).replace(/\.00$/, "");
const HEALTH: Record<Health, string> = { good: "Good", warn: "Needs action", bad: "Problem", setup: "Setting up" };
const when = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 2) return "now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)} days ago`;
};
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function SalonPage({ id }: { id: string }) {
  const admin = useAdmin();
  const s = admin.data?.salons.find((x) => x.salon_id === id);
  return (
    <AdminShell tab="salons" admin={admin} title={s?.salon_name ?? "Salon"}
      actions={<Link className="btn ghost" href="/admin/salons">‹ Salons</Link>}>
      {admin.data && !s && <div className="card pad"><div className="h2">Salon not found</div><p className="cap">It may be archived. <Link href="/admin/salons">Back to salons</Link></p></div>}
      {admin.data && s && <Salon admin={admin} s={s} />}
    </AdminShell>
  );
}

function useSalonDetail(admin: Admin, id: string) {
  const [d, setD] = useState<SalonDetail | null>(null);
  const key = `nailpos.admin.salon.${id}`;
  const load = useCallback(async () => {
    if (admin.gate === "demo") { setD(sampleSalon(id, admin.data?.now)); return; }
    if (admin.gate !== "live") return;
    try {
      const x = await rpc<SalonDetail>("admin_salon", { p_salon: id });
      setD(x);
      try { localStorage.setItem(key, JSON.stringify(x)); } catch { /* private mode */ }
    } catch (e) {
      try { const c = JSON.parse(localStorage.getItem(key) ?? "null"); if (c) return setD(c); } catch { /* ignore */ }
      admin.say((e as Error).message);
    }
  }, [admin, id, key]);
  useEffect(() => { void load(); }, [admin.gate]); // eslint-disable-line react-hooks/exhaustive-deps
  return { d, setD, load };
}

function Salon({ admin, s }: { admin: Admin; s: SalonFacts }) {
  const o = admin.data!;
  const now = Date.parse(o.now);
  const { d, setD, load } = useSalonDetail(admin, s.salon_id);
  const handledKinds = new Set(o.handled.filter((h) => h.salon_id === s.salon_id).map((h) => h.kind));
  const all = alertsFor(s, o.now);
  const open = all.filter((a) => !handledKinds.has(a.kind));
  const health = healthOf(s, all);
  const phone = s.owner_phone ? fmtPhone(s.owner_phone.replace(/^\+1/, "")) : "";

  return (
    <div className="ad-split">
      <section className="ad-wide-col" aria-label="Salon health">
        <div className="card pad" style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <div style={{ flex: "1 1 260px" }}>
            <h1 className="h1" style={{ margin: 0 }} data-testid="salon-name">{s.salon_name}</h1>
            <div className="cap" style={{ fontSize: 14 }}>{s.owner_name ?? "No owner"}{phone ? ` · ${phone}` : ""} · {s.state} · added {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
          </div>
          <span className={`ad-pill ${health}`} data-testid="salon-health">{HEALTH[health]}</span>
          {s.owner_phone && <a className="btn" href={`tel:${s.owner_phone}`}>Call {s.owner_name?.split(" ")[0] ?? "owner"}</a>}
          {s.owner_phone && <a className="btn" href={`sms:${s.owner_phone}`}>Text</a>}
        </div>

        <Totals s={s} d={d} />
        <HealthRows s={s} d={d} now={now} admin={admin} />
        <ActivityLog d={d} />
      </section>

      <aside className="ad-side" aria-label="Actions">
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="h2">Support access</div><span className="ad-pill">Off</span>
          </div>
          <p className="cap" style={{ margin: 0 }}>We see health only. Client names + phones, each tech’s pay and notes stay hidden unless the owner turns on 24h access (logged).</p>
          {s.owner_joined && s.owner_phone
            ? <a className="btn" data-testid="ask-support" href={`sms:${s.owner_phone}?&body=${encodeURIComponent(`Hi ${s.owner_name?.split(" ")[0] ?? ""}, this is PolishOS support. To let us look at your screens for 24h, open Settings → Support and tap Turn on. You can end it any time.`)}`}>Ask {s.owner_name?.split(" ")[0] ?? "owner"} for 24h access</a>
            : <p className="cap" style={{ margin: 0 }}>The owner has not joined yet.</p>}
          <p className="cap" style={{ margin: 0 }}>The owner turns it on in Settings → Support. Then the salon shows under <Link href="/admin/support">Support</Link>.</p>
        </div>

        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="h2">Open alerts</div>
          {open.length === 0 && <p className="cap" style={{ margin: 0 }}>Nothing open.</p>}
          {open.map((a) => (
            <div key={a.kind} className="ad-alert" style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12 }} data-testid="salon-alert">
              <span className={`ad-pill ${a.level}`} style={{ alignSelf: "flex-start" }}>{a.level === "bad" ? "Problem" : "Needs action"}</span>
              <b style={{ fontWeight: 600 }}>{a.title}</b>
              <span className="cap">{a.why}</span>
              <div><Button size="sm" onClick={() => void admin.handle(s.salon_id, a.kind).then(load)}>Handled</Button></div>
            </div>
          ))}
        </div>

        <CallNote admin={admin} salonId={s.salon_id} onSaved={(text) => {
          if (admin.gate === "demo") setD((x) => x && { ...x, activity: [{ at: new Date().toISOString(), action: "admin.note", who: o.me, note: text }, ...x.activity] });
          else void load();
        }} />
      </aside>
    </div>
  );
}

function Totals({ s, d }: { s: SalonFacts; d: SalonDetail | null }) {
  const today = dayIn(new Date().toISOString(), s.time_zone || "America/Los_Angeles");
  const days = d ? lastDays(d.days, today) : [];
  const week = days.slice(1);
  const max = Math.max(1, ...days.map((x) => x.cents));
  const wk = (k: "tickets" | "cents") => week.reduce((n, x) => n + x[k], 0);
  return (
    <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="ad-tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <div><div className="eyebrow">Today</div><div className="money" data-testid="salon-today">{$0(s.cents_today)}</div><div className="cap">{s.tickets_today} tickets</div></div>
        <div><div className="eyebrow">Last 7 days</div><div className="money">{d ? $0(wk("cents")) : "…"}</div><div className="cap">{d ? `${wk("tickets")} tickets` : ""}</div></div>
        <div><div className="eyebrow">Avg ticket (7 days)</div><div className="money">{d && wk("tickets") ? $0(wk("cents") / wk("tickets")) : "–"}</div><div className="cap">card + cash, with tips</div></div>
      </div>
      {d && <div className="ad-bars" role="img" aria-label="Sales per day, last 8 days">
        {days.map((x, i) => (
          <div key={x.day} className="ad-bar">
            <i style={{ height: `${Math.max(2, (x.cents / max) * 100)}%`, background: i === days.length - 1 ? "var(--ink)" : "var(--line)" }} />
            <span>{i === days.length - 1 ? "Today" : new Date(x.day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short" })}</span>
          </div>
        ))}
      </div>}
      <p className="cap" style={{ margin: 0 }}>Totals only. No client names, no tech pay.</p>
    </div>
  );
}

function HealthRows({ s, d, now, admin }: { s: SalonFacts; d: SalonDetail | null; now: number; admin: Admin }) {
  const texting = s.texting ?? "not_started";
  // We register each salon's texting number (10DLC) by hand, so an admin sets where it stands.
  const setTexting = async (t: Texting) => {
    if (t === texting) return;
    if (admin.gate !== "live") return admin.say("Test version: sign in as an admin to change this.");
    try { await rpc("admin_set_texting", { p_salon: s.salon_id, p_status: t }); admin.say("Texting status saved"); await admin.reload(); }
    catch (e) { admin.say((e as Error).message); }
  };
  const st = stripeState(s);
  const stripe: [string, Health] = {
    none: ["Not linked yet", "setup"], needs_info: ["Stripe needs more info from the owner", "warn"], charges_off: ["Card payments are off", "bad"],
    payouts_paused: ["Payouts paused: owner must answer Stripe", "bad"], live: ["Cards + payouts on", "good"],
  }[st] as [string, Health];
  const step = Math.min(s.setup_step + 1, 10);
  const team = d ? Object.entries(d.roles).map(([r, n]) => `${n} ${({ owner: "owner", manager: "manager", front_desk: "front desk", tech: "tech" } as Record<string, string>)[r] ?? r}${n === 1 || r === "front_desk" ? "" : "s"}`).join(" · ") : `${s.staff} people`;
  const row = (label: string, value: string, tone: Health | null, testid?: string) => (
    <div className="row s" data-testid={testid}>
      <span className={`ad-dot ${tone ?? ""}`} aria-hidden />
      <span style={{ width: 130, color: "var(--ink-soft)" }}>{label}</span>
      <span className="g">{value}</span>
    </div>
  );
  return (
    <div className="group" data-testid="health-rows">
      <div className="row s"><b style={{ fontWeight: 600 }}>Health</b></div>
      {row("Stripe", stripe[0], stripe[1], "h-stripe")}
      {row("Card reader", d ? (d.readers.length ? d.readers.map((r) => r.label + (r.simulated && !/\(test\)\s*$/i.test(r.label) ? " (test)" : "")).join(", ") : "None paired") : "…", d ? (d.readers.length ? "good" : isLive(s) ? "warn" : "setup") : null)}
      {(d?.devices ?? []).map((x) => {
        const st = deviceState(x.last_seen, now);
        return (
          <div key={x.name + x.kind} className="row s" data-testid="h-device">
            <span className="dv-lead"><DeviceMark state={st} size={18} /></span>
            <span style={{ width: 130, color: "var(--ink-soft)" }}>{x.kind === "clock" ? "Time clock" : x.kind === "kiosk" ? "Kiosk" : "Salon device"}</span>
            <span className="g">{x.name}</span>
            <span className={`ad-pill ${st === "on" ? "good" : st === "off" ? "warn" : ""}`}>{st === "on" ? "On now" : st === "off" ? `Off · last on ${when(x.last_seen, now)}` : "Never on"}</span>
          </div>
        );
      })}
      {d && !d.devices.length && row("Salon device", "None set up yet", isLive(s) ? "warn" : "setup")}
      {row("Setup", !s.owner_joined ? (s.invite_open ? "Owner invited, not joined yet" : "Invite expired") : isLive(s) ? "All 10 steps done" : `Step ${step} of 10`, !s.owner_joined ? "warn" : isLive(s) ? "good" : "setup")}
      {row("Team", team, null)}
      <div className="row s" data-testid="h-texting">
        <span className={`ad-dot ${TEXTING[texting][1]}`} aria-hidden />
        <span style={{ width: 130, color: "var(--ink-soft)" }}>Texting (10DLC)</span>
        <span className="g ad-texting" role="group" aria-label="Texting status">
          {(Object.keys(TEXTING) as Texting[]).map((t) => <Chip key={t} on={t === texting} aria-pressed={t === texting} onClick={() => void setTexting(t)}>{TEXTING[t][0]}</Chip>)}
        </span>
      </div>
    </div>
  );
}

function ActivityLog({ d }: { d: SalonDetail | null }) {
  const [g, setG] = useState<Group | "all">("all");
  const rows = useMemo(() => (d?.activity ?? []).map((a) => ({ a, ...describe(a) })).filter((x) => g === "all" || x.group === g), [d, g]);
  return (
    <section className="group" style={{ padding: 0 }} data-testid="activity">
      <div className="ad-tablehead">
        <h2 className="h2" style={{ margin: "0 auto 0 0" }}>Activity</h2>
        {GROUPS.map((x) => <Chip key={x.key} on={g === x.key} aria-pressed={g === x.key} onClick={() => setG(x.key)} data-testid={`act-${x.key}`}>{x.label}</Chip>)}
      </div>
      {!d && <div className="row s cap">Loading…</div>}
      {d && !rows.length && <div className="row s cap">Nothing here yet.</div>}
      {rows.map(({ a, label, group, tone }, i) => (
        <div key={i} className="row m" style={{ alignItems: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
          <span className={`ad-pill ${tone ?? ""}`} style={{ minWidth: 64, justifyContent: "center", textTransform: "capitalize" }}>{group}</span>
          <span className="g">
            <span style={{ fontWeight: 500 }}>{label}</span>
            {a.note && <span className="cap" style={{ display: "block", whiteSpace: "pre-wrap" }}>“{a.note}”</span>}
          </span>
          <span className="cap" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{whoLabel(a.who)}<br />{stamp(a.at)}</span>
        </div>
      ))}
    </section>
  );
}

function CallNote({ admin, salonId, onSaved }: { admin: Admin; salonId: string; onSaved: (text: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      if (admin.gate === "live") await rpc("admin_note", { p_salon: salonId, p_text: t });
      setText(""); onSaved(t); admin.say("Note saved");
    } catch (e) { admin.say((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="h2" htmlFor="call-note">Call note</label>
      <textarea id="call-note" className="inp" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="What did the owner say? Next step?" style={{ height: "auto", padding: 10, resize: "vertical", font: "inherit" }} />
      <div><Button variant="primary" disabled={busy || !text.trim()} onClick={() => void save()} data-testid="note-save">Save note</Button></div>
      <p className="cap" style={{ margin: 0 }}>Only Oliver and Elang see notes. Saved in this salon’s activity.</p>
    </div>
  );
}
