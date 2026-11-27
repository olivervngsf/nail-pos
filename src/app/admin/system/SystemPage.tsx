"use client";
// Founder Admin · System (board A6; System Design "Running smooth", issue #22). Oliver + Elang only; salons never see it.
// Tiles: Stripe messages, payments matched, admins with 2-step, our costs vs income. "Running smooth" list worst first:
// live facts (2-step, texting 10DLC, Stripe) + checks we tick by hand with a note (backups, restore test, Sentry, uptime…).
// Our monthly costs typed in by hand. Data: admin_system / admin_check_set / admin_cost_set (migration admin_system).
import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "@/lib/auth";
import { api } from "@/lib/api";
import { income } from "@/lib/admin/health";
import { STATUS_LABEL, checks, sampleSystem, sortChecks, summary, totalCents, type Check, type CheckStatus, type Cost, type SystemFacts } from "@/lib/admin/system";
import { Button, Chip, Drawer, Field, Skeleton } from "@/components/kit";
import { AdminShell, useAdmin } from "../shell";

const CACHE = "nailpos.admin.system";
const PILL: Record<CheckStatus, string> = { ok: "good", warn: "warn", bad: "bad", not_set: "" };
const $ = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function SystemPage() {
  const admin = useAdmin();
  const [f, setF] = useState<SystemFacts | null>(null);
  const [edit, setEdit] = useState<Check | null>(null);
  const [costs, setCosts] = useState(false);

  const load = useCallback(async () => {
    if (admin.gate === "demo") { setF((cur) => cur ?? sampleSystem()); return; }
    if (admin.gate !== "live") return;
    try {
      const s = await rpc<SystemFacts>("admin_system");
      setF(s);
      try { localStorage.setItem(CACHE, JSON.stringify(s)); } catch { /* private mode */ }
    } catch {
      try { const c = localStorage.getItem(CACHE); if (c) setF(JSON.parse(c)); } catch { /* ignore */ }
    }
  }, [admin.gate]);
  useEffect(() => { void load(); }, [load]);

  const list = useMemo(() => (f ? sortChecks(checks(f)) : []), [f]);
  const sum = summary(list);
  const inc = admin.data ? income(admin.data).cents : 0;

  const saveCheck = async (c: Check, status: CheckStatus, note: string) => {
    if (admin.gate === "demo" || !f) {
      setF((x) => x && { ...x, checks: [...x.checks.filter((r) => r.key !== c.key), { key: c.key, status, note, at: new Date().toISOString(), by: "You" }] });
    } else {
      try { await rpc("admin_check_set", { p_key: c.key, p_status: status, p_note: note }); await load(); }
      catch (e) { return admin.say((e as Error).message); }
    }
    setEdit(null); admin.say(`${c.title}: ${STATUS_LABEL[status]}`);
  };
  const saveCost = async (name: string, cents: number | null) => {
    if (!f) return;
    if (admin.gate === "demo") {
      setF({ ...f, costs: [...f.costs.filter((c) => c.name !== name), ...(cents === null ? [] : [{ name, cents }])].sort((a, b) => b.cents - a.cents) });
      return;
    }
    try { await rpc("admin_cost_set", { p_month: f.month, p_name: name, p_cents: cents }); await load(); }
    catch (e) { admin.say((e as Error).message); }
  };

  const monthName = f ? new Date(`${f.month}T12:00:00`).toLocaleDateString("en-US", { month: "short" }) : "";
  const spend = f ? totalCents(f.costs) : 0;
  const twoStep = f ? f.admins.filter((a) => a.twoStep).length : 0;

  return (
    <AdminShell tab="system" admin={admin} title="System"
      actions={f && <span className={`ad-pill ${sum.level}`} data-testid="system-summary">{sum.text}</span>}>
      {!f ? <Skeleton lines={4} /> : (
        <>
          <section className="ad-tiles" aria-label="System at a glance">
            {[
              { label: "Stripe messages · 24h", value: String(f.stripe.day), sub: f.stripe.last ? `${f.stripe.week} in 7 days · last ${when(f.stripe.last)}` : "None yet (webhook set?)" },
              { label: "Payments matched · 7 days", value: f.stripe.payWeek ? `${f.stripe.payMatched}/${f.stripe.payWeek}` : "—", sub: f.stripe.payWeek > f.stripe.payMatched ? `${f.stripe.payWeek - f.stripe.payMatched} without a ticket: check` : "Every card payment has its ticket" },
              { label: "2-step login · admins", value: `${twoStep}/${f.admins.length}`, sub: f.admins.map((a) => `${a.name} ${a.twoStep ? "✓" : "✗"}`).join(" · ") || "No admins" },
              { label: `Our costs · ${monthName}`, value: $(spend), sub: `vs ${$(inc)} income${spend > inc ? ` · ${$(spend - inc)} short` : ""}` },
            ].map((k) => (
              <div key={k.label} className="card pad" data-testid={`tile-${k.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`}>
                <div className="eyebrow">{k.label}</div>
                <div className="num" style={{ fontSize: 28, lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.03em", marginTop: 4 }}>{k.value}</div>
                <div className="cap">{k.sub}</div>
              </div>
            ))}
          </section>

          <StripeHooks live={admin.gate === "live"} say={admin.say} />

          <div className="ad-split">
            <section className="ad-wide-col" aria-label="Running smooth checks">
              <div className="group" data-testid="system-checks">
                <div className="row s" style={{ fontWeight: 600 }}>Running smooth checks<span className="cap" style={{ marginLeft: "auto", fontWeight: 400 }}>Tap one to tick it</span></div>
                {list.map((c) => (
                  <button key={c.key} type="button" className="opt" disabled={c.auto} onClick={() => setEdit(c)} data-testid={`check-${c.key}`}
                    style={{ cursor: c.auto ? "default" : "pointer", alignItems: "flex-start", padding: "10px 16px" }}>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <b style={{ fontWeight: 600 }}>{c.title}{c.auto && <span className="cap" style={{ fontWeight: 400 }}> · live</span>}</b>
                      <span className="cap">{c.note || c.how}</span>
                      {c.at && !c.auto && <span className="cap">Checked {when(c.at)}{c.by ? ` by ${c.by}` : ""}</span>}
                    </span>
                    <span className={`ad-pill ${PILL[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="ad-side" aria-label="Our costs">
              <div className="group" data-testid="system-costs">
                <div className="row s" style={{ fontWeight: 600 }}>Our costs · {monthName}<button type="button" className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => setCosts(true)}>Edit</button></div>
                {f.costs.map((c) => <div key={c.name} className="row s"><span className="g">{c.name}</span><b className="num">{$(c.cents)}</b></div>)}
                {!f.costs.length && <div className="row s"><span className="cap">No costs typed in for {monthName} yet.</span></div>}
                <div className="row s"><span className="g" style={{ fontWeight: 600 }}>Total</span><b className="num">{$(spend)}</b></div>
                <div className="row s"><span className="cap">Stripe $0: salons pay their own card fees. Full list: Running costs doc.</span></div>
              </div>
            </section>
          </div>
        </>
      )}
      {edit && <CheckDrawer c={edit} onClose={() => setEdit(null)} onSave={saveCheck} />}
      {costs && f && <CostsDrawer f={f} onClose={() => setCosts(false)} onSave={saveCost} />}
    </AdminShell>
  );
}

function CheckDrawer({ c, onClose, onSave }: { c: Check; onClose: () => void; onSave: (c: Check, s: CheckStatus, note: string) => Promise<void> }) {
  const [status, setStatus] = useState<CheckStatus>(c.status === "not_set" ? "ok" : c.status);
  const [note, setNote] = useState(c.note.replace(/ · over \d+ months ago: do it again$/, ""));
  const [busy, setBusy] = useState(false);
  return (
    <Drawer title={c.title} onClose={onClose}
      footer={<Button variant="primary" block disabled={busy} data-testid="check-save" onClick={async () => { setBusy(true); await onSave(c, status, note.trim()); setBusy(false); }}>Save · checked today</Button>}>
      <p className="cap">{c.how}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["ok", "warn", "bad", "not_set"] as CheckStatus[]).map((s) => <Chip key={s} on={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Chip>)}
      </div>
      <Field id="check-note" label="What you checked (short)" placeholder="e.g. restore took 4 min, salon opened fine" value={note} onChange={(e) => setNote(e.target.value)} />
    </Drawer>
  );
}

function CostsDrawer({ f, onClose, onSave }: { f: SystemFacts; onClose: () => void; onSave: (name: string, cents: number | null) => Promise<void> }) {
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  const cents = (s: string) => Math.round(parseFloat(s.replace(/[$,]/g, "")) * 100);
  const add = async () => {
    if (!name.trim() || !(cents(amt) >= 0)) return;
    await onSave(name.trim(), cents(amt)); setName(""); setAmt("");
  };
  const copyLast = async () => { for (const c of f.lastCosts as Cost[]) if (!f.costs.some((x) => x.name === c.name)) await onSave(c.name, c.cents); };
  return (
    <Drawer title="Our costs this month" onClose={onClose} footer={<Button block onClick={onClose}>Done</Button>}>
      <p className="cap">What we pay each month (from the bills). Same name = change it; × = remove.</p>
      <div className="group">
        {f.costs.map((c) => (
          <div key={c.name} className="row s"><span className="g">{c.name}</span><b className="num">{$(c.cents)}</b>
            <button type="button" className="btn sm ghost" aria-label={`Remove ${c.name}`} onClick={() => void onSave(c.name, null)}>×</button></div>
        ))}
        {!f.costs.length && <div className="row s"><span className="cap">Nothing yet.</span></div>}
      </div>
      {!!f.lastCosts.length && <Button size="sm" onClick={() => void copyLast()}>Copy last month’s lines</Button>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
        <Field id="cost-name" label="What" placeholder="Supabase" value={name} onChange={(e) => setName(e.target.value)} />
        <Field id="cost-amt" label="$ / month" inputMode="decimal" placeholder="25" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </div>
      <Button variant="primary" onClick={() => void add()} data-testid="cost-add">Add / change</Button>
    </Drawer>
  );
}

type Hook = { kind: "payments" | "billing"; url: string; on: boolean; events: number; missing: string[]; secret: "env" | "saved" | "none" };
const HOOK_NAME = { payments: "Card payments (salon accounts)", billing: "Plans + text credit (our account)" };

/** Our two Stripe webhooks: are they there, listening for every event, and do we hold their secret? One tap fixes both. */
function StripeHooks({ live, say }: { live: boolean; say: (m: string) => void }) {
  const [r, setR] = useState<{ test: boolean; realSite: boolean; hooks: Hook[] } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const call = useCallback(async (action: "status" | "setup") => {
    setErr("");
    try { setR(await api("/api/admin/stripe-webhooks", { action })); if (action === "setup") say("Stripe webhooks set up"); }
    catch (e) { setErr((e as Error).message); }
  }, [say]);
  useEffect(() => { if (live) void call("status"); }, [live, call]);
  if (!live) return null;
  const ok = (h: Hook) => h.on && !h.missing.length && h.secret !== "none";
  const allOk = !!r && r.hooks.every(ok);
  return (
    <section className="group" aria-label="Stripe webhooks" data-testid="stripe-hooks">
      <div className="row s" style={{ fontWeight: 600 }}>
        Stripe webhooks{r && <span className="cap" style={{ fontWeight: 400 }}>&nbsp;· {r.test ? "test mode" : "live mode"}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {r && <span className={`ad-pill ${allOk ? "good" : "warn"}`}>{allOk ? "All set" : "Needs setup"}</span>}
          {r && !allOk && <Button size="sm" variant="primary" disabled={busy || !r.realSite} data-testid="hooks-setup"
            onClick={async () => { setBusy(true); await call("setup"); setBusy(false); }}>{busy ? "Setting up…" : "Set up webhooks"}</Button>}
        </span>
      </div>
      {!r && !err && <div className="row s"><span className="cap">Checking Stripe…</span></div>}
      {r?.hooks.map((h) => (
        <div key={h.kind} className="row s" data-testid={`hook-${h.kind}`}>
          <span className="g">{HOOK_NAME[h.kind]}<span className="cap">{h.url}{h.events ? ` · ${h.events} events` : ""}{h.missing.length && h.events ? ` · ${h.missing.length} missing` : ""}</span></span>
          <span className={`ad-pill ${ok(h) ? "good" : "warn"}`}>{!h.events ? "Not made" : !h.on ? "Turned off" : h.secret === "none" ? "Secret unknown" : h.missing.length ? "Missing events" : "On"}</span>
        </div>
      ))}
      {r && !r.realSite && !allOk && <div className="row s"><span className="cap">Open this page on polishosapp.com to set them up (preview links come and go).</span></div>}
      {err && <div className="row s"><span className="hint err">{err}</span></div>}
    </section>
  );
}
