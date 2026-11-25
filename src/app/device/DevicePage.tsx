"use client";
// Backup page polishosapp.com/device (board https://claude.ai/artifact/FMfHSYjGBmviTiqfX8TYXK, "Rules" note): the same facts as
// the faces screen's strip + gear menu, on a page the faces screen never covers. Anyone can read who this tablet is;
// only an owner/manager PIN opens the buttons, except when the salon already removed the device (then no PIN, like the faces screen).
// Never sends a signed-out visitor away: it says what this browser is instead.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, PinKeypad } from "@/components/kit";
import { DeviceActions, DeviceFacts, DeviceRemoved } from "@/components/DeviceInfo";
import { DEVICE_HOME, getDevice, isSignedIn, myMemberships, pinMessage, rpc, SMS_ON, type Device, type PinResult, type Role } from "@/lib/auth";
import { setActing } from "@/lib/desk";
import { useDeviceCheck } from "@/lib/deviceInfo";
import { cachedRules, keypadLength } from "@/lib/pin";

type Boss = { id: string; name: string; role: Role; pinLen: number | null };
type StaffRow = { membership_id: string; display_name: string; role: Role; has_pin: boolean; pin_len: number | null };
/** Test copy: a sample tablet so the page can be tried. */
const DEMO_DEVICE: Device = { id: "5c0e0000-0000-4000-8000-00000000c10c", salonId: "demo", name: "Back room tablet", kind: "clock", own: true };
const DEMO_BOSS: Boss = { id: "demo-owner", name: "Owner (test)", role: "owner", pinLen: null };

export default function DevicePage() {
  const t = useTranslations("device");
  const td = useTranslations("faces.dev");
  const [device, setDevice] = useState<Device | null | undefined>(undefined);
  const [who, setWho] = useState<string | null>(null);
  const [bosses, setBosses] = useState<Boss[] | null>(null);
  const [pick, setPick] = useState<Boss | null>(null);
  const [opened, setOpened] = useState<Boss | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = SMS_ON ? getDevice() : DEMO_DEVICE;
    setDevice(d);
    if (!SMS_ON) { setBosses([DEMO_BOSS]); return; }
    void (async () => {
      if (!(await isSignedIn())) return setWho("");
      const ms = await myMemberships().catch(() => []);
      const me = ms.find((m) => m.membership_id && (!d || m.salon_id === d.salonId)) ?? ms[0];
      setWho(me ? `${me.display_name || td("asDevice")} · ${me.salon_name}` : "");
      if (!d) return;
      try {
        const list = await rpc<StaffRow[]>("today_staff", { p_salon: d.salonId });
        setBosses(list.filter((s) => (s.role === "owner" || s.role === "manager") && s.has_pin)
          .map((s) => ({ id: s.membership_id, name: s.display_name, role: s.role, pinLen: s.pin_len })));
      } catch { setBosses([]); }
    })();
  }, [td]);
  const c = useDeviceCheck(device ?? null);

  const typed = async (pin: string) => {
    if (!pick || !device || busy) return;
    setErr("");
    if (!SMS_ON) { setOpened(pick); setPick(null); return; }
    setBusy(true);
    try {
      const r = await rpc<PinResult>("pin_unlock", { p_device: device.id, p_membership: pick.id, p_pin: pin });
      if (!r.ok) return setErr(r.reason === "device" ? td("removedTitle") : pinMessage(r));
      setOpened(pick); setPick(null);
    } catch { setErr(t("offline")); } finally { setBusy(false); }
  };

  if (device === undefined) return <main className="dev-page" aria-busy="true" />;

  // Not a salon device: say what this browser is, never redirect.
  if (!device) {
    return (
      <main className="dev-page" data-testid="device-page">
        <h1 className="h1">{t("title")}</h1>
        <section className="card dev-card" data-testid="device-none">
          <b className="h2">{t("noneTitle")}</b>
          <span className="cap">{t("noneWhy")}</span>
          <span className="cap">{who ? t("signedInAs", { who }) : who === "" ? t("signedOut") : ""}</span>
          <Link className="btn primary block" href="/settings/devices">{t("setUp")}</Link>
          <Link className="btn block" href="/go">{t("haveCode")}</Link>
          {who === "" && <Link className="btn ghost block" href="/login">{t("signIn")}</Link>}
        </section>
      </main>
    );
  }

  const home = DEVICE_HOME[device.kind ?? "front_desk"];
  return (
    <main className="dev-page" data-testid="device-page">
      <h1 className="h1">{t("title")}</h1>
      <span className="cap">{t("sub")}</span>
      {!c ? <div className="card dev-card" aria-busy="true" /> : c.state === "removed" ? <DeviceRemoved c={c} /> : (
        <section className="card dev-card">
          <DeviceFacts c={c} />
          {opened ? (
            <>
              <span className="cap" data-testid="device-opened">{td("openedBy", { name: opened.name })}</span>
              <DeviceActions c={c} onSettings={c.person ? () => {
                setActing({ membership_id: opened.id, name: opened.name, role: opened.role, at: Date.now() });
                location.href = "/settings/devices";
              } : undefined} />
            </>
          ) : pick ? (
            <div className="dev-pin">
              <b>{td("pinFor", { name: pick.name })}</b>
              <PinKeypad key={pick.id} length={keypadLength(pick.pinLen, cachedRules(device.salonId))} error={err} onDone={(p) => void typed(p)} />
              <Button variant="ghost" onClick={() => { setPick(null); setErr(""); }}>{td("close")}</Button>
            </div>
          ) : (
            <>
              <span className="cap">{td("pick")}</span>
              <div className="dev-pick">
                {(bosses ?? []).map((b) => <Button key={b.id} data-testid={`boss-${b.name}`} onClick={() => { setErr(""); setPick(b); }}>{b.name}</Button>)}
                {bosses && !bosses.length && <span className="cap">{t("noBoss")}</span>}
              </div>
            </>
          )}
        </section>
      )}
      <Link className="btn ghost" href={home} data-testid="device-back">{t("back")}</Link>
      {!SMS_ON && <div className="demo">{t("demo")}</div>}
    </main>
  );
}
