"use client";
// Platform admin (Oliver, Elang): every salon at a glance + add a salon by invite.
// Quick version of the Founder Admin board: salon health, alerts and support access come later.
// Data: admin_salons() / admin_create_salon() / admin_new_code() (migration invites_admin); all check is_platform_admin().
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SMS_ON, amPlatformAdmin, e164, isSignedIn, myMemberships, rpc, signOut } from "@/lib/auth";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { Button, Field, ListGroup, Row, Tag, Toast, TopBar } from "@/components/kit";

type Salon = {
  salon_id: string; salon_name: string; state: string; created_at: string; setup_step: number; owner_name: string | null;
  owner_phone: string | null; owner_email: string | null; owner_joined: boolean; code: string | null; code_expires: string | null; staff: number;
};
type Made = { salon_id: string; code: string; salon: string; owner: string; phone: string };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function AdminHome() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "no" | "ok">("loading");
  const [hasSalon, setHasSalon] = useState(false);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [f, setF] = useState({ salon: "", state: "CA", owner: "", phone: "", email: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const [toast, setToast] = useState("");
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    try { setSalons(await rpc<Salon[]>("admin_salons")); } catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => {
    if (!SMS_ON) { setState("no"); return; }
    void (async () => {
      if (!(await isSignedIn())) return router.replace("/login?next=/admin");
      if (!(await amPlatformAdmin())) { setState("no"); return; }
      setHasSalon((await myMemberships().catch(() => [])).length > 0);
      setState("ok");
      void load();
    })();
  }, [router, load]);

  const create = async () => {
    setErr("");
    if (!f.salon.trim() || !f.owner.trim()) return setErr("Salon name and owner name are needed.");
    if (!phoneOk(f.phone)) return setErr("Owner phone: 10 digits, like (408) 555-0110.");
    setBusy(true);
    try {
      const r = await rpc<{ salon_id: string; code: string }>("admin_create_salon", {
        p_salon: f.salon.trim(), p_state: f.state, p_owner: f.owner.trim(), p_phone: e164(f.phone), p_email: f.email.trim() || null,
      });
      setMade({ ...r, salon: f.salon.trim(), owner: f.owner.trim(), phone: f.phone });
      setF({ salon: "", state: "CA", owner: "", phone: "", email: "" });
      void load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const newCode = async (s: Salon) => {
    try { await rpc<string>("admin_new_code", { p_salon: s.salon_id }); say(`New code for ${s.salon_name}`); void load(); }
    catch (e) { say((e as Error).message); }
  };

  const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => say("Copied")); };
  const inviteText = (m: { owner: string; salon: string; code: string }) =>
    `Hi ${m.owner}, your PolishOS salon "${m.salon}" is ready. Sign in at ${location.origin}/login with this phone number. Invite code: ${m.code}`;

  if (state === "loading") return <div className="app" aria-busy="true" />;
  if (state === "no") return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad" style={{ maxWidth: 420, width: "100%", padding: 28, gap: 12 }}>
        <h1 className="h2">Admins only</h1>
        <p className="cap">This page is for the PolishOS team. Sign in with an admin phone.</p>
        <Button onClick={async () => { await signOut(); router.replace("/login"); }}>Sign in as someone else</Button>
      </div>
    </main>
  );

  const waiting = salons.filter((s) => !s.owner_joined).length;
  return (
    <div className="app" style={{ display: "block" }}>
      <TopBar title="PolishOS admin">
        {hasSalon && <Button onClick={() => router.push("/today")}>Open Today</Button>}
        <Button variant="ghost" data-testid="sign-out" onClick={async () => { await signOut(); router.replace("/login"); }}>Sign out</Button>
      </TopBar>
      <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 980, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 className="h1">Salons</h1>
          <span className="cap">{salons.length} salons · {waiting} owner{waiting === 1 ? "" : "s"} not joined yet</span>
        </div>

        <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="add-salon">
          <div className="eyebrow">Add salon by invite</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Field id="a-salon" label="Salon name" value={f.salon} onChange={(e) => setF({ ...f, salon: e.target.value })} />
            <div>
              <label className="lbl" htmlFor="a-state">State</label>
              <select className="inp" id="a-state" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
                {["CA", "TX", "FL", "NY", "WA", "MN", "GA", "IL", "NJ", "PA", "VA", "NC", "AZ", "MA", "CO", "OR", "NV", "OTHER"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <Field id="a-owner" label="Owner name" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
            <Field id="a-phone" label="Owner mobile" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: fmtPhone(e.target.value) })} />
            <Field id="a-email" label="Owner email (optional)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
          {err && <div className="hint err" role="alert">{err}</div>}
          <div><Button variant="primary" disabled={busy} onClick={() => void create()}>{busy ? "Adding…" : "Add salon + invite"}</Button></div>
          <p className="cap">The owner signs in with this phone (or email) and the salon is theirs. They finish the 10 setup steps themselves.</p>
          {made && (
            <div className="card pad" style={{ gap: 8, display: "flex", flexDirection: "column" }} data-testid="invite-made">
              <b>{made.salon} is ready for {made.owner}</b>
              <span className="cap">Invite code <b style={{ fontFamily: "monospace", fontSize: 16 }}>{made.code}</b> · sign in at {location.origin}/login with {made.phone}</span>
              <div><Button size="sm" onClick={() => copy(inviteText(made))}>Copy invite text</Button></div>
            </div>
          )}
        </section>

        <ListGroup data-testid="salon-list">
          {salons.map((s) => (
            <Row key={s.salon_id} size="m"
              title={<b style={{ fontWeight: 600 }}>{s.salon_name}</b>}
              sub={`${s.state} · ${s.owner_name ?? "No owner"}${s.owner_phone ? ` · ${fmtPhone(s.owner_phone.replace(/^\+1/, ""))}` : ""} · ${s.staff} staff · added ${day(s.created_at)}`}
              right={<span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {s.owner_joined
                  ? (s.setup_step >= 9 ? <Tag tone="jade">Live</Tag> : <Tag>Setup {Math.min(s.setup_step + 1, 10)}/10</Tag>)
                  : <Tag>Owner not joined</Tag>}
                {!s.owner_joined && s.code && <Button size="sm" onClick={() => copy(inviteText({ owner: s.owner_name ?? "", salon: s.salon_name, code: s.code! }))}>Copy invite · {s.code}</Button>}
                {!s.owner_joined && s.owner_name && <Button size="sm" variant="ghost" onClick={() => void newCode(s)}>New code</Button>}
              </span>} />
          ))}
          {!salons.length && <Row title={<span className="cap">No salons yet.</span>} />}
        </ListGroup>
        <p className="cap">Salon health, alerts and owner-granted support access come with the full Founder Admin build. Admins see salons and owners only, never client or staff private data.</p>
      </main>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
