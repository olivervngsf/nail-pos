"use client";
// Founder Admin · Salons tab (variation A): business at a glance + one table of every salon (setup, today, Stripe, devices, health).
// Add salon by invite (admin_create_salon) in a drawer; owners not joined yet get Copy invite / New code (admin_new_code).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { e164, rpc } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { alertsFor, healthOf, isLive, openAlerts, stripeState, totals, vsWeekAgo, type Health, type SalonFacts, type StripeState } from "@/lib/admin/health";
import { Button, Chip, Drawer, Field, ProgressBar } from "@/components/kit";
import { AdminShell, useAdmin } from "../shell";

const $0 = (c: number) => formatCents(Math.round(c / 100) * 100).replace(/\.00$/, "");
type Invite = { salon_id: string; code: string | null; owner_name: string | null };
type Filter = "all" | "action" | "setup" | "live";
const HEALTH: Record<Health, string> = { good: "Good", warn: "Needs action", bad: "Problem", setup: "Setting up" };
const STRIPE: Record<StripeState, [string, Health]> = {
  none: ["Not linked", "setup"], needs_info: ["Needs info", "warn"], charges_off: ["Cards off", "bad"], payouts_paused: ["Payouts paused", "bad"], live: ["Live", "good"],
};

export default function SalonsPage() {
  const admin = useAdmin();
  const router = useRouter();
  const q = useSearchParams();
  const [adding, setAdding] = useState(q.get("add") === "1");
  const [filter, setFilter] = useState<Filter>("all");
  const [invites, setInvites] = useState<Invite[]>([]);

  const loadInvites = useCallback(async () => {
    if (admin.gate !== "live") return;
    try { setInvites(await rpc<Invite[]>("admin_salons")); } catch { /* offline: no codes */ }
  }, [admin.gate]);
  useEffect(() => { void loadInvites(); }, [loadInvites]);

  const o = admin.data;
  const rows = useMemo(() => (o ? o.salons.map((s) => ({ s, health: healthOf(s, alertsFor(s, o.now)) })) : []), [o]);
  const shown = rows.filter(({ s, health }) => filter === "all" || (filter === "action" ? health === "warn" || health === "bad" : filter === "live" ? isLive(s) : !isLive(s)));
  const count = (f: Filter) => rows.filter(({ s, health }) => (f === "action" ? health === "warn" || health === "bad" : f === "live" ? isLive(s) : !isLive(s))).length;

  const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => admin.say("Copied")); };
  const inviteText = (owner: string, salon: string, code: string) =>
    `Hi ${owner}, your PolishOS salon "${salon}" is ready. Sign in at ${location.origin}/login with this phone number. Invite code: ${code}`;
  const newCode = async (s: SalonFacts) => {
    try { await rpc<string>("admin_new_code", { p_salon: s.salon_id }); admin.say(`New code for ${s.salon_name}`); void loadInvites(); void admin.reload(); }
    catch (e) { admin.say((e as Error).message); }
  };
  const closeAdd = () => { setAdding(false); if (q.get("add")) router.replace("/admin/salons"); };

  return (
    <AdminShell tab="salons" admin={admin} title="Salons" actions={<Button variant="primary" onClick={() => setAdding(true)} data-testid="add-salon-open">+ Add salon by invite</Button>}>
      {o && <>
        <Tiles o={o} />
        <section className="group" style={{ padding: 0 }} data-testid="salon-list">
          <div className="ad-tablehead">
            <h2 className="h2" style={{ margin: "0 auto 0 0" }}>All salons</h2>
            {(["all", "action", "setup", "live"] as Filter[]).map((f) => (
              <Chip key={f} on={filter === f} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`f-${f}`}>
                {{ all: "All", action: "Needs action", setup: "Setting up", live: "Live" }[f]} {f === "all" ? rows.length : count(f)}
              </Chip>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="dtable ad-table">
              <thead><tr>{["Salon", "Setup", "Today", "Stripe", "Devices", "Health", ""].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>
                {shown.map(({ s, health }) => {
                  const st = STRIPE[stripeState(s)];
                  const inv = invites.find((i) => i.salon_id === s.salon_id);
                  const step = Math.min(s.setup_step + 1, 10);
                  return (
                    <tr key={s.salon_id} id={`s-${s.salon_id}`}>
                      <td><Link href={`/admin/salons/${s.salon_id}`} className="ad-name" data-testid="salon-link">{s.salon_name} ›</Link><div className="cap">{s.owner_name ?? "No owner"}{s.owner_phone ? ` · ${fmtPhone(s.owner_phone.replace(/^\+1/, ""))}` : ""} · {s.staff} staff · {s.state}</div></td>
                      <td style={{ minWidth: 110 }}>{s.owner_joined
                        ? <><ProgressBar value={isLive(s) ? 1 : step / 10} thickness="thin" ink label={`Setup ${step} of 10`} /><div className="cap">{isLive(s) ? "Done" : `Step ${step} of 10`}</div></>
                        : <span className="cap">Owner not joined</span>}</td>
                      <td className="num"><b style={{ fontWeight: 600 }}>{$0(s.cents_today)}</b><div className="cap">{s.tickets_today} tickets</div></td>
                      <td><span className={`ad-pill ${st[1]}`}>{st[0]}</span></td>
                      <td className="num">{s.devices ? `${s.devices_online} of ${s.devices} online` : <span className="cap">None</span>}</td>
                      <td><span className={`ad-pill ${health}`}>{HEALTH[health]}</span></td>
                      <td>{!s.owner_joined && s.owner_name && <span style={{ display: "inline-flex", gap: 6 }}>
                        {inv?.code && <Button size="sm" onClick={() => copy(inviteText(s.owner_name!, s.salon_name, inv.code!))}>Copy invite · {inv.code}</Button>}
                        {admin.gate === "live" && <Button size="sm" variant="ghost" onClick={() => void newCode(s)}>New code</Button>}
                      </span>}</td>
                    </tr>
                  );
                })}
                {!shown.length && <tr><td colSpan={7} className="cap">No salons here.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </>}
      {adding && <AddSalon live={admin.gate === "live"} onClose={closeAdd} onMade={() => { void admin.reload(); void loadInvites(); }} copy={copy} inviteText={inviteText} />}
    </AdminShell>
  );
}

function Tiles({ o }: { o: NonNullable<ReturnType<typeof useAdmin>["data"]> }) {
  const t = totals(o);
  const atRisk = openAlerts(o).filter((a) => a.level === "bad");
  const weekday = new Date(o.now).toLocaleDateString("en-US", { weekday: "short" });
  const tiles = [
    { label: "Active salons", value: String(t.salons), sub: `${t.live} live · ${t.settingUp} setting up` },
    { label: "Card + cash today", value: $0(t.centsToday), sub: "Salons’ money, not ours" },
    { label: "Tickets today", value: String(t.ticketsToday), sub: vsWeekAgo(t.ticketsToday, t.ticketsWeekAgo, weekday) ?? "No tickets last week" },
    { label: "At risk", value: String(new Set(atRisk.map((a) => a.salon_id)).size), sub: atRisk.map((a) => a.salon).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "None" },
  ];
  return (
    <section className="ad-tiles" aria-label="Business at a glance">
      {tiles.map((k) => (
        <div key={k.label} className="card pad">
          <div className="eyebrow">{k.label}</div>
          <div className="num" style={{ fontSize: 28, lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.03em", marginTop: 4 }}>{k.value}</div>
          <div className="cap">{k.sub}</div>
        </div>
      ))}
    </section>
  );
}

const STATES = ["CA", "TX", "FL", "NY", "WA", "MN", "GA", "IL", "NJ", "PA", "VA", "NC", "AZ", "MA", "CO", "OR", "NV", "OTHER"];
function AddSalon({ live, onClose, onMade, copy, inviteText }: {
  live: boolean; onClose: () => void; onMade: () => void; copy: (t: string) => void; inviteText: (o: string, s: string, c: string) => string;
}) {
  const [f, setF] = useState({ salon: "", state: "CA", owner: "", phone: "", email: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ code: string; salon: string; owner: string; phone: string } | null>(null);

  const create = async () => {
    setErr("");
    if (!f.salon.trim() || !f.owner.trim()) return setErr("Salon name and owner name are needed.");
    if (!phoneOk(f.phone)) return setErr("Owner phone: 10 digits, like (408) 555-0110.");
    if (!live) return setErr("Test version: sign in as an admin to add a real salon.");
    setBusy(true);
    try {
      const r = await rpc<{ salon_id: string; code: string }>("admin_create_salon", {
        p_salon: f.salon.trim(), p_state: f.state, p_owner: f.owner.trim(), p_phone: e164(f.phone), p_email: f.email.trim() || null,
      });
      setMade({ code: r.code, salon: f.salon.trim(), owner: f.owner.trim(), phone: f.phone });
      onMade();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Drawer title="Add salon by invite" onClose={onClose}
      footer={made ? <Button variant="primary" block onClick={onClose}>Done</Button>
        : <Button variant="primary" block disabled={busy} onClick={() => void create()} data-testid="add-salon-go">{busy ? "Adding…" : "Add salon + invite"}</Button>}>
      {made ? (
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="invite-made">
          <b>{made.salon} is ready for {made.owner}</b>
          <span className="cap">Invite code <b style={{ fontFamily: "monospace", fontSize: 16 }}>{made.code}</b> · sign in at {location.origin}/login with {made.phone}</span>
          <div><Button size="sm" onClick={() => copy(inviteText(made.owner, made.salon, made.code))}>Copy invite text</Button></div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="add-salon">
          <Field id="a-salon" label="Salon name" value={f.salon} onChange={(e) => setF({ ...f, salon: e.target.value })} />
          <div>
            <label className="lbl" htmlFor="a-state">State</label>
            <select className="inp" id="a-state" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>{STATES.map((x) => <option key={x}>{x}</option>)}</select>
          </div>
          <Field id="a-owner" label="Owner name" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
          <Field id="a-phone" label="Owner mobile" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: fmtPhone(e.target.value) })} />
          <Field id="a-email" label="Owner email (optional)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          {err && <div className="hint err" role="alert">{err}</div>}
          <p className="cap">The owner signs in with this phone (or email) and the salon is theirs. They finish the 10 setup steps themselves.</p>
        </div>
      )}
    </Drawer>
  );
}
