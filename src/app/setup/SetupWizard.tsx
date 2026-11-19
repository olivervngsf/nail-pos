"use client";
/* eslint-disable react/jsx-key -- step views return a [footer, body] pair, not a list */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PhoneCodeLogin from "@/components/PhoneCodeLogin";
import { SMS_ON, amPlatformAdmin, homeFor, isSignedIn, myMemberships } from "@/lib/auth";
import { api } from "@/lib/api";
import { dropQueued, syncNow } from "@/lib/offline/outbox";
import { queueSave, withIds } from "./sync";
import { importMenu, shrinkPhoto } from "./menuImport";
import { Button, Segmented, SyncPill } from "@/components/kit";
import { usePrinter } from "@/components/PrinterSetup";
import { pickPrinter } from "@/lib/print/bluetooth";
import { printDoc } from "@/lib/print/print";
import { printInWindow } from "@/lib/print/slip";
import { receiptLines, type Paper, type ReceiptDoc } from "@/lib/print/escpos";
import { useStored } from "@/lib/useStored";
import {
  STEPS, STATES, fmtHours, fmtMoney, fmtPhone, fmtTime, initials, newInviteCode, phoneOk, toMin,
  type PayType, type Service,
} from "@/lib/onboarding/data";
import { initialSetup, SETUP_KEY, type NewStaff, type SetupState } from "./state";

type Set = (fn: (s: SetupState) => SetupState) => void;

export default function SetupWizard() {
  const router = useRouter();
  const [s, setS, { ready, reset }] = useStored<SetupState>(SETUP_KEY, initialSetup);
  const set: Set = (fn) => setS((prev) => fn(prev));
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = (text: string, undo?: () => void) => {
    setToast({ text, undo });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  };

  // Stable ids for the database, and skip sign-in when this device is already signed in.
  useEffect(() => {
    if (!ready) return;
    if (!s.salonId || s.menu.some((m) => !m.id) || s.staff.some((p) => !p.id)) setS((p) => withIds(p));
    // Already signed in: go back to the salon you started (never make a second one), or to Today if it's done.
    if (s.stage !== "wizard") void (async () => {
      if (!(await isSignedIn())) return;
      const ms = SMS_ON ? await myMemberships().catch(() => []) : [];
      const owned = ms.find((m) => m.role === "owner");
      if (owned && owned.setup_step >= 9) return router.replace("/today");
      // Salons are made by PolishOS (invite only): no salon of your own → your home, /admin (us) or the invite code screen.
      if (SMS_ON && !owned) return router.replace(homeFor(ms, !ms.length && (await amPlatformAdmin())));
      setS((p) => ({ ...withIds(owned ? { ...p, salonId: owned.salon_id } : p), stage: "wizard" }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // Signed in for real: the wizard must point at a salon this person owns or manages. Salons are made by invite only
  // (PolishOS team on /admin), so a salon id made on this device is refused by the server ("1 not saved"). Move to
  // the invited salon, or show "you need an invite" instead of letting the owner fill steps that never save.
  const [noInvite, setNoInvite] = useState(false);
  useEffect(() => {
    if (!ready || !SMS_ON || s.stage !== "wizard") return;
    void (async () => {
      if (!(await isSignedIn())) return;
      const mine = await myMemberships().catch(() => null);
      if (!mine) return; // offline: keep going, the queue sends later
      if (mine.some((m) => m.salon_id === s.salonId && (m.role === "owner" || m.role === "manager"))) return setNoInvite(false);
      const owned = mine.find((m) => m.role === "owner");
      await dropQueued("setup.save"); // saves aimed at the wrong salon would never go through
      if (owned) {
        if (owned.setup_step >= 9) return router.replace("/today");
        setS((p) => ({ ...p, salonId: owned.salon_id }));
        return;
      }
      if (await amPlatformAdmin()) return router.replace("/admin");
      setNoInvite(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, s.stage, s.salonId]);
  // Save to the database (through the offline queue) every time the step changes.
  useEffect(() => {
    if (ready && s.stage === "wizard" && !noInvite) queueSave(withIds(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, s.stage, s.step, s.salonId, noInvite]);

  if (!ready) return <div className="wiz" aria-busy="true" />;
  if (s.stage !== "wizard") return <SignIn s={s} set={set} />;
  if (noInvite) return <NoInvite />;
  return <Wizard s={s} set={set} say={say} toast={toast} setToast={setToast} reset={reset} />;
}

/* Signed in, but no salon to set up: salons are added by the PolishOS team, the owner gets an invite link + code. */
function NoInvite() {
  return (
    <Centered>
      <div className="logo" style={{ margin: 0 }}>P</div>
      <h1 className="h1" style={{ margin: 0 }}>You need an invite</h1>
      <p className="cap" style={{ margin: 0, fontSize: 15, lineHeight: "22px" }}>
        PolishOS adds each salon for you. Ask us to add yours with your phone number, then sign in with that number:
        your salon opens here. Nothing you typed on this device was saved to a salon.
      </p>
      <Link className="btn primary" href="/login">Sign in with another number</Link>
      <div className="cap">Questions? Call or text Elang.</div>
    </Centered>
  );
}

/* ---------- sign up / sign in ---------- */
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad in" style={{ width: "100%", maxWidth: 420, padding: 28, gap: 16 }}>{children}</div>
    </main>
  );
}

function SignIn({ s, set }: { s: SetupState; set: Set }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const enter = (salonId?: string) => set((p) => ({
    ...p, stage: "wizard", salonId: salonId ?? p.salonId,
    staff: p.staff.length ? p.staff : [{ id: crypto.randomUUID(), name: p.ownerName || "Owner", phone: p.ownerPhone, role: "Owner", status: "You" }],
  }));
  const done = async () => {
    if (!SMS_ON) return enter();
    try {
      const owned = (await myMemberships()).find((m) => m.role === "owner");
      if (owned && owned.setup_step >= 9) return router.replace("/today");
      if (owned) return enter(owned.salon_id); // keep setting up the salon you already started
      const ms = await myMemberships();
      // No salon of your own: your home, /admin (us) or the invite code screen.
      return router.replace(homeFor(ms, !ms.length && (await amPlatformAdmin())));
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Centered>
      <div className="logo" style={{ margin: 0 }}>P</div>
      <PhoneCodeLogin
        phone={s.ownerPhone} setPhone={(v) => set((p) => ({ ...p, ownerPhone: v }))} onDone={done} title="Start your salon"
        extra={<>
          <div>
            <label className="lbl" htmlFor="on">Your name</label>
            <input className="inp" id="on" autoComplete="name" value={s.ownerName} onChange={(e) => set((p) => ({ ...p, ownerName: e.target.value }))} />
          </div>
          <div>
            <label className="lbl" htmlFor="em">Email (for receipts and backups)</label>
            <input className="inp" id="em" type="email" autoComplete="email" value={s.ownerEmail} onChange={(e) => set((p) => ({ ...p, ownerEmail: e.target.value }))} />
          </div>
        </>}
      />
      {err && <div className="hint err" role="alert">{err}</div>}
      <div className="cap">Free 30-day pilot. One flat monthly price after that. Already have an account? <Link href="/login">Sign in</Link></div>
    </Centered>
  );
}

/* ---------- wizard shell ---------- */
type WizProps = {
  s: SetupState; set: Set; say: (t: string, undo?: () => void) => void;
  toast: { text: string; undo?: () => void } | null; setToast: (t: null) => void; reset: () => void;
};
type Foot = { label?: string; onNext?: () => void; lock?: boolean; skip?: boolean };

function Wizard({ s, set, say, toast, setToast, reset }: WizProps) {
  const pct = Math.round((s.step / (STEPS.length - 1)) * 100);
  const go = (step: number) => set((p) => ({ ...p, step: Math.max(0, Math.min(STEPS.length - 1, step)) }));
  const next = () => go(s.step + 1);
  const salon = s.salonName || "Your salon";
  const props = { s, set, say, next, go };
  const [foot, body] = STEP_VIEWS[s.step](props);

  // Move focus to the new step's heading (keyboard + screen reader users).
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => { head.current?.querySelector<HTMLElement>(".h1")?.focus(); window.scrollTo(0, 0); }, [s.step]);

  return (
    <div className="wiz">
      <aside className="side" aria-label="Setup steps">
        <div className="brand"><span className="logo">{initials(salon)}</span>{salon} setup</div>
        <div className="prog" style={{ margin: "0 8px 14px" }}><span style={{ width: `${pct}%` }} /></div>
        {STEPS.map((n, i) => {
          const sub = stepStatus(s, i);
          return (
            <button key={n} type="button" className={`st has-sub ${i < s.step ? "done" : i === s.step ? "now" : ""}`} aria-current={i === s.step ? "step" : undefined} onClick={() => go(i)}>
              <span className="n">{i < s.step ? "✓" : i + 1}</span>
              <span className="st-name">{n}{sub && <span className={`st-sub ${sub.good ? "good" : ""}`}>{sub.text}</span>}</span>
            </button>
          );
        })}
        <div className="help">Stuck? Elang is on call on your setup day. Your progress saves after every step, even offline. You can change any of this later in Settings.</div>
        <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => { if (confirm("Start setup over? This clears what you entered on this device.")) reset(); }}>Start over</button>
      </aside>
      <div className="main">
        <div className="mtop">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="logo" style={{ width: 30, height: 30, fontSize: 12 }}>{initials(salon)}</span>
            <b style={{ flex: 1 }}>{STEPS[s.step]}</b>
            <span className="cap">Step {s.step + 1} of {STEPS.length}</span>
          </div>
          <div className="prog"><span style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="body in" key={s.step} ref={head}>{body}</div>
        <div className="foot">
          <button className="btn ghost" type="button" disabled={s.step === 0} onClick={() => go(s.step - 1)}>Back</button>
          <span className="sp" />
          <SyncPill />
          {foot.skip && <button className="btn ghost" type="button" onClick={next}>Skip for now</button>}
          {s.step < STEPS.length - 1 && (
            <button className="btn primary" type="button" disabled={foot.lock} onClick={foot.onNext ?? next}>{foot.label ?? "Continue"}</button>
          )}
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span style={{ flex: 1 }}>{toast.text}</span>
          {toast.undo && <button type="button" onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button>}
        </div>
      )}
    </div>
  );
}

type StepProps = { s: SetupState; set: Set; say: (t: string, undo?: () => void) => void; next: () => void; go: (i: number) => void };
type StepView = (p: StepProps) => [Foot, React.ReactNode];
const H1 = ({ children }: { children: React.ReactNode }) => <h1 className="h1" tabIndex={-1} style={{ outline: "none" }}>{children}</h1>;

/** One short line under each step in the side list: what's set up so far ("Connected · Stripe", "NETUM · Bluetooth"). */
export function stepStatus(s: SetupState, i: number): { text: string; good?: boolean } | null {
  const staff = s.staff.filter((p) => p.status !== "You");
  switch (i) {
    case 0: return s.salonName.trim() ? { text: s.salonName.trim() } : null;
    case 1: return s.menu.length ? { text: `${s.menu.length} services` } : null;
    case 2: return staff.length ? { text: `${staff.length} invited · ${staff.filter((p) => p.status === "Joined").length} joined` } : null;
    case 3: return s.stripe === "done" ? { text: "Connected · Stripe", good: true } : s.stripe === "pending" ? { text: "Stripe is checking" } : null;
    case 4: return s.reader === "done" ? { text: `${s.readerLabel || "Front desk"} · Online`, good: true } : null;
    case 5: return s.printer ? { text: s.printer, good: true } : null;
    case 6: return s.step > 6 ? { text: s.deviceName } : null;
    case 7: return s.clients === "file" ? { text: "Upload a file" } : s.clients === "later" ? { text: "Add as they come" } : null;
    case 8: return s.test === "done" ? { text: "$1 test passed", good: true } : null;
    default: return null;
  }
}

/* 1. Salon info */
const SalonInfo: StepView = ({ s, set, say }) => {
  const badDay = s.hours.some((h) => h.on && toMin(h.close) <= toMin(h.open));
  const lock = badDay || !s.salonName.trim();
  const field = (k: "salonName" | "salonPhone" | "address", label: string, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <div>
      <label className="lbl" htmlFor={k}>{label}</label>
      <input className="inp" id={k} value={s[k]} {...extra}
        onChange={(e) => set((p) => ({ ...p, [k]: k === "salonPhone" ? fmtPhone(e.target.value) : e.target.value }))} />
    </div>
  );
  return [{ lock }, <>
    <H1>Tell us about your salon</H1>
    <div className="grid2" style={{ gap: 16 }}>
      {field("salonName", "Salon name", { placeholder: "Mai Nails" })}
      {field("salonPhone", "Salon phone", { inputMode: "tel", placeholder: "(408) 555-0100" })}
      {field("address", "Address", { autoComplete: "street-address" })}
      <div>
        <label className="lbl" htmlFor="st">State</label>
        <select className="inp" id="st" value={s.state} onChange={(e) => set((p) => ({ ...p, state: e.target.value }))}>
          {Object.keys(STATES).map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
    </div>
    <div className="note">{STATES[s.state]}</div>
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="lbl" style={{ flex: 1, margin: 0 }}>Open hours</span>
        <button type="button" className="btn ghost sm" onClick={() => {
          const m = s.hours[0];
          set((p) => ({ ...p, hours: p.hours.map((h) => (h.on ? { ...h, open: m.open, close: m.close } : h)) }));
          say(`Copied Monday ${fmtTime(m.open)} – ${fmtTime(m.close)} to all open days`);
        }}>Copy Monday to all open days</button>
      </div>
      <div className="group" style={{ marginTop: 6 }}>
        {s.hours.map((h, i) => {
          const upd = (v: Partial<typeof h>) => set((p) => ({ ...p, hours: p.hours.map((x, j) => (j === i ? { ...x, ...v } : x)) }));
          const bad = h.on && toMin(h.close) <= toMin(h.open);
          return (
            <div className="row hrow" key={h.day} style={{ padding: "6px 16px", opacity: h.on ? 1 : 0.55 }}>
              <span style={{ width: 40, fontWeight: 600 }}>{h.day}</span>
              <button type="button" className={`sw ${h.on ? "on" : ""}`} role="switch" aria-checked={h.on} aria-label={`${h.day} open`} onClick={() => upd({ on: !h.on })} />
              {h.on ? <>
                <TimeSelect label={`${h.day} opens`} value={h.open} onChange={(v) => upd({ open: v })} />
                <span className="cap">to</span>
                <TimeSelect label={`${h.day} closes`} value={h.close} onChange={(v) => upd({ close: v })} />
                {bad ? <span className="hint err" style={{ margin: 0 }}>Closes before it opens</span> : <span className="cap hl">{fmtHours(h)}</span>}
              </> : <span className="cap">Closed</span>}
            </div>
          );
        })}
      </div>
      <div className="cap" style={{ marginTop: 6 }}>Booking page, calendar and reminders use these hours. Holidays and one-off changes: Settings · Hours.</div>
    </div>
  </>];
};

/* 2. Services */
const Services: StepView = ({ s, set, say, next }) => {
  if (s.svcStage === "reading") return [{ lock: true }, (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "80px 0" }}>
      <div className="spin" /><H1>Reading your menu…</H1>
      <div className="cap">Finding names, minutes and prices</div>
    </div>
  )];
  if (s.svcStage === "review") {
    const kept = s.menu.filter((m) => m.on && m.name.trim()).length;
    const look = s.menu.filter((m) => m.on && m.flag).length;
    const upd = (i: number, v: Partial<Service>) => set((p) => ({ ...p, menu: p.menu.map((m, j) => (j === i ? { ...m, ...v } : m)) }));
    return [{ label: `Save ${kept} services`, lock: kept === 0, onNext: next }, <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <H1>Check your services</H1>
        <span className="cap">{kept} kept{look ? ` · ${look} need a look` : " · all checked ✓"}</span>
      </div>
      <div className="cap" style={{ marginTop: -8 }}>Tap any name, minutes or price to change it. Tap <b>+</b> when the price can go up ($45+): the front desk sets the final price at checkout. Untick to leave a service out.</div>
      <div className="group" style={{ overflow: "auto", maxHeight: "55dvh" }}>
        <table className="svc">
          <thead><tr><th style={{ width: 36 }} /><th className="cat" style={{ width: 140 }}>Category</th><th>Service</th><th className="r" style={{ width: 80 }}>Min</th><th className="r" style={{ width: 124 }} title="+ = starting price, can go up">Price $ · +</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {s.menu.map((m, i) => (
              <tr key={i} style={{ opacity: m.on ? 1 : 0.4 }}>
                <td><input type="checkbox" checked={m.on} aria-label={`Keep ${m.name}`} onChange={(e) => upd(i, { on: e.target.checked })} style={{ width: 20, height: 20 }} /></td>
                <td className="cat"><input className="ed" value={m.cat} aria-label="Category" onChange={(e) => upd(i, { cat: e.target.value })} /></td>
                <td><input className="ed" style={{ fontWeight: 600 }} value={m.name} placeholder="Service name" aria-label="Service name" onChange={(e) => upd(i, { name: e.target.value })} /></td>
                <td className="r"><input className={`ed r ${m.flag ? "flag" : ""}`} inputMode="numeric" value={m.minutes} aria-label="Minutes" title={m.flag ? "Check minutes" : undefined}
                  onChange={(e) => upd(i, { minutes: Number(e.target.value.replace(/\D/g, "")) || 0, flag: false })} /></td>
                <td className="r">
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <PriceInput cents={m.priceCents} onChange={(c) => upd(i, { priceCents: c })} />
                    <button type="button" className={`plus ${m.priceFrom ? "on" : ""}`} aria-pressed={!!m.priceFrom} aria-label={`${m.name}: starting price (and up)`}
                      title={m.priceFrom ? "Starting price: final price set at checkout" : "Tap if the price can go up ($45+)"} onClick={() => upd(i, { priceFrom: !m.priceFrom })}>+</button>
                  </span>
                </td>
                <td><button type="button" className="btn ghost sm" aria-label={`Remove ${m.name}`} onClick={() => {
                  const removed = s.menu[i];
                  set((p) => ({ ...p, menu: p.menu.filter((_, j) => j !== i) }));
                  say(`Removed ${removed.name || "service"}`, () => set((p) => ({ ...p, menu: [...p.menu.slice(0, i), removed, ...p.menu.slice(i)] })));
                }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={() => set((p) => ({ ...p, menu: [...p.menu, { id: crypto.randomUUID(), cat: "Add-ons", name: "", minutes: 15, priceCents: 0, on: true }] }))}>+ Add a service</button>
        <span className="cap">Orange minutes = please double-check. Change anything later in Settings · Services.</span>
      </div>
    </>];
  }
  const ways = [
    ["photo", "Photo of your menu", "Take a photo of the price board"],
    ["link", "Website link", "We read your services page"],
    ["tpl", "Nail salon template", "Common services, edit prices"],
  ] as const;
  const read = async () => {
    if (s.svcWay === "tpl" || !SMS_ON) {
      set((p) => ({ ...p, svcStage: "reading" }));
      setTimeout(() => set((p) => ({ ...p, svcStage: "review" })), 1200);
      return;
    }
    if (s.svcWay === "link" && !s.website.trim()) return say("Type your website first.");
    if (s.svcWay === "photo" && !pendingPhoto) return say("Take or choose a photo of your menu first.");
    set((p) => ({ ...p, svcStage: "reading" }));
    try {
      const r = await importMenu(s.svcWay === "link" ? { url: s.website.trim() } : pendingPhoto!);
      set((p) => ({ ...p, menu: r.services, svcStage: "review" }));
      say(`Found ${r.services.length} services${r.note ? ` · ${r.note}` : ""}`);
    } catch (e) {
      set((p) => ({ ...p, svcStage: "choose" }));
      say((e as Error).message);
    }
  };
  return [{ label: s.svcWay === "tpl" ? "Use the template" : "Read my menu", onNext: read }, <>
    <H1>Add your services</H1>
    <div className="cap lead">The fastest way: give us your menu. We read it for you.</div>
    <div className="grid3">
      {ways.map(([k, t, d]) => (
        <button key={k} type="button" className={`pick ${s.svcWay === k ? "on" : ""}`} aria-pressed={s.svcWay === k} onClick={() => set((p) => ({ ...p, svcWay: k }))}>
          <b>{t}</b><span className="cap">{d}</span>
        </button>
      ))}
    </div>
    {s.svcWay === "link" && <div><label className="lbl" htmlFor="url">Your website</label><input className="inp" id="url" inputMode="url" placeholder="yoursalon.com/services" value={s.website} onChange={(e) => set((p) => ({ ...p, website: e.target.value }))} /></div>}
    {s.svcWay === "photo" && <PhotoPick />}
    {s.svcWay !== "tpl" && (SMS_ON
      ? <div className="cap">We read names, prices and minutes for you. You check them on the next screen. About 20 seconds.</div>
      : <div className="demo">Test version: menu reading needs sign-in. Here you get the nail template to edit.</div>)}
    {s.svcWay === "tpl" && <div className="cap">Starts with manicure, pedicure, gel, acrylic, dip and waxing. Then edit prices.</div>}
  </>];
};

const TIMES = Array.from({ length: (23 - 5) * 4 + 1 }, (_, i) => {
  const m = 5 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <select className="inp tm" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {TIMES.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
    </select>
  );
}

let pendingPhoto: { image: string; mediaType: string } | null = null;
function PhotoPick() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <label className="card pad" style={{ alignItems: "center", border: "1.5px dashed #C7C7CC", boxShadow: "none", cursor: "pointer" }}>
      <b>{busy ? "Getting the photo ready…" : name ? `✓ ${name}` : "Take a photo or choose one"}</b>
      <span className="cap">{name ? "Tap to pick a different photo" : "JPG or PNG · clear and straight works best"}</span>
      <input type="file" accept="image/*" style={{ display: "none" }} data-testid="menu-photo" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true);
        try { pendingPhoto = await shrinkPhoto(f); setName(f.name); } catch { setName(""); pendingPhoto = null; }
        setBusy(false);
      }} />
    </label>
  );
}

function PriceInput({ cents, onChange }: { cents: number; onChange: (c: number) => void }) {
  const [txt, setTxt] = useState((cents / 100).toString());
  useEffect(() => setTxt((cents / 100).toString()), [cents]);
  return <input className="ed r" inputMode="decimal" aria-label="Price" value={txt}
    onChange={(e) => setTxt(e.target.value.replace(/[^\d.]/g, ""))}
    onBlur={() => { const c = Math.round(parseFloat(txt || "0") * 100); onChange(Number.isFinite(c) ? c : 0); }} />;
}

/* 3. Staff + PIN */
const StaffStep: StepView = ({ s, set, say }) => [{ label: s.staff.length > 1 ? "Continue" : "Continue (add later)" }, <StaffBody key="b" s={s} set={set} say={say} />];

function StaffBody({ s, set, say }: Pick<StepProps, "s" | "set" | "say">) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null = adding someone new
  const blank: NewStaff = { name: "", phone: "", role: "Tech", pay: "Commission 60%" };
  const [n, setN] = useState<NewStaff>(blank);
  const [tried, setTried] = useState(false);
  const [copied, setCopied] = useState("");
  const link = (code: string, name: string, role: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (SMS_ON) return `${origin}/join/${code}`; // invite details come from the database
    return `${origin}/join/${code}?n=${encodeURIComponent(name)}&r=${encodeURIComponent(role)}&s=${encodeURIComponent(s.salonName || "Your salon")}&o=${encodeURIComponent((s.ownerName || "the owner").split(" ")[0])}`;
  };
  const bad = !n.name.trim() || !phoneOk(n.phone);
  const close = () => { setOpen(false); setEditId(null); setN(blank); setTried(false); };
  const startAdd = () => { setEditId(null); setN(blank); setTried(false); setOpen(true); };
  const startEdit = (p: (typeof s.staff)[number]) => {
    setEditId(p.id ?? null);
    setN({ name: p.name, phone: p.phone, role: p.role === "Owner" ? "Tech" : p.role, pay: p.pay ?? "Commission 60%" });
    setTried(false); setOpen(true);
  };
  const remove = (p: (typeof s.staff)[number]) => {
    const before = s.staff;
    set((x) => ({ ...x, staff: x.staff.filter((y) => y.id !== p.id) }));
    say(`${p.name} removed · invite link no longer works`, () => set((x) => ({ ...x, staff: before })));
  };
  const invite = () => {
    setTried(true);
    if (bad) return;
    if (editId) {
      set((p) => ({ ...p, staff: p.staff.map((x) => x.id === editId ? { ...x, name: n.name.trim(), phone: n.phone, role: n.role, pay: n.pay } : x) }));
      say(`Saved ${n.name.trim()}`);
      close();
      return;
    }
    const added = { id: crypto.randomUUID(), name: n.name.trim(), phone: n.phone, role: n.role, pay: n.pay, status: "Invited" as const, inviteCode: newInviteCode() };
    set((p) => ({ ...p, staff: [...p.staff, added] }));
    setOpen(false); setN(blank); setTried(false);
    say(`Invite ready for ${added.name} · ${added.phone}`, () => set((p) => ({ ...p, staff: p.staff.filter((x) => x.inviteCode !== added.inviteCode) })));
  };
  return <>
    <H1>Add your staff</H1>
    <div className="cap lead">Each person gets a one-time invite link. They set their own PIN (6 digits; change it in Settings → PIN rules).</div>
    <div className="group">
      {s.staff.map((p) => (
        <div className="row m" key={p.inviteCode ?? p.phone} style={{ flexWrap: "wrap", paddingBlock: 8 }}>
          <span className="av">{initials(p.name)}</span>
          <span className="g"><b style={{ fontWeight: 600 }}>{p.name}</b><span className="cap">{p.role}{p.pay ? ` · ${p.pay}` : ""}</span></span>
          {p.status === "You" ? <span className="tag">You</span> : <>
            <span className="tag warn">Invite waiting</span>
            {p.inviteCode && <>
              <button type="button" className="btn sm" onClick={async () => {
                const url = link(p.inviteCode!, p.name, p.role);
                try { await navigator.clipboard.writeText(url); setCopied(p.inviteCode!); setTimeout(() => setCopied(""), 2000); } catch { window.prompt("Copy this link", url); }
              }}>{copied === p.inviteCode ? "✓ Copied" : "Copy invite link"}</button>
              <a className="btn ghost sm" href={link(p.inviteCode, p.name, p.role)} target="_blank" rel="noreferrer">Open ›</a>
            </>}
            <button type="button" className="btn ghost sm" aria-label={`Edit ${p.name}`} onClick={() => startEdit(p)}>Edit</button>
            {p.status !== "Joined" && <button type="button" className="btn ghost sm" style={{ color: "var(--red)" }} aria-label={`Remove ${p.name}`} onClick={() => remove(p)}>Remove</button>}
          </>}
        </div>
      ))}
    </div>
    <div><button className="btn" type="button" onClick={startAdd}>+ Add staff</button></div>
    {SMS_ON
      ? <div className="cap">We text each person their invite from the PolishOS number once texting is approved by the carriers. Until then, tap Copy invite link and send it yourself.</div>
      : <div className="demo">Test version: texts aren&apos;t sent yet. Copy the invite link and send it yourself, or open it to see what staff get on their phone.</div>}
    {open && <>
      <button className="scrim" aria-label="Close" onClick={close} />
      <div className="drawer" role="dialog" aria-label={editId ? "Edit staff" : "Add staff"}>
        <div className="drawer-h"><span style={{ flex: 1 }}>{editId ? "Edit staff" : "Add staff"}</span><button className="btn ghost sm" type="button" aria-label="Close" onClick={close}>✕</button></div>
        <div className="drawer-b">
          <div><label className="lbl" htmlFor="nn">Name</label><input className={`inp ${tried && !n.name.trim() ? "err" : ""}`} id="nn" value={n.name} autoFocus onChange={(e) => setN({ ...n, name: e.target.value })} /></div>
          <div><label className="lbl" htmlFor="np">Mobile number (we text the invite)</label>
            <input className={`inp ${tried && !phoneOk(n.phone) ? "err" : ""}`} id="np" inputMode="tel" value={n.phone} onChange={(e) => setN({ ...n, phone: fmtPhone(e.target.value) })} />
            {tried && !phoneOk(n.phone) && <div className="hint err">Enter a 10-digit mobile number.</div>}
          </div>
          <div><span className="lbl">Role</span><div className="seg">{(["Tech", "Front desk", "Manager"] as const).map((r) => <button key={r} type="button" className={n.role === r ? "on" : ""} aria-pressed={n.role === r} onClick={() => setN({ ...n, role: r })}>{r}</button>)}</div></div>
          <div><span className="lbl">How they&apos;re paid</span><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["Commission 60%", "Hourly $16", "Booth rent"] as PayType[]).map((p) => <button key={p} type="button" className={`chip ${n.pay === p ? "on" : ""}`} aria-pressed={n.pay === p} onClick={() => setN({ ...n, pay: p })}>{p}</button>)}
          </div></div>
          <div className="cap">{editId ? "Their invite link stays the same." : "The link works once and ends in 7 days."}</div>
        </div>
        <div className="drawer-f"><button className="btn ghost" type="button" onClick={close}>Cancel</button><button className="btn primary" type="button" style={{ flex: 1, height: 48, fontSize: 16 }} onClick={invite}>{editId ? "Save" : "Send invite"}</button></div>
      </div>
    </>}
  </>;
}

/* 4. Connect payments */
const Payments: StepView = ({ s, set }) => {
  if (SMS_ON) return [{ lock: s.stripe !== "done" && s.stripe !== "pending" }, <StripeConnect key="sc" s={s} set={set} />];
  if (s.stripe === "stripe") return [{ lock: true }, (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 16px", background: "#F6F8FA", borderBottom: "1px solid var(--line)", fontWeight: 600, color: "#635BFF" }}>stripe · {s.salonName || "Your salon"}</div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="demo">Test version: this stands in for Stripe&apos;s own secure sign-up page (Stripe Connect comes in a later step). Nothing here is sent.</div>
        <div className="grid2">
          {[["Business type", "LLC"], ["EIN", ""], ["Bank for payouts", ""], ["Payouts", "Every day"]].map(([l, v]) => (
            <div key={l}><label className="lbl">{l}</label><input className="inp" defaultValue={v} /></div>
          ))}
        </div>
        <button className="btn stripe" type="button" style={{ alignSelf: "flex-start" }} onClick={() => set((p) => ({ ...p, stripe: "done" }))}>Agree and submit</button>
      </div>
    </div>
  )];
  if (s.stripe === "done") return [{}, <>
    <H1>Payments connected</H1>
    <div className="card pad" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <div className="okmark">✓</div>
      <div><b style={{ fontSize: 17 }}>Stripe account connected</b><div className="cap">Money goes straight to your bank, every day. We never hold it.</div></div>
    </div>
    <div className="group">
      <div className="row"><span className="g">Card reader (tap/chip)</span><b>2.7% + 5¢</b></div>
      <div className="row"><span className="g">Pay link / QR</span><b>2.9% + 30¢</b></div>
      <div className="row"><span className="g">Our fee on payments</span><b>$0 (flat monthly plan only)</b></div>
    </div>
  </>];
  return [{ lock: true }, <>
    <H1>Connect payments</H1>
    <div className="cap lead">Your salon gets its own Stripe account. Takes about 5 minutes. Have your EIN (or SSN) and bank details ready.</div>
    <div className="card pad" style={{ gap: 12 }}>
      <b>What you&apos;ll need</b>
      <div className="cap" style={{ fontSize: 14, lineHeight: "22px" }}>Business name and type · EIN or SSN · Bank account for payouts · Your date of birth</div>
      <button className="btn stripe" type="button" style={{ alignSelf: "flex-start" }} onClick={() => set((p) => ({ ...p, stripe: "stripe" }))}>Connect with Stripe</button>
    </div>
  </>];
};

/* 5. Card reader */
const Reader: StepView = ({ s, set }) => {
  if (SMS_ON && s.reader !== "done") return [{ lock: true, skip: true }, <ReaderPair key="rp" s={s} set={set} />];
  if (s.reader === "done") return [{}, <>
    <H1>Card reader connected</H1>
    <div className="card pad" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <div className="okmark">✓</div>
      <div><b style={{ fontSize: 17 }}>Stripe Reader S710 · “{s.readerLabel || "Front desk"}”</b><div className="cap">Online on salon Wi-Fi. You&apos;ll try it with a $1 test in step 9.</div></div>
    </div>
  </>];
  const ok = s.pairing.trim().split(/[-\s]+/).filter(Boolean).length === 3;
  return [{ lock: true, skip: true }, <>
    <H1>Connect your card reader</H1>
    <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
      <li>Plug in the Stripe S710 and connect it to the salon Wi-Fi.</li>
      <li>On the reader: Settings · Generate pairing code.</li>
      <li>Type the 3 words it shows.</li>
    </ol>
    <div><label className="lbl" htmlFor="pc">Pairing code</label><input className="inp" id="pc" placeholder="tempo-quote-lima" autoCapitalize="none" value={s.pairing} onChange={(e) => set((p) => ({ ...p, pairing: e.target.value }))} /></div>
    <div><button className="btn" type="button" disabled={!ok} style={{ opacity: ok ? 1 : 0.5 }} onClick={() => set((p) => ({ ...p, reader: "done" }))}>Connect reader</button></div>
    <div className="demo">Test version: pairing is simulated until Stripe Terminal is wired in.</div>
  </>];
};

/* Real Stripe Connect (sign-in on): the salon's own Stripe account, Stripe's own sign-up page.
   Shows where things stand every time: checking → not connected → Stripe needs X → Stripe checking → Connected. */
type StripeStatus = { on?: boolean; connected?: boolean; chargesEnabled?: boolean; payoutsEnabled?: boolean; detailsSubmitted?: boolean; test?: boolean; state?: string; missing?: string[]; name?: string };
const FEES = (
  <div className="group">
    <div className="row"><span className="g">Card reader (tap/chip)</span><b>2.7% + 5¢</b></div>
    <div className="row"><span className="g">Pay link / QR</span><b>2.9% + 30¢</b></div>
    <div className="row"><span className="g">Our fee on payments</span><b>$0 (flat monthly plan only)</b></div>
  </div>
);
function StripeConnect({ s, set }: Pick<StepProps, "s" | "set">) {
  const [st, setSt] = useState<StripeStatus | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    if (!s.salonId) return;
    setErr("");
    try {
      const r = await api<StripeStatus>("/api/stripe/status", { salonId: s.salonId });
      setSt(r);
      const next = r.chargesEnabled ? "done" : r.connected && r.detailsSubmitted && !r.missing?.length && r.state !== "rejected" ? "pending" : r.connected ? "stripe" : "start";
      set((p) => (p.stripe === next && (!r.name || p.stripeName === r.name) ? p : { ...p, stripe: next, stripeName: r.name || p.stripeName }));
    } catch (e) { setErr((e as Error).message); }
  }, [s.salonId, set]);
  useEffect(() => { void check(); }, [check]);
  // Stripe sometimes takes a minute after sign-up: look again every 15 s while it checks.
  useEffect(() => {
    if (s.stripe !== "pending") return;
    const t = setInterval(() => void check(), 15000);
    return () => clearInterval(t);
  }, [s.stripe, check]);
  const go = async () => {
    setBusy(true); setErr("");
    try {
      await syncNow(); // the salon must be saved on the server first
      const r = await api<{ url: string }>("/api/stripe/connect", { salonId: s.salonId });
      location.href = r.url;
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const name = st?.name || s.stripeName || s.salonName || "Your salon";
  const testNote = st?.test && <div className="demo">Test payments: this site uses Stripe&apos;s test key, so no real money moves. On Stripe&apos;s page use test data (phone 000 000 0000, code 000000, SSN 000-00-0000, routing 110000000, account 000123456789). Real payments start when the live key is set.</div>;

  if (st?.chargesEnabled) return <>
    <H1>Payments connected</H1>
    <div className="card pad" style={{ gap: 0, padding: 0 }} data-testid="stripe-connected">
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16 }}>
        <div className="okmark">✓</div>
        <div style={{ flex: 1 }}><b style={{ fontSize: 17 }}>Stripe account connected</b><div className="cap">Money goes straight to your bank. We never hold it.</div></div>
        <span className="pill ok"><span className="dot" aria-hidden />{st.test ? "Test" : "Live"}</span>
      </div>
      <div className="group" style={{ margin: "0 16px 16px" }}>
        <div className="row"><span className="g">Account</span><b>{name}</b></div>
        <div className="row"><span className="g">Card payments</span><b>On</b></div>
        <div className="row"><span className="g">Payouts to your bank</span><b>{st.payoutsEnabled ? "On" : "Turning on"}</b></div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "0 16px 16px" }}>
        <a className="btn stripe" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Open Stripe dashboard</a>
        <button className="btn" type="button" onClick={() => void check()}>Check again</button>
      </div>
    </div>
    {FEES}
    <div className="cap">Change bank or business details any time in your Stripe dashboard.</div>
    {testNote}
  </>;

  const pending = st?.connected && s.stripe === "pending";
  return <>
    <H1>Connect payments</H1>
    <div className="cap lead">Your salon gets its own Stripe account. Money goes straight to your bank; we never hold it. Takes about 5 minutes: have your EIN (or SSN) and bank details ready.</div>
    {!st && !err && <div className="card pad" role="status" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><span className="dot pulse" aria-hidden /> Checking Stripe…</div>}
    {st?.on === false && <div className="banner" role="status">Card payments aren&apos;t switched on for this site yet (Stripe key missing). Call us.</div>}
    {pending && <div className="card pad" role="status" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <div className="okmark" style={{ background: "var(--orange)" }}>…</div>
      <div style={{ flex: 1 }}><b style={{ fontSize: 17 }}>Connected · Stripe is checking your details</b><div className="cap">Usually a minute, sometimes a day. You can keep going; this updates by itself.</div></div>
      <button type="button" className="btn sm" onClick={() => void check()}>Check again</button>
    </div>}
    {st?.connected && !pending && !st.chargesEnabled && <div className="banner" role="status">{st.state === "rejected" ? "Stripe turned this account down. Call us." : st.missing?.length ? <>Stripe still needs: {st.missing.join(" · ")}. Tap Continue with Stripe.</> : "Finish your details on Stripe. Tap Continue with Stripe."}</div>}
    {!pending && <div className="card pad" style={{ gap: 12 }}>
      <b>What you&apos;ll need</b>
      <div className="cap" style={{ fontSize: 14, lineHeight: "22px" }}>Business name and type · EIN or SSN · Bank account for payouts · Your date of birth</div>
      {FEES}
      <button className="btn stripe" type="button" disabled={busy || (!st && !err) || st?.on === false || !s.salonId} style={{ alignSelf: "flex-start" }} onClick={() => void go()}>{st?.connected ? "Continue with Stripe" : "Connect with Stripe"}</button>
      {err && <div className="hint err">{err} <button type="button" className="btn ghost sm" onClick={() => void check()}>Try again</button></div>}
    </div>}
    {testNote}
  </>;
}

/* Real reader pairing (sign-in on): the 3 words on the S710, or a test reader in test mode. */
function ReaderPair({ s, set }: Pick<StepProps, "s" | "set">) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = s.pairing.trim().split(/[-\s]+/).filter(Boolean).length === 3;
  const pair = async (code: string) => {
    setBusy(true); setErr("");
    try {
      const r = await api<{ label: string }>("/api/stripe/reader", { salonId: s.salonId, code, label: "Front desk" });
      set((p) => ({ ...p, reader: "done", readerLabel: r.label }));
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return <>
    <H1>Connect your card reader</H1>
    <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
      <li>Plug in the Stripe S710 and connect it to the salon Wi-Fi.</li>
      <li>On the reader: Settings · Generate pairing code.</li>
      <li>Type the 3 words it shows.</li>
    </ol>
    <div><label className="lbl" htmlFor="pc">Pairing code</label><input className="inp" id="pc" placeholder="tempo-quote-lima" autoCapitalize="none" value={s.pairing} onChange={(e) => set((p) => ({ ...p, pairing: e.target.value }))} /></div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="btn" type="button" disabled={!ok || busy} onClick={() => void pair(s.pairing)}>Connect reader</button>
      <button className="btn ghost" type="button" disabled={busy} onClick={() => void pair("simulated-s710")}>No reader yet: use a test reader</button>
    </div>
    {err && <div className="hint err">{err}</div>}
    <div className="cap">Payments must be connected first (step 4). The test reader works only in test mode.</div>
  </>;
}

/* 6. Printer: Bluetooth (Android / Chrome, same picker as checkout), Wi-Fi or USB (the device's own print window). */
const Printer: StepView = ({ s, set }) => [{ skip: true }, <PrinterStep key="pr" s={s} set={set} />];

const PRINT_WAYS = [{ value: "bt", label: "Bluetooth" }, { value: "wifi", label: "Wi-Fi" }, { value: "usb", label: "USB (computer)" }] as const;
const testDoc = (salon: string): ReceiptDoc => ({
  title: salon || "Your salon",
  sub: [`Test receipt · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`],
  rows: [["Gel manicure", "$35.00"], ["Tip", "$7.00"], "sep", { bold: ["TOTAL", "$42.00"] }],
  footer: ["Your printer works."],
});

function PrinterStep({ s, set }: Pick<StepProps, "s" | "set">) {
  const p = usePrinter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Default tab: Bluetooth where this browser can use it, else Wi-Fi (iPhone/iPad, Safari, Firefox).
  const way = s.printWay ?? (p.ok ? "bt" : "wifi");
  const setWay = (w: "bt" | "wifi" | "usb") => set((x) => ({ ...x, printWay: w, printer: w === "bt" ? (p.saved ? `${p.saved.name} · Bluetooth` : "") : w === "wifi" ? "Wi-Fi printer" : "USB printer", printed: false }));
  // A Bluetooth printer already picked on this device (e.g. at checkout) counts.
  useEffect(() => {
    if (way === "bt" && p.saved && !s.printer) set((x) => ({ ...x, printWay: "bt", printer: `${p.saved!.name} · Bluetooth` }));
  }, [way, p.saved, s.printer, set]);
  const find = async () => {
    setErr(""); setBusy(true);
    try {
      const got = await pickPrinter(p.paper);
      p.refresh();
      set((x) => ({ ...x, printWay: "bt", printer: `${got.name} · Bluetooth`, printed: false }));
    } catch (e) { if (!/cancel/i.test((e as Error).message)) setErr((e as Error).message); }
    setBusy(false);
  };
  const test = async () => {
    setErr(""); setBusy(true);
    const doc = testDoc(s.salonName);
    try {
      if (!(way === "bt" && (await printDoc(doc)))) await printInWindow([doc]);
      set((x) => ({ ...x, printed: true, printer: x.printer || (way === "wifi" ? "Wi-Fi printer" : way === "usb" ? "USB printer" : x.printer) }));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const lines = receiptLines(testDoc(s.salonName), p.paper);
  return <>
    <H1>Receipt printer</H1>
    <div className="cap lead">How is your printer connected?</div>
    <Segmented label="Printer connection" value={way} onChange={(v) => setWay(v as "bt" | "wifi" | "usb")} options={[...PRINT_WAYS]} />
    <div className="grid2" style={{ gap: 16, alignItems: "start" }}>
      <div className="card pad" style={{ gap: 12 }}>
        {way === "bt" && (p.ok ? <>
          <b>Bluetooth printer</b>
          {p.saved
            ? <div className="group"><div className="row"><span className="g"><b>{p.saved.name}</b><span className="cap" style={{ display: "block" }}>Bluetooth · {p.saved.paper} mm · paired on this device</span></span><span className="pill ok"><span className="dot" aria-hidden />Ready</span></div></div>
            : <div className="cap">Turn the printer on, then tap Find printer and pick it from the list.</div>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Button variant={p.saved ? undefined : "primary"} disabled={busy} onClick={() => void find()}>{p.saved ? "Change printer" : "Find printer"}</Button>
            {p.saved && <Segmented label="Paper size" value={String(p.paper)} onChange={(v) => p.setPaper(Number(v) as Paper)} options={[{ value: "58", label: "58 mm" }, { value: "80", label: "80 mm" }]} />}
          </div>
        </> : <>
          <b>Bluetooth isn&apos;t available here</b>
          <div className="cap">{p.ios ? "iPhone and iPad browsers can't reach Bluetooth printers. Use a Wi-Fi printer, or set up the Bluetooth printer from an Android tablet or Chrome on a computer." : "This browser can't use Bluetooth. Open PolishOS in Chrome (Android or computer), or use a Wi-Fi / USB printer."}</div>
          <div><Button onClick={() => setWay("wifi")}>Use a Wi-Fi printer</Button></div>
        </>)}
        {way === "wifi" && <>
          <b>Wi-Fi printer</b>
          <div className="cap">Put the printer on the salon Wi-Fi (its own setup button or app). This {p.ios ? "iPad/iPhone" : "device"} then sees it like any printer: tap Print a test receipt and pick it in the print window.</div>
          <div className="cap">Works with Epson TM-m30, Star mC-Print and most AirPrint receipt printers.</div>
        </>}
        {way === "usb" && <>
          <b>USB printer</b>
          <div className="cap">Plug the printer into the front desk computer and install its driver. Tap Print a test receipt and pick it in the print window. Set paper to 80 mm (or 58 mm) there.</div>
        </>}
        {(way !== "bt" || (p.ok && p.saved)) && <div><Button variant="primary" disabled={busy} onClick={() => void test()}>{s.printed ? "✓ Printed · print again" : "Print a test receipt"}</Button></div>}
        {err && <div className="hint err" role="alert">{err}</div>}
      </div>
      <div className="card pad" style={{ gap: 10 }}>
        <span className="cap">What prints</span>
        <div className="pr-paper" aria-label="Test receipt preview">
          {lines.map((l, i) => "qr" in l ? null : <div key={i} style={{ fontWeight: l.bold ? 700 : 400 }}>{l.text || " "}</div>)}
        </div>
        <span className="cap" style={{ textAlign: "center" }}>Choose what prints later in Settings → Printer.</span>
      </div>
    </div>
  </>;
}

/* 7. This device */
const Device: StepView = ({ s, set }) => [{}, <>
  <H1>What is this device for?</H1>
  <div className="grid3">
    {([["Front desk", "Checkout, calendar, clients"], ["Walk-in kiosk", "Clients check themselves in"], ["Owner", "Numbers and settings"]] as const).map(([d, t]) => (
      <button key={d} type="button" className={`pick ${s.device === d ? "on" : ""}`} aria-pressed={s.device === d}
        onClick={() => set((p) => ({ ...p, device: d, deviceName: d === "Walk-in kiosk" ? "Kiosk iPad" : d === "Owner" ? "Owner computer" : "Front desk iPad" }))}>
        <b>{d}</b><span className="cap">{t}</span>
      </button>
    ))}
  </div>
  <div><label className="lbl" htmlFor="dn">Device name</label><input className="inp" id="dn" value={s.deviceName} onChange={(e) => set((p) => ({ ...p, deviceName: e.target.value }))} /></div>
  <div className="cap">Staff sign in on this device with their PIN. It stays signed in to {s.salonName || "your salon"}.</div>
</>];

/* 8. Clients */
const Clients: StepView = ({ s, set }) => [{ skip: true }, <>
  <H1>Bring your clients</H1>
  <div className="grid2">
    {([["file", "Upload a file", "CSV from your old system or a spreadsheet"], ["later", "Add them as they come", "Phone number at checkout creates the client"]] as const).map(([k, t, d]) => (
      <button key={k} type="button" className={`pick ${s.clients === k ? "on" : ""}`} aria-pressed={s.clients === k} onClick={() => set((p) => ({ ...p, clients: k }))}>
        <b>{t}</b><span className="cap">{d}</span>
      </button>
    ))}
  </div>
  {s.clients === "file" && <label className="card pad" style={{ border: "1.5px dashed #C7C7CC", boxShadow: "none", cursor: "pointer" }}>
    <b>Choose a CSV file</b>
    <span className="cap">Name, phone, email, birthday. We merge duplicates by phone.</span>
    <input type="file" accept=".csv,text/csv" style={{ display: "none" }} />
    <span className="demo">Test version: import is saved for the Clients step (later). Texts go only to clients who say yes.</span>
  </label>}
</>];

/* 9. Test $1 */
const Test: StepView = ({ s, set }) => SMS_ON ? [{ lock: s.test !== "done", skip: true }, <TestDollar key="td" s={s} set={set} />] : [{ lock: s.test !== "done" }, <>
  <H1>Test with $1</H1>
  <div className="cap lead">Charge $1 on the reader with your own card, then we refund it. This proves money reaches your bank.</div>
  <div className="card pad" style={{ alignItems: "center", gap: 14, padding: 28 }}>
    {s.test === "start" && <><div className="money">{fmtMoney(100)}</div>
      <button className="btn primary" type="button" onClick={() => { set((p) => ({ ...p, test: "tap" })); setTimeout(() => set((p) => ({ ...p, test: "done" })), 1500); }}>Charge $1.00 on the reader</button></>}
    {s.test === "tap" && <><div className="spin" /><b>Tap, insert or swipe on the reader…</b></>}
    {s.test === "done" && <><div className="okmark">✓</div><b style={{ fontSize: 17 }}>Paid $1.00 · refunded $1.00</b><div className="cap">Card fee 8¢ shown on the test ticket. You&apos;ll see it in Close day.</div></>}
  </div>
  <div className="demo">Test version: no real charge until Stripe is connected.</div>
</>];

/* Real $1 test (sign-in on): charge $1 on the reader, refund it at once, show the fee. */
function TestDollar({ s, set }: Pick<StepProps, "s" | "set">) {
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ feeCents: number | null; brand: string | null; last4: string | null } | null>(null);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  const run = async () => {
    setErr(""); set((p) => ({ ...p, test: "tap" }));
    try {
      const { intent } = await api<{ intent: string }>("/api/stripe/test-dollar", { salonId: s.salonId });
      for (let i = 0; i < 80 && !stop.current; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await api<{ status: string; error?: string; feeCents: number | null; brand: string | null; last4: string | null }>(`/api/stripe/test-dollar?salonId=${s.salonId}&intent=${intent}`).catch(() => ({ status: "pending" }) as { status: string; error?: string; feeCents: null; brand: null; last4: null });
        if (r.status === "done") { setRes(r); set((p) => ({ ...p, test: "done" })); return; }
        if (r.status === "failed") throw new Error(r.error || "Card declined. Try another card.");
      }
      throw new Error("No card was tapped. Try again.");
    } catch (e) { setErr((e as Error).message); set((p) => ({ ...p, test: "start" })); }
  };
  return <>
    <H1>Test with $1</H1>
    <div className="cap lead">Charge $1 on the reader with your own card, then we refund it. This proves money reaches your bank.</div>
    <div className="card pad" style={{ alignItems: "center", gap: 14, padding: 28 }}>
      {s.test === "start" && <><div className="money">{fmtMoney(100)}</div>
        <button className="btn primary" type="button" onClick={() => void run()}>Charge $1.00 on the reader</button></>}
      {s.test === "tap" && <><div className="spin" /><b>Tap, insert or swipe on the reader…</b><span className="cap">Waiting up to 2 minutes.</span></>}
      {s.test === "done" && <><div className="okmark">✓</div><b style={{ fontSize: 17 }}>Paid $1.00 · refunded $1.00</b>
        <div className="cap">{res?.last4 ? `${(res.brand ?? "Card").toUpperCase()} •• ${res.last4} · ` : ""}{res?.feeCents != null ? `Stripe kept a ${fmtMoney(res.feeCents)} card fee (kept even on a refund).` : "Stripe's small card fee shows in your Stripe account."}</div></>}
      {err && <div className="hint err" role="alert">{err}</div>}
    </div>
    <div className="cap">You can skip this and test on your first real ticket. Payments (step 4) and the reader (step 5) must be done first.</div>
  </>;
}

/* 10. Ready */
const Ready: StepView = ({ s, go }) => {
  const waiting = s.staff.filter((p) => p.status === "Invited").length;
  return [{}, (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center", padding: "48px 0" }}>
      <div className="okmark lg">✓</div>
      <H1>{s.salonName || "Your salon"} is ready</H1>
      <div className="cap lead" style={{ maxWidth: 520 }}>
        {s.menu.filter((m) => m.on).length} services, payments, reader and printer are set. {waiting ? `${waiting} staff still to join (their invite is waiting).` : "Add staff any time in Settings."}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Setup is finished here: staff changes now live in Settings → Team (the wizard no longer saves them). */}
        {SMS_ON ? <Link className="btn" href="/settings/team">Staff</Link> : <button className="btn" type="button" onClick={() => go(2)}>Staff</button>}
        <Link className="btn primary" href={SMS_ON ? "/today" : "/"} onClick={() => queueSave(s)}>Open Today</Link>
      </div>
    </div>
  )];
};

const STEP_VIEWS: StepView[] = [SalonInfo, Services, StaffStep, Payments, Reader, Printer, Device, Clients, Test, Ready];
