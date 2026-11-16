"use client";
// Front desk / owner home (desktop + iPad). Session 1: who's in, clock in/out by PIN, switch person,
// make this a salon device, salon switcher for owners with several salons, sign out.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ROLE_LABEL, SMS_ON, forgetDevice, getDevice, isSignedIn, makeSalonDevice, myMemberships, pinMessage, rpc, signOut,
  type Device, type Membership, type PinResult, type Role,
} from "@/lib/auth";
import { Avatar, Button, Card, Drawer, Field, LeftMenu, ListGroup, OfflineBanner, PinKeypad, Row, SyncPill, Tag, Toast, TopBar } from "@/components/kit";

type Staff = { membership_id: string; display_name: string; role: Role; joined: boolean; has_pin: boolean; locked: boolean; clocked_in: boolean; last_clock: string | null };
type Acting = { membership_id: string; name: string; role: Role; at: number };
const IDLE_MS = 2 * 60 * 1000;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");

export default function TodayDesk() {
  const router = useRouter();
  const [ms, setMs] = useState<Membership[] | null>(null);
  const [salonId, setSalonId] = useState<string>("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [acting, setActing] = useState<Acting | null>(null);
  const [pinFor, setPinFor] = useState<{ s: Staff; purpose: "switch" | "clock" } | null>(null);
  const [pinErr, setPinErr] = useState("");
  const [switching, setSwitching] = useState(false);
  const [devName, setDevName] = useState("Front desk");
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(""), 3500); };

  useEffect(() => {
    if (!SMS_ON) return;
    void (async () => {
      if (!(await isSignedIn())) return router.replace("/login");
      try {
        const list = (await myMemberships()).filter((m) => m.role !== "tech");
        if (!list.length) return router.replace("/t");
        setMs(list);
        const d = getDevice();
        setDevice(d);
        const saved = (() => { try { return localStorage.getItem("nailpos.salon"); } catch { return null; } })();
        setSalonId(d?.salonId ?? list.find((m) => m.salon_id === saved)?.salon_id ?? list[0].salon_id);
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [router]);

  const load = useCallback(async () => {
    if (!salonId) return;
    try { setStaff(await rpc<Staff[]>("today_staff", { p_salon: salonId })); } catch (e) { setErr((e as Error).message); }
  }, [salonId]);
  useEffect(() => { void load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  // Salon device: the acting person signs out after 2 minutes idle.
  const touch = useCallback(() => {
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setActing(null), IDLE_MS);
  }, []);
  useEffect(() => { if (acting) touch(); return () => clearTimeout(idle.current); }, [acting, touch]);

  if (!SMS_ON) return <Centered><h1 className="h2">Sign-in is off in this test copy</h1><p className="cap">Real accounts run on the live site with text codes.</p></Centered>;
  if (err) return <Centered><h1 className="h2">Something went wrong</h1><p className="hint err">{err}</p><Button onClick={() => location.reload()}>Try again</Button></Centered>;
  if (!ms) return <div className="app" aria-busy="true" />;

  const me = ms.find((m) => m.salon_id === salonId) ?? ms[0];
  const isDevice = device?.salonId === salonId;
  const canAdmin = me.role === "owner" || me.role === "manager";
  const inCount = staff.filter((s) => s.clocked_in).length;

  const submitPin = async (pin: string) => {
    if (!pinFor || !device) return;
    setPinErr("");
    const { s, purpose } = pinFor;
    const r = purpose === "clock"
      ? await rpc<PinResult & { kind?: string }>("pin_clock", { p_device: device.id, p_membership: s.membership_id, p_pin: pin, p_kind: s.clocked_in ? "out" : "in" })
      : await rpc<PinResult>("pin_unlock", { p_device: device.id, p_membership: s.membership_id, p_pin: pin });
    if (!r.ok) { setPinErr(pinMessage(r)); if (r.reason === "locked") void load(); return; }
    setActing({ membership_id: s.membership_id, name: s.display_name, role: s.role, at: Date.now() });
    setPinFor(null); setSwitching(false);
    if (purpose === "clock") { say(`${s.display_name} clocked ${s.clocked_in ? "out" : "in"} · ${time(new Date().toISOString())}`); void load(); }
    else say(`Hi ${s.display_name}`);
  };

  return (
    <div className="app" onPointerDown={acting ? touch : undefined}>
      <LeftMenu active="Today" salonInitials={me.salon_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.display_name[0]} />
      <div className="col">
        <TopBar title={me.salon_name}>
          {ms.length > 1 && !isDevice && (
            <select className="inp" aria-label="Salon" style={{ width: "auto", height: 36, fontSize: 14 }} value={salonId}
              onChange={(e) => { setSalonId(e.target.value); try { localStorage.setItem("nailpos.salon", e.target.value); } catch { /* */ } }}>
              {ms.map((m) => <option key={m.salon_id} value={m.salon_id}>{m.salon_name}</option>)}
            </select>
          )}
          <SyncPill />
          {isDevice
            ? <Button data-testid="switch-person" onClick={() => setSwitching(true)}>{acting ? <><Avatar name={acting.name} />{acting.name} · {ROLE_LABEL[acting.role]}</> : "Tap your name"}</Button>
            : <span className="who"><Avatar name={me.display_name} />{me.display_name} · {ROLE_LABEL[me.role]}</span>}
        </TopBar>
        <OfflineBanner />
        <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 980, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1 className="h1">Today</h1>
            <span className="cap">{inCount} of {staff.length} clocked in</span>
          </div>

          {me.role === "owner" && me.setup_step < 9 && (
            <Card pad style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <span className="g" style={{ flex: 1 }}><b>Finish salon setup</b><span className="cap" style={{ display: "block" }}>Step {me.setup_step + 1} of 10</span></span>
              <Button variant="primary" onClick={() => router.push("/setup")}>Continue setup</Button>
            </Card>
          )}

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="eyebrow">Staff</div>
            <ListGroup>
              {staff.map((s) => (
                <Row key={s.membership_id} size="m" data-testid={`staff-${s.display_name}`}
                  title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={s.display_name} /><b style={{ fontWeight: 600 }}>{s.display_name}</b></span>}
                  sub={`${ROLE_LABEL[s.role]}${!s.joined ? " · invite waiting" : !s.has_pin ? " · no PIN yet" : ""}${s.locked ? " · PIN locked" : ""}`}
                  right={<span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {s.clocked_in ? <Tag tone="jade">In since {time(s.last_clock)}</Tag> : s.last_clock ? <span className="cap">Out {time(s.last_clock)}</span> : null}
                    {isDevice && s.has_pin && <Button size="sm" onClick={() => { setPinErr(""); setPinFor({ s, purpose: "clock" }); }}>{s.clocked_in ? "Clock out" : "Clock in"}</Button>}
                  </span>} />
              ))}
              {!staff.length && <Row title={<span className="cap">No staff yet. Add them in setup.</span>} />}
            </ListGroup>
            {!isDevice && <div className="cap">Staff clock in with their PIN on the salon device, or on their own phone.</div>}
          </section>

          {canAdmin && !isDevice && (
            <Card pad>
              <b>Use this computer as the salon device</b>
              <span className="cap">Staff then tap their name + 4-digit PIN here to clock in and check out. It only works for {me.salon_name}.</span>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}><Field id="devname" label="Device name" value={devName} onChange={(e) => setDevName(e.target.value)} /></div>
                <Button variant="primary" onClick={async () => {
                  try { setDevice(await makeSalonDevice(salonId, devName || "Front desk")); say("This is now a salon device"); } catch (e) { setErr((e as Error).message); }
                }}>Make salon device</Button>
              </div>
            </Card>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isDevice && canAdmin && <Button variant="ghost" onClick={() => { forgetDevice(); setDevice(null); setActing(null); }}>Stop using as salon device</Button>}
            <Button variant="ghost" data-testid="sign-out" onClick={async () => { await signOut(); router.replace("/login"); }}>Sign out</Button>
          </div>
        </main>
      </div>

      {switching && !pinFor && (
        <Drawer title="Who are you?" onClose={() => setSwitching(false)}>
          <ListGroup>
            {staff.filter((s) => s.has_pin).map((s) => (
              <button key={s.membership_id} type="button" className="opt" onClick={() => { setPinErr(""); setPinFor({ s, purpose: "switch" }); }}>
                <Avatar name={s.display_name} /><span className="g">{s.display_name}<span className="cap" style={{ display: "block" }}>{ROLE_LABEL[s.role]}</span></span>
              </button>
            ))}
          </ListGroup>
          {acting && <Button variant="ghost" onClick={() => { setActing(null); setSwitching(false); }}>Done (lock)</Button>}
        </Drawer>
      )}
      {pinFor && (
        <Drawer title={`${pinFor.s.display_name}: ${pinFor.purpose === "clock" ? (pinFor.s.clocked_in ? "clock out" : "clock in") : "enter PIN"}`} onClose={() => setPinFor(null)}>
          <p className="cap" style={{ textAlign: "center" }}>Type your 4-digit PIN</p>
          <PinKeypad error={pinErr} onDone={(p) => void submitPin(p)} />
        </Drawer>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}><div className="card pad" style={{ maxWidth: 420, width: "100%", padding: 28, gap: 12 }}>{children}</div></main>;
}
