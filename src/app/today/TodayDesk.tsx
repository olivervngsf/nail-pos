"use client";
// Front desk / owner home (desktop + iPad). Session 1: who's in, clock in/out by PIN, switch person,
// make this a salon device, salon switcher for owners with several salons, sign out.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ROLE_LABEL, SMS_ON, forgetDevice, getDevice, isSignedIn, makeSalonDevice, myMemberships, pinMessage, rpc,
  type Device, type Membership, type PinResult, type Role,
} from "@/lib/auth";
import PaymentsCard from "@/components/PaymentsCard";
import WalkInStrip from "./WalkInStrip";
import { NeedsAttention, OwnerKpis } from "./TodayInsights";
import { getActing, idleMs, setActing as shareActing, touchActing } from "@/lib/desk";
import FacesLock from "@/components/FacesLock";
import { lockDevice } from "@/components/RailAccount";
import { cachedRules, pinLenFor, rememberPinLens, saveRules, type PinRules } from "@/lib/pin";
import { Avatar, Button, Drawer, LeftMenu, ListGroup, OfflineBanner, PinKeypad, Row, SyncPill, Tag, Toast, TopBar } from "@/components/kit";

type Staff = { membership_id: string; display_name: string; role: Role; joined: boolean; has_pin: boolean; locked: boolean; clocked_in: boolean; last_clock: string | null; pin_len: number | null };
type Acting = { membership_id: string; name: string; role: Role; at: number };
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");

export default function TodayDesk() {
  const router = useRouter();
  const [ms, setMs] = useState<Membership[] | null>(null);
  const [salonId, setSalonId] = useState<string>("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [acting, setActing] = useState<Acting | null>(null);
  // Shared with checkout (same device): who is working the desk.
  useEffect(() => { setActing(getActing()); }, []);
  useEffect(() => { shareActing(acting); }, [acting]);
  const [pinFor, setPinFor] = useState<{ s: Staff; purpose: "clock" } | null>(null);
  const [rules, setRules] = useState<PinRules>(cachedRules(null));
  const [lastId, setLastId] = useState<string | undefined>(undefined);
  const [pinErr, setPinErr] = useState("");
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
    try {
      const list = await rpc<Staff[]>("today_staff", { p_salon: salonId });
      setStaff(list);
      rememberPinLens(list.map((x) => ({ id: x.membership_id, len: x.pin_len })));
    } catch (e) { setErr((e as Error).message); }
  }, [salonId]);
  useEffect(() => {
    if (!salonId) return;
    setRules(cachedRules(salonId));
    void rpc<PinRules>("pin_rules", { p_salon: salonId }).then((r) => { setRules(r); saveRules(salonId, r); }).catch(() => {});
  }, [salonId]);
  useEffect(() => { void load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  // Salon device: the acting person signs out after 2 minutes idle.
  const touch = useCallback(() => {
    clearTimeout(idle.current);
    touchActing();
    idle.current = setTimeout(() => setActing((a) => { if (a) setLastId(a.membership_id); return null; }), idleMs());
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
    const r = await rpc<PinResult & { kind?: string }>("pin_clock", { p_device: device.id, p_membership: s.membership_id, p_pin: pin, p_kind: s.clocked_in ? "out" : "in" });
    if (!r.ok) { setPinErr(pinMessage(r)); if (r.reason === "locked") void load(); return; }
    setActing({ membership_id: s.membership_id, name: s.display_name, role: s.role, at: Date.now() });
    setPinFor(null);
    if (purpose === "clock") { say(`${s.display_name} clocked ${s.clocked_in ? "out" : "in"} · ${time(new Date().toISOString())}`); void load(); }
    else say(`Hi ${s.display_name}`);
  };

  if (isDevice && !acting) {
    return (
      <>
        <FacesLock salonName={me.salon_name} rules={rules} deviceId={device?.id} lastId={lastId}
          faces={staff.map((s) => ({ id: s.membership_id, name: s.display_name, role: s.role, clockedIn: s.clocked_in, hasPin: s.has_pin, pinLen: s.pin_len, locked: s.locked }))}
          onUnlock={(u) => { setActing({ membership_id: u.id, name: u.name, role: u.role, at: Date.now() }); say(`Hi ${u.name}`); void load(); }} />
        {toast && <Toast>{toast}</Toast>}
      </>
    );
  }

  return (
    <div className="app" onPointerDown={acting ? touch : undefined}>
      <LeftMenu active="Today" salonInitials={me.salon_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} />
      <div className="col">
        <TopBar title={ms.length > 1 && !isDevice
          ? <select className="inp" aria-label="Salon" style={{ width: "auto", height: 38, fontSize: 17, fontWeight: 600 }} value={salonId}
              onChange={(e) => { setSalonId(e.target.value); try { localStorage.setItem("nailpos.salon", e.target.value); } catch { /* */ } }}>
              {ms.map((m) => <option key={m.salon_id} value={m.salon_id}>{m.salon_name}</option>)}
            </select>
          : me.salon_name}>
          <SyncPill />
          {isDevice && acting && <Button data-testid="switch-person" title="Lock · show faces" onClick={() => { setLastId(acting.membership_id); void lockDevice(device?.id, acting.membership_id); setActing(null); }}>
            <Avatar name={acting.name} />{acting.name} · {ROLE_LABEL[acting.role]}<span className="cap">· Lock</span></Button>}
        </TopBar>
        <OfflineBanner />
        <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 980, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1 className="h1">Today</h1>
            <span className="cap">{inCount} of {staff.length} clocked in</span>
          </div>
          {salonId && canAdmin && <OwnerKpis salonId={salonId} />}
          {salonId && <WalkInStrip salonId={salonId} />}
          {salonId && <NeedsAttention salonId={salonId} staff={staff} />}


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

          {(canAdmin || (me.role === "owner" && me.setup_step < 9)) && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="eyebrow">Salon setup</div>
              <div className="group">
                {me.role === "owner" && me.setup_step < 9 && (
                  <div className="row set">
                    <span className="g"><b style={{ fontWeight: 600 }}>Finish salon setup</b><span className="cap">Step {me.setup_step + 1} of 10</span></span>
                    <Button size="sm" variant="primary" onClick={() => router.push("/setup")}>Continue</Button>
                  </div>
                )}
                {canAdmin && (
                  <div className="row set">
                    <span className="g"><b style={{ fontWeight: 600 }}>Salon device</b>
                      <span className="cap">{isDevice ? `This computer is "${device?.name}". Staff tap their name + PIN here.` : `Staff tap their name + PIN on this computer. Only for ${me.salon_name}.`}</span></span>
                    {isDevice
                      ? <Button size="sm" variant="ghost" onClick={() => { forgetDevice(); setDevice(null); setActing(null); }}>Stop using</Button>
                      : <span style={{ display: "flex", gap: 6 }}>
                          <input className="inp" aria-label="Device name" value={devName} onChange={(e) => setDevName(e.target.value)} style={{ width: 130, height: 34, fontSize: 14, padding: "0 10px" }} />
                          <Button size="sm" onClick={async () => {
                            try { setDevice(await makeSalonDevice(salonId, devName || "Front desk")); say("This is now a salon device"); } catch (e) { setErr((e as Error).message); }
                          }}>Use this computer</Button>
                        </span>}
                  </div>
                )}
                {canAdmin && <PaymentsCard salonId={salonId} />}
              </div>
            </section>
          )}

          {canAdmin && <Link className="tile" href="/gift-cards" data-testid="gift-cards-link" style={{ textDecoration: "none" }}>
            <b>Gift cards</b><span className="cap">Money owed on cards, all codes, lost cards, print plastic cards.</span></Link>}
          {canAdmin && <Link className="tile" href="/settings/booking-page" data-testid="booking-page-link" style={{ textDecoration: "none" }}>
            <b>Booking page</b><span className="cap">Your link, photos, Google / Instagram / QR, rules, walk-in kiosk.</span></Link>}
          {canAdmin && <Link className="tile" href="/settings/printer" data-testid="printer-link" style={{ textDecoration: "none" }}>
            <b>Printer</b><span className="cap">Pick your printer and what each receipt and staff slip shows, with a live preview.</span></Link>}
          {canAdmin && <Link className="tile" href="/settings/texting" data-testid="texting-link" style={{ textDecoration: "none" }}>
            <b>Texting &amp; credit</b><span className="cap">Promo text credit, every send and top-up, what&apos;s included in your plan.</span></Link>}
          {canAdmin && <Link className="tile" href="/loyalty" data-testid="loyalty-link" style={{ textDecoration: "none" }}>
            <b>Loyalty</b><span className="cap">Points tied to the phone number, reward size, client page link.</span></Link>}
          {canAdmin && <Link className="tile" href="/payouts" data-testid="payouts-link" style={{ textDecoration: "none" }}>
            <b>Payout sheet</b><span className="cap">Each tech&apos;s pay + tips for the day or week, check vs cash, print, payroll export.</span></Link>}
          {isDevice && <Link className="tile" href="/earnings" data-testid="earnings-link" style={{ textDecoration: "none" }}>
            <b>Print my earnings</b><span className="cap">Staff tap their name + PIN to see and print only their own earnings.</span></Link>}
        </main>
      </div>

      {pinFor && (
        <Drawer title={`${pinFor.s.display_name}: ${pinFor.s.clocked_in ? "clock out" : "clock in"}`} onClose={() => setPinFor(null)}>
          <p className="cap" style={{ textAlign: "center" }}>Type your {pinLenFor(pinFor.s.membership_id)}-digit PIN</p>
          <PinKeypad length={pinLenFor(pinFor.s.membership_id)} error={pinErr} onDone={(p) => void submitPin(p)} />
        </Drawer>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}><div className="card pad" style={{ maxWidth: 420, width: "100%", padding: 28, gap: 12 }}>{children}</div></main>;
}
