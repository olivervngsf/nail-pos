"use client";
// Founder Admin · one salon (Admin Texting board tab 4, frame H2, Oliver Nov 20): who they are on top, then one tab per
// check: Overview · Stripe · Devices · Speed · Check-ins · Plan · Texting · Activity. Every cell in the Salons table opens
// its tab (?tab=). Totals only, never client names, phones or staff pay.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { rpc } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { fmtPhone } from "@/lib/onboarding/data";
import { MOOD, TEXTING, USE, alertsFor, daysSinceCheckin, isLive, pilotDay, pilotDaysLeft, planOf, PLAN_CENTS, stripeState, usageOf, type SalonFacts, type Texting } from "@/lib/admin/health";
import { COLUMN_LABEL, TONE_LABEL, ago, healthRow, type Column, type Tone } from "@/lib/admin/signals";
import { GROUPS, TEXT_KIND, dayIn, describe, lastDays, sampleSalon, sampleSignals, stripeEvent, whoLabel, type Group, type SalonDetail, type Signals } from "@/lib/admin/salon";
import { Button, Chip, Skeleton } from "@/components/kit";
import DeviceMark from "@/components/DeviceMark";
import StatusIcon from "@/components/StatusIcon";
import { deviceState } from "@/lib/devices";
import { AdminShell, useAdmin, type Admin } from "../../shell";
import { CheckIn, TAB_OF } from "../SalonsPage";

const $0 = (c: number) => formatCents(Math.round(c / 100) * 100).replace(/\.00$/, "");
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const TABS = ["overview", "stripe", "devices", "speed", "checkins", "plan", "texting", "activity"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABEL: Record<TabKey, string> = { overview: "Overview", stripe: "Stripe", devices: "Devices", speed: "Speed", checkins: "Check-ins", plan: "Plan", texting: "Texting", activity: "Activity" };
const COL_OF: Partial<Record<TabKey, Column>> = { stripe: "stripe", devices: "devices", speed: "speed", checkins: "talks", plan: "bills", texting: "texting" };

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

/** Admin data for one salon, cached on the device (works offline with the last copy). */
function useCached<T>(admin: Admin, key: string, fn: string, id: string, sample: () => T) {
  const [d, setD] = useState<T | null>(null);
  const load = useCallback(async () => {
    if (admin.gate === "demo") { setD(sample()); return; }
    if (admin.gate !== "live") return;
    try {
      const x = await rpc<T>(fn, { p_salon: id });
      setD(x);
      try { localStorage.setItem(key, JSON.stringify(x)); } catch { /* private mode */ }
    } catch (e) {
      try { const c = JSON.parse(localStorage.getItem(key) ?? "null"); if (c) return setD(c); } catch { /* ignore */ }
      admin.say((e as Error).message);
    }
  }, [admin, id, key, fn, sample]);
  useEffect(() => { void load(); }, [admin.gate]); // eslint-disable-line react-hooks/exhaustive-deps
  return { d, setD, load };
}

function Salon({ admin, s }: { admin: Admin; s: SalonFacts }) {
  const o = admin.data!;
  const now = Date.parse(o.now);
  const q = useSearchParams();
  const tab: TabKey = (TABS as readonly string[]).includes(q.get("tab") ?? "") ? (q.get("tab") as TabKey) : "overview";
  const detail = useCached<SalonDetail>(admin, `nailpos.admin.salon.${s.salon_id}`, "admin_salon", s.salon_id, () => sampleSalon(s.salon_id, o.now));
  const sig = useCached<Signals>(admin, `nailpos.admin.signals.${s.salon_id}`, "admin_signals", s.salon_id, () => sampleSignals(s.salon_id, o.now));
  const d = detail.d;
  const row = useMemo(() => healthRow(s, o.now), [s, o.now]);
  const handledKinds = new Set(o.handled.filter((h) => h.salon_id === s.salon_id).map((h) => h.kind));
  const open = alertsFor(s, o.now).filter((a) => !handledKinds.has(a.kind));
  const phone = s.owner_phone ? fmtPhone(s.owner_phone.replace(/^\+1/, "")) : "";
  const first = s.owner_name?.split(" ")[0] ?? "owner";
  const [checkin, setCheckin] = useState(false);
  const tabTone = (t: TabKey): Tone | null => (COL_OF[t] ? row.cells[COL_OF[t]!].tone : t === "overview" ? row.tone : null);
  const mood = s.checkin_mood ? MOOD[s.checkin_mood][0] : null;
  const plan = planOf(s);
  const texting = s.texting ?? "not_started";

  return (
    <div className="sp-col">
      <section className="card pad sp-hero" aria-label="About the salon">
        <div className="sp-top">
          <div className="sp-top-t">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <StatusIcon tone={row.tone} size={24} />
              <h1 className="h1" style={{ margin: 0 }} data-testid="salon-name">{s.salon_name}</h1>
              <span className={`ad-pill ${row.tone === "bad" ? "bad" : row.tone === "watch" ? "warn" : row.tone === "good" ? "good" : ""}`} data-testid="salon-health">{TONE_LABEL[row.tone]}</span>
            </div>
            <div className="cap" style={{ fontSize: 14 }}>{s.owner_name ?? "No owner"}{phone ? ` · ${phone}` : ""} · {s.state} · {s.staff} staff · added {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }} data-testid="salon-why">{row.why}</div>
          </div>
          {s.owner_phone && <a className="btn primary" href={`tel:${s.owner_phone}`}>Call {first}</a>}
          {s.owner_phone && <a className="btn" href={`sms:${s.owner_phone}`}>Text</a>}
          <Button onClick={() => setCheckin(true)} data-testid="log-checkin">Log check-in</Button>
        </div>
        <div className="sp-facts">
          <div><span className="cap">Plan</span><b><StatusIcon tone={row.cells.bills.tone} size={14} />{row.cells.bills.word}</b><span className="cap">{row.cells.bills.tip}</span></div>
          <div><span className="cap">Last talk</span><b><StatusIcon tone={row.cells.talks.tone} size={14} />{s.checkin_at ? `${daysSinceCheckin(s, o.now)} days ago` : "Never"}</b><span className="cap">{s.checkin_by ?? "—"}{mood ? ` · ${mood}` : ""}</span></div>
          <div><span className="cap">This week</span><b>{USE[usageOf(s)]}</b><span className="cap">vs their usual week</span></div>
          <div><span className="cap">Setup</span><b>{isLive(s) ? "10 of 10" : `${Math.min(s.setup_step + 1, 10)} of 10`}</b><span className="cap">{s.owner_joined ? "Owner joined" : "Owner not joined"}</span></div>
          <div><span className="cap">Texting</span><b><StatusIcon tone={row.cells.texting.tone} size={14} />{TEXTING[texting][0]}</b><span className="cap">{row.cells.texting.tip}</span></div>
          <div><span className="cap">Support access</span><b>Off</b><span className="cap">Owner turns it on</span></div>
        </div>
      </section>

      <nav className="sp-tabs" aria-label="Salon checks">
        {TABS.map((t) => {
          const tone = tabTone(t);
          return (
            <Link key={t} href={`?tab=${t}`} replace scroll={false} className="sp-tab" aria-current={tab === t ? "page" : undefined} data-testid={`tab-${t}`}>
              {tone && tone !== "none" && <StatusIcon tone={tone} size={14} />}{TAB_LABEL[t]}
            </Link>
          );
        })}
      </nav>

      {tab === "overview" && (
        <div className="sp-grid">
          <div className="sp-col">
            <section className="group" style={{ padding: 0 }} data-testid="health-rows">
              <div className="row s"><b style={{ fontWeight: 600 }}>Health · tap a check to see more</b></div>
              {(Object.keys(TAB_OF) as Column[]).map((c) => (
                <Link key={c} href={`?tab=${TAB_OF[c]}`} replace scroll={false} className="sp-check" data-testid={`h-${c}`}>
                  <StatusIcon tone={row.cells[c].tone} /><span className="lbl2">{COLUMN_LABEL[c]}</span><span>{row.cells[c].tip}</span><span className="cap">{row.cells[c].word} ›</span>
                </Link>
              ))}
            </section>
            <Totals s={s} d={d} />
          </div>
          <div className="sp-col">
            <Alerts open={open} admin={admin} s={s} reload={detail.load} />
            <Support s={s} />
            <CallNote admin={admin} salonId={s.salon_id} onSaved={(text) => {
              if (admin.gate === "demo") detail.setD((x) => x && { ...x, activity: [{ at: new Date().toISOString(), action: "admin.note", who: o.me, note: text }, ...x.activity] });
              else void detail.load();
            }} />
          </div>
        </div>
      )}

      {tab === "stripe" && (
        <div className="sp-grid">
          <section className="card pad" style={{ gap: 12 }} data-testid="tab-body-stripe">
            <Head title="Stripe signal" tone={row.cells.stripe.tone} word={row.cells.stripe.word} />
            <div className="sp-stats">
              <Stat label="Last message" value={s.stripe_last_at ? ago(s.stripe_last_at, now) : "None yet"} />
              <Stat label="Card payments today" value={String(s.cards_today ?? 0)} />
              <Stat label="Matched to tickets · 7 days" value={sig.d ? `${sig.d.stripe_week.matched} of ${sig.d.stripe_week.pay}` : "…"} />
            </div>
            <table className="sp-list"><thead><tr><th>When</th><th>Stripe message</th><th className="r">Ticket</th></tr></thead><tbody>
              {(sig.d?.stripe ?? []).map((e, i) => <tr key={i}><td>{ago(e.at, now)}</td><td>{stripeEvent(e.type)}</td><td className="r">{e.ticket ? `#${e.ticket}` : "—"}</td></tr>)}
              {sig.d && !sig.d.stripe.length && <tr><td colSpan={3} className="cap">No Stripe messages yet.</td></tr>}
            </tbody></table>
          </section>
          <section className="group" style={{ padding: 0 }}>
            <div className="row s"><b style={{ fontWeight: 600 }}>Account</b></div>
            <Line label="Stripe" value={{ none: "Not linked yet", needs_info: "Needs more info from the owner", charges_off: "Card payments off", payouts_paused: "Payouts paused", live: "Cards + payouts on" }[stripeState(s)]} tone={row.cells.stripe.tone} testid="h-stripe" />
            <Line label="Card reader" value={d ? (d.readers.length ? d.readers.map((r) => r.label + (r.simulated && !/\(test\)\s*$/i.test(r.label) ? " (test)" : "")).join(", ") : "None paired") : "…"} tone={d ? (d.readers.length ? "good" : isLive(s) ? "watch" : "none") : "none"} />
            <p className="cap" style={{ margin: 0, padding: "10px 16px" }}>Quiet = the salon rang up tickets for 3h+ but Stripe sent nothing. Check the Devices tab first (a tablet off or on bad Wi‑Fi), then Stripe’s status page.</p>
          </section>
        </div>
      )}

      {tab === "devices" && (
        <section className="group" style={{ padding: 0 }} data-testid="tab-body-devices">
          <div className="row s"><Head title={`Devices · ${s.devices_online} of ${s.devices} on now`} tone={row.cells.devices.tone} word={row.cells.devices.word} /></div>
          {(d?.devices ?? []).map((x) => {
            const st = deviceState(x.last_seen, now);
            return (
              <div key={x.name + x.kind} className="row s" data-testid="h-device">
                <span className="dv-lead"><DeviceMark state={st} size={18} /></span>
                <span className="g"><b style={{ fontWeight: 600 }}>{x.name}</b><span className="cap" style={{ display: "block" }}>{x.kind === "clock" ? "Time clock" : x.kind === "kiosk" ? "Kiosk" : "Front desk"}</span></span>
                <span className={`ad-pill ${st === "on" ? "good" : st === "off" ? "warn" : ""}`}>{st === "on" ? "On now" : st === "off" ? `Off · ${ago(x.last_seen, now)}` : "Never on"}</span>
              </div>
            );
          })}
          {d && !d.devices.length && <div className="row s cap">No salon device set up yet.</div>}
          <p className="cap" style={{ margin: 0, padding: "10px 16px" }}>On = the screen said “I’m on” in the last 10 minutes. Off at night is normal; off during opening hours = call.</p>
        </section>
      )}

      {tab === "speed" && <Speed sig={sig.d} s={s} tone={row.cells.speed.tone} word={row.cells.speed.word} />}

      {tab === "checkins" && (
        <div className="sp-grid">
          <section className="card pad" style={{ gap: 10 }} data-testid="tab-body-checkins">
            <Head title="Last check-in" tone={row.cells.talks.tone} word={row.cells.talks.word} />
            {s.checkin_at ? <>
              <div style={{ fontSize: 15 }}><b style={{ fontWeight: 600 }}>{dayMonth(s.checkin_at)}</b> · {s.checkin_by ?? "Admin"}{mood ? ` · ${mood}` : ""}</div>
              {s.checkin_note && <div className="ad-note">{s.checkin_note}</div>}
            </> : <p className="cap" style={{ margin: 0 }}>No check-in yet.</p>}
            {s.need && <div className="hint">Needs from us: <b style={{ fontWeight: 600 }}>{s.need}</b>{s.need_due ? ` · by ${s.need_due}` : ""}{s.need_who ? ` · ${s.need_who}` : ""}</div>}
            <div><Button variant="primary" onClick={() => setCheckin(true)}>Log a check-in</Button></div>
            <p className="cap" style={{ margin: 0 }}>Every 14 days at least. Only Oliver and Elang see check-ins.</p>
          </section>
          <ActivityLog d={d} start="notes" />
        </div>
      )}

      {tab === "plan" && (
        <section className="card pad" style={{ gap: 12 }} data-testid="tab-body-plan">
          <Head title="Their bill to us" tone={row.cells.bills.tone} word={row.cells.bills.word} />
          <div className="sp-stats">
            <Stat label="Plan" value={plan === "paid" || plan === "late" ? `$${PLAN_CENTS[s.plan_cycle ?? "monthly"] / 100}/mo` : plan === "pilot" ? "Free pilot" : "No plan"} sub={s.plan_cycle === "yearly" ? "$468 a year" : plan === "pilot" ? `Day ${pilotDay(s, o.now) ?? 1} of 30` : ""} />
            <Stat label={plan === "pilot" ? "Pilot ends" : "Next bill"} value={plan === "pilot" ? (s.trial_end ? dayMonth(s.trial_end) : "—") : s.plan_period_end ? dayMonth(s.plan_period_end) : "—"} sub={plan === "pilot" ? `${pilotDaysLeft(s, o.now) ?? "—"} days left` : ""} />
            <Stat label="Status" value={{ paid: "Paid", late: "Payment late", pilot: "Pilot", none: "Not started" }[plan]} />
          </div>
          <p className="cap" style={{ margin: 0 }}>Card, invoices and refunds live in Stripe (our account) under this salon.</p>
        </section>
      )}

      {tab === "texting" && <TextingTab s={s} sig={sig.d} admin={admin} tone={row.cells.texting.tone} word={row.cells.texting.word} />}

      {tab === "activity" && <ActivityLog d={d} />}

      {checkin && <CheckIn s={s} admin={admin} onClose={() => setCheckin(false)} />}
    </div>
  );
}

function Head({ title, tone, word }: { title: string; tone: Tone; word: string }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}><h2 className="h2" style={{ margin: 0, flex: 1, fontSize: 16 }}>{title}</h2><span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}><StatusIcon tone={tone} size={16} />{word}</span></div>;
}
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div><div className="cap">{label}</div><div className="sp-big">{value}</div>{sub ? <div className="cap">{sub}</div> : null}</div>;
}
function Line({ label, value, tone, testid }: { label: string; value: string; tone: Tone; testid?: string }) {
  return <div className="row s" data-testid={testid}><StatusIcon tone={tone} size={16} /><span style={{ width: 110, color: "var(--ink-soft)" }}>{label}</span><span className="g">{value}</span></div>;
}

function Alerts({ open, admin, s, reload }: { open: ReturnType<typeof alertsFor>; admin: Admin; s: SalonFacts; reload: () => Promise<void> }) {
  return (
    <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="h2">Open alerts</div>
      {open.length === 0 && <p className="cap" style={{ margin: 0 }}>Nothing open.</p>}
      {open.map((a) => (
        <div key={a.kind} className="ad-alert" style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12 }} data-testid="salon-alert">
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}><StatusIcon tone={a.level === "bad" ? "bad" : "watch"} size={16} />{a.title}</span>
          <span className="cap">{a.why}</span>
          <div><Button size="sm" onClick={() => void admin.handle(s.salon_id, a.kind).then(reload)}>Handled</Button></div>
        </div>
      ))}
    </div>
  );
}

function Support({ s }: { s: SalonFacts }) {
  const first = s.owner_name?.split(" ")[0] ?? "owner";
  return (
    <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div className="h2">Support access</div><span className="ad-pill">Off</span></div>
      <p className="cap" style={{ margin: 0 }}>We see health only. Client names + phones, each tech’s pay and notes stay hidden unless the owner turns on 24h access (logged).</p>
      {s.owner_joined && s.owner_phone
        ? <a className="btn" data-testid="ask-support" href={`sms:${s.owner_phone}?&body=${encodeURIComponent(`Hi ${first}, this is PolishOS support. To let us look at your screens for 24h, open Settings → Support and tap Turn on. You can end it any time.`)}`}>Ask {first} for 24h access</a>
        : <p className="cap" style={{ margin: 0 }}>The owner has not joined yet.</p>}
    </div>
  );
}

function Speed({ sig, s, tone, word }: { sig: Signals | null; s: SalonFacts; tone: Tone; word: string }) {
  const days = sig?.vitals ?? [];
  return (
    <section className="card pad" style={{ gap: 12 }} data-testid="tab-body-speed">
      <Head title="Speed on their devices" tone={tone} word={word} />
      <div className="sp-stats">
        <Stat label="Page load · last 2 days" value={s.speed_ms ? `${(s.speed_ms / 1000).toFixed(1)}s` : "—"} sub="under 2s = good" />
        <Stat label="Slow loads (over 3s)" value={String(s.speed_slow ?? 0)} sub={s.speed_loads ? `of ${s.speed_loads}` : ""} />
        <Stat label="Errors" value={String(s.speed_errors ?? 0)} />
      </div>
      <table className="sp-list"><thead><tr><th>Day</th><th className="r">Loads</th><th className="r">Average</th><th className="r">Slow</th><th className="r">Errors</th></tr></thead><tbody>
        {days.map((v) => (
          <tr key={v.day}><td>{new Date(v.day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td><td className="r">{v.loads}</td>
            <td className="r">{v.avg_ms ? `${(v.avg_ms / 1000).toFixed(1)}s` : "—"}</td><td className="r">{v.slow}</td><td className="r">{v.errors}{v.last_error ? <span className="cap" style={{ display: "block" }}>{v.last_error}</span> : null}</td></tr>
        ))}
        {sig && !days.length && <tr><td colSpan={5} className="cap">No speed data yet. Salon devices send it every few minutes while on.</td></tr>}
      </tbody></table>
      <p className="cap" style={{ margin: 0 }}>Slow on one salon only = their Wi‑Fi or tablet. Slow everywhere = us: check Admin → System.</p>
    </section>
  );
}

function TextingTab({ s, sig, admin, tone, word }: { s: SalonFacts; sig: Signals | null; admin: Admin; tone: Tone; word: string }) {
  const texting = s.texting ?? "not_started";
  // We register each salon's texting number (10DLC) by hand, so an admin sets where it stands.
  const setTexting = async (t: Texting) => {
    if (t === texting) return;
    if (admin.gate !== "live") return admin.say("Test version: sign in as an admin to change this.");
    try { await rpc("admin_set_texting", { p_salon: s.salon_id, p_status: t }); admin.say("Texting status saved"); await admin.reload(); }
    catch (e) { admin.say((e as Error).message); }
  };
  const daily = sig?.texts_daily ?? [];
  const max = Math.max(1, ...daily.map((x) => x.n));
  return (
    <div className="sp-grid">
      <section className="card pad" style={{ gap: 12 }} data-testid="tab-body-texting">
        <Head title="Texting · last 30 days" tone={tone} word={word} />
        <div className="sp-stats">
          <Stat label="Sent" value={(s.texts_30d ?? 0).toLocaleString("en-US")} />
          <Stat label="Failed" value={String(s.texts_failed_30d ?? 0)} sub={s.texts_30d ? `${Math.round(((s.texts_failed_30d ?? 0) / s.texts_30d) * 1000) / 10}%` : ""} />
          <Stat label="Promo texts" value={String(s.promos_30d ?? 0)} />
        </div>
        {daily.length > 0 && <>
          <div className="sp-bars" role="img" aria-label="Texts per day, last 30 days">{daily.map((x) => <i key={x.day} className={x.promo ? "is-promo" : ""} style={{ height: `${Math.max(3, (x.n / max) * 100)}%` }} title={`${x.day}: ${x.n}`} />)}</div>
          <div className="cap">Blue = service texts (reminders, confirms) · purple = a promo day</div>
        </>}
        <table className="sp-list"><thead><tr><th>Kind</th><th className="r">Sent</th><th className="r">Failed</th></tr></thead><tbody>
          {(sig?.texts ?? []).map((x) => <tr key={x.kind}><td>{TEXT_KIND[x.kind] ?? x.kind}</td><td className="r">{x.sent}</td><td className="r">{x.failed}</td></tr>)}
          {sig && !sig.texts.length && <tr><td colSpan={3} className="cap">No texts in 30 days.</td></tr>}
        </tbody></table>
      </section>
      <section className="group" style={{ padding: 0 }} data-testid="h-texting">
        <div className="row s"><b style={{ fontWeight: 600 }}>Carrier paperwork (10DLC)</b></div>
        <div className="row s ad-texting" role="group" aria-label="Texting status" style={{ flexWrap: "wrap" }}>
          {(Object.keys(TEXTING) as Texting[]).map((t) => <Chip key={t} on={t === texting} aria-pressed={t === texting} onClick={() => void setTexting(t)}>{TEXTING[t][0]}</Chip>)}
        </div>
        <p className="cap" style={{ margin: 0, padding: "10px 16px" }}>We register each salon’s own number by hand, so we set where it stands. Usual wait 1–3 weeks; 7+ days shows an alert.</p>
      </section>
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

function ActivityLog({ d, start = "all" }: { d: SalonDetail | null; start?: Group | "all" }) {
  const [g, setG] = useState<Group | "all">(start);
  const rows = useMemo(() => (d?.activity ?? []).map((a) => ({ a, ...describe(a) })).filter((x) => g === "all" || x.group === g), [d, g]);
  return (
    <section className="group" style={{ padding: 0 }} data-testid="activity">
      <div className="ad-tablehead">
        <h2 className="h2" style={{ margin: "0 auto 0 0" }}>Activity</h2>
        {GROUPS.map((x) => <Chip key={x.key} on={g === x.key} aria-pressed={g === x.key} onClick={() => setG(x.key)} data-testid={`act-${x.key}`}>{x.label}</Chip>)}
      </div>
      {!d && <div className="row s"><Skeleton lines={2} /></div>}
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
