"use client";
// Founder Admin · Salons tab = design E "Salon care" (board Founder Admin Variations): is every salon OK, when did we last
// talk to them, what do they need from us, did they pay us. No sales up front (a word: busy / normal / quiet).
// 3 dots on each row: log a check-in, call, text, open, edit details, texting status, ask for support access, archive.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { e164, rpc, showCode } from "@/lib/auth";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import {
  MOOD, PILOT_ENDS_SOON_DAYS, TEXTING, checkinDue, daysSinceCheckin, income, needDueIn,
  pilotDaysLeft, planOf, type Mood, type SalonFacts, type Texting,
} from "@/lib/admin/health";
import { COLUMNS, COLUMN_LABEL, TONE_LABEL, columnSummary, healthRows, isOff, type Column, type HealthRow, type Tone } from "@/lib/admin/signals";
import { Button, Chip, Drawer, Field } from "@/components/kit";
import StatusIcon from "@/components/StatusIcon";
import { AdminShell, useAdmin, type Admin } from "../shell";

type Invite = { salon_id: string; code: string | null; owner_name: string | null };
// Filter: everyone, by overall tone, or by one check (a card on top).
type Filter = "all" | "bad" | "watch" | "good" | Column;
type Open = { kind: "checkin" | "edit" | "texting" | "archive"; s: SalonFacts } | null;
/** Tab on the salon page each check opens. */
export const TAB_OF: Record<Column, string> = { stripe: "stripe", devices: "devices", speed: "speed", talks: "checkins", bills: "plan", texting: "texting" };
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const daysAgo = (n: number) => (n <= 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`);

/** Needs from us: the open next step + when, or a nudge we worked out (pilot ending, check-in due). */
function needCell(s: SalonFacts, now: string): { text: string; due: string; hot: boolean } {
  const left = pilotDaysLeft(s, now);
  if (s.need) {
    const d = needDueIn(s, now);
    const who = s.need_who ? ` · ${s.need_who}` : "";
    if (d === null) return { text: s.need, due: s.need_who ?? "", hot: false };
    return { text: s.need, due: (d < 0 ? `Overdue ${-d} day${d === -1 ? "" : "s"}` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`) + who, hot: d <= 0 };
  }
  if (left !== null && left <= PILOT_ENDS_SOON_DAYS) return { text: `Pilot ends in ${left} day${left === 1 ? "" : "s"}: ask to stay`, due: checkinDue(s, now) ? "Check-in due" : "", hot: true };
  if (checkinDue(s, now)) return { text: "Time to say hello", due: "Check-in due", hot: true };
  return { text: "Nothing open", due: "", hot: false };
}

/** "1 person" / "6 people": everyone on the salon team (owner, managers, desk, techs). */
const people = (n: number | null | undefined) => (n === 1 ? "1 person" : `${n ?? 0} people`);

export default function SalonsPage() {
  const admin = useAdmin();
  const router = useRouter();
  const q = useSearchParams();
  const [adding, setAdding] = useState(q.get("add") === "1");
  const [filter, setFilter] = useState<Filter>("all");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  const loadInvites = useCallback(async () => {
    if (admin.gate !== "live") return;
    try { setInvites(await rpc<Invite[]>("admin_salons")); } catch { /* offline: no codes */ }
  }, [admin.gate]);
  useEffect(() => { void loadInvites(); }, [loadInvites]);

  const o = admin.data;
  const rows = useMemo(() => (o ? healthRows(o.salons, o.now) : []), [o]);
  const fits = (f: Filter, r: HealthRow) =>
    f === "all" || (f === "bad" || f === "watch" ? r.tone === f : f === "good" ? !isOff(r.tone) : isOff(r.cells[f].tone));
  const shown = rows.filter((r) => fits(filter, r));
  const count = (f: Filter) => rows.filter((r) => fits(f, r)).length;
  const pick = (f: Filter) => setFilter((x) => (x === f && f !== "all" ? "all" : f));

  const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => admin.say("Copied")); };
  const inviteText = (owner: string, salon: string, code: string) =>
    `Hi ${owner}, your PolishOS salon "${salon}" is ready. Open ${location.origin}/invite/${code} and sign in with this phone or email (or Google). Invite code: ${showCode(code)} (good for 7 days).`;
  const run = async (fn: string, args: Record<string, unknown>, done: string) => {
    if (admin.gate !== "live") { admin.say("Test version: sign in as an admin to save this."); return false; }
    try { await rpc(fn, args); admin.say(done); await admin.reload(); return true; }
    catch (e) { admin.say((e as Error).message); return false; }
  };
  const newCode = async (s: SalonFacts) => { if (await run("admin_new_code", { p_salon: s.salon_id }, `New code for ${s.salon_name}`)) void loadInvites(); };
  const closeAdd = () => { setAdding(false); if (q.get("add")) router.replace("/admin/salons"); };

  return (
    <AdminShell tab="salons" admin={admin} title="Salons" actions={<Button variant="primary" onClick={() => setAdding(true)} data-testid="add-salon-open">+ Add salon by invite</Button>}>
      {o && <>
        <section className="hl-cards" aria-label="Checks at a glance">
          {COLUMNS.map((c) => {
            const k = columnSummary(rows, c);
            const names = k.off.map((r) => r.s.salon_name.split(" ")[0].replace(/[’']s$/, ""));
            return (
              <button key={c} type="button" className={`card hl-card${filter === c ? " is-on" : ""}`} aria-pressed={filter === c} onClick={() => pick(c)} data-testid={`card-${c}`}>
                <span className="hl-card-t">{COLUMN_LABEL[c]}</span>
                <span className="hl-card-v"><StatusIcon tone={k.tone} size={20} />{k.off.length ? `${k.off.length} off` : "All OK"}</span>
                <span className="cap">{[...names.slice(0, 3), names.length > 3 ? `+${names.length - 3}` : "", `${k.ok} OK`].filter(Boolean).join(" · ")}</span>
              </button>
            );
          })}
        </section>
        <section className="group hl-table" style={{ padding: 0, gap: 0 }} data-testid="salon-list">
          <div className="ad-tablehead">
            <h2 className="h2" style={{ margin: "0 auto 0 0" }}>{filter === "all" ? "All salons · worst first" : filter in COLUMN_LABEL ? `${COLUMN_LABEL[filter as Column]} · needs a look` : TONE_LABEL[filter as Tone]}
              <span className="cap" style={{ fontWeight: 400, marginLeft: 8 }} data-testid="people-total">{people(shown.reduce((n, r) => n + (r.s.staff ?? 0), 0))} in {shown.length === 1 ? "1 salon" : `${shown.length} salons`}</span></h2>
            {(["all", "bad", "watch", "good"] as Filter[]).map((f) => (
              <Chip key={f} on={filter === f} aria-pressed={filter === f} onClick={() => pick(f)} data-testid={`f-${f}`}>
                {{ all: "All", bad: "Needs us", watch: "Watch", good: "Good" }[f as "all"]} {f === "all" ? rows.length : count(f)}
              </Chip>
            ))}
          </div>
          <div className="hl-row hl-head" aria-hidden="true"><span>Salon</span>{COLUMNS.map((c) => <span key={c}>{COLUMN_LABEL[c]}</span>)}<span>Next step</span><span /></div>
          {shown.map((r) => {
            const { s } = r;
            const inv = invites.find((i) => i.salon_id === s.salon_id);
            const need = needCell(s, o.now);
            const href = (tab?: string) => `/admin/salons/${s.salon_id}${tab ? `?tab=${tab}` : ""}`;
            return (
              <div key={s.salon_id} className="hl-row" id={`s-${s.salon_id}`} data-testid="salon-row" data-tone={r.tone}>
                <Link href={href()} className="hl-who" data-testid="salon-link">
                  <StatusIcon tone={r.tone} size={20} label={TONE_LABEL[r.tone]} />
                  <span className="hl-who-t"><b>{s.salon_name}</b><span className="cap"><span data-testid="people">{people(s.staff)}</span> · <span data-testid="why">{r.why}</span></span></span>
                </Link>
                {COLUMNS.map((c) => (
                  <Link key={c} href={href(TAB_OF[c])} className={`hl-cell${r.cells[c].tone === "none" ? " is-dim" : ""}`} title={r.cells[c].tip} data-testid={`c-${c}`}>
                    <StatusIcon tone={r.cells[c].tone} size={16} /><span className="hl-lbl">{COLUMN_LABEL[c]}</span><span className="hl-w">{r.cells[c].word}</span>
                  </Link>
                ))}
                <span className={`hl-next${need.hot ? "" : " is-dim"}`} data-testid="need">{need.text}{need.due ? <span className="cap"> · {need.due}</span> : null}</span>
                <span className="hl-dots">
                  <RowMenu s={s} open={menu === s.salon_id} onToggle={(v) => setMenu(v ? s.salon_id : null)} invite={inv?.code ?? null} live={admin.gate === "live"}
                    onPick={(kind) => setOpen({ kind, s })} onCopyInvite={(code) => copy(inviteText(s.owner_name ?? "", s.salon_name, code))} onNewCode={() => void newCode(s)}
                    onNeedDone={() => void run("admin_need_done", { p_salon: s.salon_id }, "Marked done")} />
                </span>
              </div>
            );
          })}
          {!shown.length && <p className="cap" style={{ margin: 0, padding: 16 }}>No salons here.</p>}
          <div className="hl-legend cap">
            {(["bad", "watch", "good", "none"] as Tone[]).map((t) => <span key={t}><StatusIcon tone={t} size={14} />{TONE_LABEL[t]}</span>)}
            <span className="hl-legend-tip">Tap a salon or any check to open that tab · {Math.round(income(o).cents / 100) ? `paid us $${Math.round(income(o).cents / 100)}/mo` : "no paid plans yet"}</span>
          </div>
        </section>
        {(o.archived?.length ?? 0) > 0 && (
          <section className="group" data-testid="archived">
            <div className="row s"><b style={{ fontWeight: 600 }}>Archived salons</b><span className="cap">Closed to their staff. Nothing is deleted.</span></div>
            {o.archived!.map((a) => (
              <div key={a.salon_id} className="row s"><span className="g">{a.salon_name}</span><span className="cap">Archived {dayMonth(a.archived_at)}</span>
                <Button size="sm" onClick={() => void run("admin_salon_archive", { p_salon: a.salon_id, p_on: false }, `${a.salon_name} is back`)}>Restore</Button></div>
            ))}
          </section>
        )}
      </>}
      {adding && <AddSalon live={admin.gate === "live"} onClose={closeAdd} onMade={() => { void admin.reload(); void loadInvites(); }} copy={copy} inviteText={inviteText} />}
      {open?.kind === "checkin" && <CheckIn s={open.s} admin={admin} onClose={() => setOpen(null)} />}
      {open?.kind === "edit" && <EditSalon s={open.s} admin={admin} run={run} onClose={() => setOpen(null)} />}
      {open?.kind === "texting" && <SetTexting s={open.s} run={run} onClose={() => setOpen(null)} />}
      {open?.kind === "archive" && <ArchiveSalon s={open.s} run={run} onClose={() => setOpen(null)} />}
    </AdminShell>
  );
}

type Run = (fn: string, args: Record<string, unknown>, done: string) => Promise<boolean>;

/** 3 dots on a row: the shortcuts for one salon. Closes on Escape, on a click outside, and after a pick. */
function RowMenu({ s, open, onToggle, invite, live, onPick, onCopyInvite, onNewCode, onNeedDone }: {
  s: SalonFacts; open: boolean; onToggle: (v: boolean) => void; invite: string | null; live: boolean;
  onPick: (k: "checkin" | "edit" | "texting" | "archive") => void; onCopyInvite: (code: string) => void; onNewCode: () => void; onNeedDone: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // The table scrolls sideways in its own box, which would cut the menu off: pin the menu to the screen under the button.
  const [at, setAt] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  useEffect(() => {
    if (!open) return setAt(null);
    const r = box.current!.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    setAt(window.innerHeight - r.bottom < 420 && r.top > window.innerHeight - r.bottom ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
    const since = Date.now(); // a tap can scroll the button into view first: don't count that scroll
    const shut = () => { if (Date.now() - since > 400) onToggle(false); };
    window.addEventListener("scroll", shut, true); window.addEventListener("resize", shut);
    return () => { window.removeEventListener("scroll", shut, true); window.removeEventListener("resize", shut); };
  }, [open, onToggle]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onToggle(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onToggle(false); };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [open, onToggle]);
  const pick = (fn: () => void) => () => { onToggle(false); fn(); };
  const first = s.owner_name?.split(" ")[0] ?? "the owner";
  const ask = `Hi ${first}, this is PolishOS support. To let us look at your screens for 24h, open Settings → Support and tap Turn on. You can end it any time.`;
  return (
    <div ref={box}>
      <button type="button" className={`ad-dots${open ? " open" : ""}`} aria-label={`Actions for ${s.salon_name}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => onToggle(!open)} data-testid="row-menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && at && (
        <div className="ad-menu" role="menu" aria-label={`Actions for ${s.salon_name}`} style={at}>
          <button type="button" role="menuitem" onClick={pick(() => onPick("checkin"))} data-testid="m-checkin">Log a check-in</button>
          {s.need && <button type="button" role="menuitem" onClick={pick(onNeedDone)}>Mark “{s.need.length > 24 ? `${s.need.slice(0, 24)}…` : s.need}” done</button>}
          {s.owner_phone && <a role="menuitem" href={`tel:${s.owner_phone}`} onClick={() => onToggle(false)}>Call {first}</a>}
          {s.owner_phone && <a role="menuitem" href={`sms:${s.owner_phone}`} onClick={() => onToggle(false)}>Text {first}</a>}
          <hr />
          <Link role="menuitem" href={`/admin/salons/${s.salon_id}`}>Open salon page</Link>
          <button type="button" role="menuitem" onClick={pick(() => onPick("edit"))} data-testid="m-edit">Edit salon details</button>
          <button type="button" role="menuitem" onClick={pick(() => onPick("texting"))}>Set texting status</button>
          {s.owner_joined && s.owner_phone && <a role="menuitem" href={`sms:${s.owner_phone}?&body=${encodeURIComponent(ask)}`} onClick={() => onToggle(false)}>Ask for support access</a>}
          {!s.owner_joined && invite && <button type="button" role="menuitem" onClick={pick(() => onCopyInvite(invite))}>Copy invite · {invite}</button>}
          {!s.owner_joined && s.owner_name && live && <button type="button" role="menuitem" onClick={pick(onNewCode)}>New invite code</button>}
          <hr />
          <button type="button" role="menuitem" className="danger" onClick={pick(() => onPick("archive"))} data-testid="m-archive">Archive salon…</button>
        </div>
      )}
    </div>
  );
}

export function CheckIn({ s, admin, onClose }: { s: SalonFacts; admin: Admin; onClose: () => void }) {
  const o = admin.data!;
  const [mood, setMood] = useState<Mood | null>(null);
  const [note, setNote] = useState("");
  const [need, setNeed] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState(o.me.split(" ")[0] ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!mood) return setErr("Pick how it was.");
    setErr("");
    if (admin.gate === "demo") { admin.checkin(s.salon_id, { mood, note: note.trim(), need: need.trim(), due: due || null, who: who.trim() }); return onClose(); }
    setBusy(true);
    try {
      await rpc("admin_checkin", { p_salon: s.salon_id, p_mood: mood, p_note: note.trim(), p_need: need.trim(), p_due: due || null, p_who: who.trim() });
      admin.say("Check-in saved"); await admin.reload(); onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Drawer title={`Check-in · ${s.salon_name}`} onClose={onClose}
      footer={<Button variant="primary" block disabled={busy} onClick={() => void save()} data-testid="checkin-save">{busy ? "Saving…" : "Save check-in"}</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="checkin-form">
        <p className="cap" style={{ margin: 0 }}>{s.owner_name ?? "Owner"} · {s.checkin_at ? `last check-in ${daysAgo(daysSinceCheckin(s, o.now)).toLowerCase()}` : "no check-in yet"}</p>
        <div>
          <span className="lbl">How was it?</span>
          <div className="ad-texting" role="group" aria-label="How was it?">
            {(Object.keys(MOOD) as Mood[]).map((m) => <Chip key={m} on={mood === m} aria-pressed={mood === m} onClick={() => setMood(m)}>{MOOD[m][0]}</Chip>)}
          </div>
        </div>
        <div><label className="lbl" htmlFor="c-note">What did we see or hear?</label>
          <textarea className="inp" id="c-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} style={{ height: "auto", padding: "10px 12px" }} /></div>
        <Field id="c-need" label="What do they need from us? (optional)" maxLength={300} value={need} onChange={(e) => setNeed(e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field id="c-due" label="Follow up by" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <Field id="c-who" label="Who" maxLength={60} value={who} onChange={(e) => setWho(e.target.value)} />
        </div>
        {err && <div className="hint err" role="alert">{err}</div>}
        <p className="cap" style={{ margin: 0 }}>Only Oliver and Elang see check-ins. The salon never does. A new need replaces the open one.</p>
      </div>
    </Drawer>
  );
}

function EditSalon({ s, admin, run, onClose }: { s: SalonFacts; admin: Admin; run: Run; onClose: () => void }) {
  const [f, setF] = useState({ name: s.salon_name, state: s.state, owner: s.owner_name ?? "", phone: s.owner_phone ? fmtPhone(s.owner_phone.replace(/^\+1/, "")) : "", email: "" });
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    if (!f.name.trim()) return setErr("Salon name is needed.");
    if (!s.owner_joined && f.phone && !phoneOk(f.phone)) return setErr("Owner phone: 10 digits, like (408) 555-0110.");
    const ok = await run("admin_salon_edit", {
      p_salon: s.salon_id, p_name: f.name.trim(), p_state: f.state,
      p_owner: s.owner_joined ? null : f.owner.trim() || null, p_phone: s.owner_joined || !f.phone ? null : e164(f.phone), p_email: s.owner_joined || !f.email.trim() ? null : f.email.trim(),
    }, "Saved");
    if (ok || admin.gate !== "live") onClose();
  };
  return (
    <Drawer title="Edit salon details" onClose={onClose} footer={<Button variant="primary" block onClick={() => void save()} data-testid="edit-save">Save</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="edit-form">
        <Field id="e-name" label="Salon name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div><label className="lbl" htmlFor="e-state">State</label>
          <select className="inp" id="e-state" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>{[...new Set([s.state, ...STATES])].map((x) => <option key={x}>{x}</option>)}</select></div>
        {s.owner_joined
          ? <p className="cap" style={{ margin: 0 }}>{s.owner_name ?? "The owner"} has joined, so the owner’s name, phone and email are theirs to change (in their own profile).</p>
          : <>
            <Field id="e-owner" label="Owner name" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
            <Field id="e-phone" label="Owner mobile" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: fmtPhone(e.target.value) })} />
            <Field id="e-email" label="Owner email (leave empty to keep)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </>}
        {err && <div className="hint err" role="alert">{err}</div>}
        <p className="cap" style={{ margin: 0 }}>A new name can change the booking link (polishosapp.com/…) if the owner has not picked their own. The change shows in the salon’s activity log.</p>
      </div>
    </Drawer>
  );
}

function SetTexting({ s, run, onClose }: { s: SalonFacts; run: Run; onClose: () => void }) {
  const now = s.texting ?? "not_started";
  return (
    <Drawer title={`Texting · ${s.salon_name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="cap" style={{ margin: 0 }}>Where the salon’s own texting number (10DLC) stands. We register it by hand, so we set it here.</p>
        <div className="ad-texting" role="group" aria-label="Texting status">
          {(Object.keys(TEXTING) as Texting[]).map((t) => (
            <Chip key={t} on={t === now} aria-pressed={t === now} onClick={async () => { if (t !== now) await run("admin_set_texting", { p_salon: s.salon_id, p_status: t }, "Texting status saved"); onClose(); }}>{TEXTING[t][0]}</Chip>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

function ArchiveSalon({ s, run, onClose }: { s: SalonFacts; run: Run; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === s.salon_name.trim().toLowerCase();
  const paying = planOf(s) === "paid" || planOf(s) === "late";
  return (
    <Drawer title="Archive salon" onClose={onClose}
      footer={<Button variant="primary" block disabled={!ok} onClick={async () => { await run("admin_salon_archive", { p_salon: s.salon_id, p_on: true }, `${s.salon_name} archived`); onClose(); }} data-testid="archive-go">Archive {s.salon_name}</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="archive-form">
        <p style={{ margin: 0 }}><b>{s.salon_name}</b> closes for its {s.staff} staff right away: no sign-in, no booking page.</p>
        <p className="cap" style={{ margin: 0 }}>Nothing is deleted. The salon’s data stays theirs, and Restore (bottom of this page) brings it back.</p>
        {paying && <div className="hint err" role="alert">This salon has a paid plan. Archiving does not stop the plan: cancel it in Stripe first.</div>}
        <Field id="x-name" label={`Type the salon name to confirm: ${s.salon_name}`} value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
    </Drawer>
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
          <span className="cap">Invite code <b style={{ fontFamily: "monospace", fontSize: 16 }}>{made.code}</b> · link {location.origin}/invite/{made.code} · or sign in with {made.phone}</span>
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
