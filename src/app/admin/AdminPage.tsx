"use client";
// PolishOS admin (Oliver, Elang, our staff only): make a salon + owner invite, send the link, see who joined.
// Health only: no client or money data here.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SMS_ON, e164, emailOk, isPlatformAdmin, isSignedIn, rpc, showCode } from "@/lib/auth";
import { STATES, fmtPhone, phoneOk } from "@/lib/onboarding/data";

type Row = {
  salon_id: string; salon_name: string; state: string; created_at: string; setup_step: number; owner_name: string | null; owner_phone: string | null;
  owner_email: string | null; owner_joined: boolean; code: string | null; code_expires: string | null; staff: number;
};
const SAMPLE: Row[] = [
  { salon_id: "s1", salon_name: "Lotus Nails", state: "CA", created_at: "2026-11-17T18:00:00Z", setup_step: 4, owner_name: "Mai", owner_phone: "+14085550110",
    owner_email: "mai@example.com", owner_joined: true, code: null, code_expires: null, staff: 6 },
  { salon_id: "s2", salon_name: "Cosmo Nails", state: "NJ", created_at: "2026-11-18T09:00:00Z", setup_step: 0, owner_name: "Kim", owner_phone: "+16095550123",
    owner_email: null, owner_joined: false, code: "ABCD2345", code_expires: "2026-11-25T09:00:00Z", staff: 1 },
];

const linkFor = (code: string) => `${typeof location === "undefined" ? "" : location.origin}/invite/${code}`;
const message = (r: Row) =>
  `Hi ${r.owner_name ?? ""}, your PolishOS salon "${r.salon_name}" is ready. Open ${linkFor(r.code!)} and sign in with this phone or email (or Google). Invite code: ${showCode(r.code!)} (good for 7 days).`;
const fmtUs = (p: string | null) => (p ? fmtPhone(p.replace(/^\+1/, "")) : "");

export default function AdminPage() {
  const [ok, setOk] = useState<boolean | undefined>(SMS_ON ? undefined : true);
  const [rows, setRows] = useState<Row[]>(SMS_ON ? [] : SAMPLE);
  const [f, setF] = useState({ salon: "", state: "CA", owner: "", phone: "", email: "" });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    if (!SMS_ON) return;
    try { setRows(await rpc<Row[]>("admin_salons")); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!SMS_ON) return;
    void (async () => {
      const yes = (await isSignedIn()) && (await isPlatformAdmin());
      setOk(yes);
      if (yes) await load();
    })();
  }, [load]);

  const bad = { salon: !f.salon.trim(), owner: !f.owner.trim(), phone: !phoneOk(f.phone), email: !!f.email.trim() && !emailOk(f.email) };
  const create = async () => {
    setTried(true);
    if (Object.values(bad).some(Boolean)) return;
    setBusy(true); setErr("");
    try {
      if (SMS_ON) {
        const r = await rpc<{ salon_id: string; code: string }>("admin_create_salon",
          { p_salon: f.salon.trim(), p_state: f.state, p_owner: f.owner.trim(), p_phone: e164(f.phone), p_email: f.email.trim() || null });
        await load();
        setMade(r.salon_id);
      } else {
        const id = crypto.randomUUID();
        setRows((rs) => [{ salon_id: id, salon_name: f.salon.trim(), state: f.state, created_at: new Date().toISOString(), setup_step: 0, owner_name: f.owner.trim(),
          owner_phone: e164(f.phone), owner_email: f.email.trim() || null, owner_joined: false, code: "TEST2345", code_expires: null, staff: 1 }, ...rs]);
        setMade(id);
      }
      setF({ salon: "", state: f.state, owner: "", phone: "", email: "" }); setTried(false);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const newCode = async (r: Row) => {
    if (!confirm(`Make a new invite code for ${r.salon_name}? The old code stops working.`)) return;
    try { if (SMS_ON) { await rpc("admin_new_code", { p_salon: r.salon_id }); await load(); } } catch (e) { setErr((e as Error).message); }
  };
  const copy = async (r: Row) => {
    try { await navigator.clipboard.writeText(message(r)); setCopied(r.salon_id); setTimeout(() => setCopied(""), 2000); } catch { /* ignore */ }
  };

  if (ok === undefined) return <main className="adm" aria-busy="true" />;
  if (!ok) return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad" style={{ maxWidth: 420, gap: 12 }}>
        <h1 className="h1">PolishOS team only</h1>
        <p className="cap lead">This page is for the PolishOS team. <Link href="/login">Sign in</Link> with your admin account.</p>
      </div>
    </main>
  );

  return (
    <main className="adm" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="logo" style={{ margin: 0 }}>P</div>
        <div style={{ flex: 1 }}><h1 className="h1" style={{ margin: 0 }}>Salons</h1><span className="cap">PolishOS team · {rows.length} salons</span></div>
      </header>
      {!SMS_ON && <div className="demo">Test version: sample salons, nothing is saved.</div>}

      <section className="card pad" style={{ gap: 12 }} aria-labelledby="new-h">
        <h2 id="new-h" className="h2" style={{ margin: 0 }}>New salon + owner invite</h2>
        <div className="adm-grid">
          <div><label className="lbl" htmlFor="a-salon">Salon name</label>
            <input className={`inp ${tried && bad.salon ? "err" : ""}`} id="a-salon" value={f.salon} onChange={(e) => setF({ ...f, salon: e.target.value })} data-testid="a-salon" /></div>
          <div><label className="lbl" htmlFor="a-state">State</label>
            <select className="inp" id="a-state" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
              {Object.keys(STATES).map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><label className="lbl" htmlFor="a-owner">Owner name</label>
            <input className={`inp ${tried && bad.owner ? "err" : ""}`} id="a-owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} data-testid="a-owner" /></div>
          <div><label className="lbl" htmlFor="a-phone">Owner mobile</label>
            <input className={`inp ${tried && bad.phone ? "err" : ""}`} id="a-phone" inputMode="tel" placeholder="(408) 555-0110" value={f.phone}
              onChange={(e) => setF({ ...f, phone: fmtPhone(e.target.value) })} data-testid="a-phone" /></div>
          <div className="adm-wide"><label className="lbl" htmlFor="a-email">Owner email (optional: lets them sign in with Google)</label>
            <input className={`inp ${tried && bad.email ? "err" : ""}`} id="a-email" type="email" placeholder="owner@gmail.com" value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="a-email" /></div>
        </div>
        {tried && Object.values(bad).some(Boolean) && <div className="hint err" role="alert" style={{ margin: 0 }}>Fill in salon name, owner name and a 10-digit mobile (email must look like name@gmail.com).</div>}
        {err && <div className="hint err" role="alert" style={{ margin: 0 }}>{err}</div>}
        <button className="btn primary" type="button" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={create} data-testid="a-create">{busy ? "Making…" : "Make salon + invite"}</button>
      </section>

      <section className="card" style={{ padding: 0, overflow: "hidden" }} aria-label="All salons">
        {rows.length === 0 && <p className="cap" style={{ padding: 16, margin: 0 }}>No salons yet.</p>}
        {rows.map((r) => (
          <div key={r.salon_id} className={`adm-row ${made === r.salon_id ? "adm-new" : ""}`} data-testid="a-row">
            <div style={{ minWidth: 0 }}>
              <b>{r.salon_name}</b> <span className="cap">· {r.state} · {r.staff} {r.staff === 1 ? "person" : "people"}</span>
              <div className="cap">Owner {r.owner_name ?? "—"} · {fmtUs(r.owner_phone)}{r.owner_email ? ` · ${r.owner_email}` : ""}</div>
            </div>
            <div className="adm-status">
              {r.owner_joined
                ? <span className="chip">{r.setup_step >= 9 ? "Live" : `Setting up · step ${r.setup_step + 1}`}</span>
                : r.code ? <span className="chip">Invited · code <b data-testid="a-code">{showCode(r.code)}</b></span>
                  : <span className="chip">Invite ran out</span>}
            </div>
            {!r.owner_joined && <div className="adm-acts">
              {r.code && <>
                <button type="button" className="btn sm" onClick={() => copy(r)}>{copied === r.salon_id ? "Copied" : "Copy message"}</button>
                <a className="btn sm" href={`sms:${r.owner_phone}?&body=${encodeURIComponent(message(r))}`}>Text</a>
                {r.owner_email && <a className="btn sm" href={`mailto:${r.owner_email}?subject=${encodeURIComponent("Your PolishOS salon is ready")}&body=${encodeURIComponent(message(r))}`}>Email</a>}
              </>}
              <button type="button" className="btn sm ghost" onClick={() => newCode(r)}>New code</button>
            </div>}
          </div>
        ))}
      </section>
      <p className="cap">Owners sign in with the phone or email above (or Google with that email) and land in setup. A different login can type the code. Codes work once and last 7 days.</p>
    </main>
  );
}
