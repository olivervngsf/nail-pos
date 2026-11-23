"use client";
// "Who's working?" faces screen (board 2.1 / 3.1). The salon device never signs out: it locks to this screen.
// Tap your face → PIN (your own PIN's length) → in. After a PIN-length rule change the old PIN works once, then asks for a new one.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, PinKeypad } from "@/components/kit";
import { pinMessage, rpc, SMS_ON, type Device, type PinResult, type Role } from "@/lib/auth";
import { setActing } from "@/lib/desk";
import { deviceCode, useDeviceCheck, type DeviceCheck } from "@/lib/deviceInfo";
import { DeviceMenu, DeviceRemoved, DeviceStrip } from "@/components/DeviceInfo";
import { keypadLength, pinProblem, type PinRules } from "@/lib/pin";

export type Face = { id: string; name: string; role: Role; clockedIn: boolean; hasPin: boolean; pinLen?: number | null; locked?: boolean };
export type Unlocked = { id: string; name: string; role: Role; pin: string };

const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export default function FacesLock({ salonName, faces, rules, deviceId, device, lastId, title, onUnlock, check }: {
  salonName: string; faces: Face[]; rules: PinRules; deviceId?: string; lastId?: string; title?: string;
  /** This salon device: bottom strip (who + status), gear → device menu, removed screen. Kept in step with Settings → Devices. */
  device?: Device | null;
  onUnlock: (u: Unlocked) => void;
  /** Server check for this screen (default pin_unlock). Must return a PinResult. */
  check?: (id: string, pin: string) => Promise<PinResult & { needs_new?: boolean }>;
}) {
  const t = useTranslations("faces");
  const ta = useTranslations("account");
  const [who, setWho] = useState<Face | null>(null);
  const [step, setStep] = useState<"pin" | "new1" | "new2">("pin");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // The server says this device is not a salon device any more (removed, or set up on another database): offer a way out.
  const [gone, setGone] = useState(false);
  const dc = useDeviceCheck(device);
  const removedC: DeviceCheck | null = dc?.state === "removed" ? dc
    : gone && device ? { ...(dc ?? { name: device.name, code: deviceCode(device.id), person: null }), state: "removed" } : null;
  // Gear: owner or manager picks their face + PIN, then the device menu opens.
  const [admin, setAdmin] = useState<"" | "pick" | "pin">("");
  const [menuBy, setMenuBy] = useState<Unlocked | null>(null);
  const real = faces.filter((f) => (f.role === "owner" || f.role === "manager") && f.hasPin);
  // Test copy has no owner on the time clock: offer a sample one so the gear can be tried.
  const bosses: Face[] = real.length || SMS_ON ? real : [{ id: "demo-owner", name: "Owner (test)", role: "owner", clockedIn: false, hasPin: true }];
  const close = () => { setWho(null); setStep("pin"); setErr(""); setOldPin(""); setNewPin(""); setAdmin(""); };

  const typed = async (pin: string) => {
    if (!who || busy) return;
    setErr("");
    if (admin === "pin") {
      if (!(who.role === "owner" || who.role === "manager")) return setErr(t("dev.bossOnly"));
      const u = { id: who.id, name: who.name, role: who.role, pin };
      if (!SMS_ON) { setMenuBy(u); close(); return; }
      setBusy(true);
      try {
        const r = await rpc<PinResult>("pin_unlock", { p_device: deviceId, p_membership: who.id, p_pin: pin });
        if (!r.ok && r.reason === "device") { setGone(true); close(); return; }
        if (!r.ok) return setErr(pinMessage(r));
        setMenuBy(u); close();
      } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      return;
    }
    if (step === "pin") {
      if (!SMS_ON) { onUnlock({ id: who.id, name: who.name, role: who.role, pin }); close(); return; }
      if (!deviceId) { setGone(true); close(); return; }
      setBusy(true);
      try {
        const r = check ? await check(who.id, pin) : await rpc<PinResult & { needs_new?: boolean }>("pin_unlock", { p_device: deviceId, p_membership: who.id, p_pin: pin });
        if (!r.ok && r.reason === "device") { setGone(true); close(); return; }
        if (!r.ok) return setErr(pinMessage(r));
        if (r.needs_new) { setOldPin(pin); setStep("new1"); return; }
        onUnlock({ id: who.id, name: who.name, role: who.role, pin }); close();
      } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      return;
    }
    if (step === "new1") {
      const p = pinProblem(pin, rules.length);
      if (p) return setErr(t(`bad.${p}`, { n: rules.length }));
      setNewPin(pin); setStep("new2"); return;
    }
    if (pin !== newPin) { setErr(t("mismatch")); setStep("new1"); return; }
    setBusy(true);
    try {
      const r = await rpc<PinResult>("pin_set_new", { p_device: deviceId, p_membership: who.id, p_old: oldPin, p_new: pin });
      if (!r.ok) { setErr(r.reason === ("weak" as PinResult["reason"]) ? t("bad.run", { n: rules.length }) : pinMessage(r)); setStep("new1"); return; }
      onUnlock({ id: who.id, name: who.name, role: who.role, pin }); close();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const len = !who ? rules.length : step === "pin" ? keypadLength(who.pinLen, rules) : rules.length;
  return (
    <div className="faces" data-testid="faces">
      <div className="faces-h">
        <div className="logo" aria-hidden>{initials(salonName)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="h1" style={{ fontSize: 26 }}>{title ?? t("title")}</h1>
          <div className="cap">{t("sub", { salon: salonName })}</div>
        </div>
      </div>
      {removedC ? <DeviceRemoved c={removedC} /> : <>
      <div className="faces-grid">
        {faces.map((f) => (
          <button key={f.id} type="button" className={`face${f.id === lastId ? " last" : ""}`} data-testid={`face-${f.name}`} disabled={!f.hasPin}
            onClick={() => { setErr(""); setStep("pin"); setWho(f); }}>
            <span className={`face-in${f.clockedIn ? " is-in" : ""}`}>{f.clockedIn ? t("in") : t("out")}</span>
            <span className="av">{initials(f.name)}</span>
            <b>{f.name}</b>
            <span className="cap">{!f.hasPin ? t("noPin") : f.locked ? t("locked") : ta(`role.${f.role}`)}</span>
          </button>
        ))}
      </div>
      <p className="cap" style={{ textAlign: "center" }}>{lastId ? t("lastHint") : t("hint")}</p>
      </>}
      {dc && !removedC && <DeviceStrip c={dc} onGear={() => { setErr(""); setAdmin("pick"); }} />}

      {admin === "pick" && !who && (
        <>
          <button className="scrim" aria-label={t("dev.close")} onClick={close} />
          <div className="faces-pin card" role="dialog" aria-modal="true" aria-label={t("dev.title")} data-testid="device-pick">
            <b className="h2" style={{ textAlign: "center" }}>{t("dev.title")}</b>
            <span className="cap" style={{ textAlign: "center" }}>{t("dev.pick")}</span>
            <div className="dev-pick">
              {bosses.map((f) => <Button key={f.id} data-testid={`boss-${f.name}`} onClick={() => { setStep("pin"); setAdmin("pin"); setWho(f); }}>{f.name}</Button>)}
              {!bosses.length && <span className="cap">{t("dev.noBoss")}</span>}
            </div>
            <Button variant="ghost" onClick={close}>{t("dev.close")}</Button>
          </div>
        </>
      )}
      {menuBy && dc && (
        <DeviceMenu c={dc} openedBy={menuBy.name} onClose={() => setMenuBy(null)}
          onSettings={dc.person ? () => { setActing({ membership_id: menuBy.id, name: menuBy.name, role: menuBy.role, at: Date.now() }); location.href = "/settings/devices"; } : undefined} />
      )}

      {who && (
        <>
          <button className="scrim" aria-label={t("notMe")} onClick={close} />
          <div className="faces-pin card" role="dialog" aria-modal="true" aria-label={t("pinFor", { name: who.name })}>
            <span className="av lg" aria-hidden>{initials(who.name)}</span>
            <div className="h2" style={{ textAlign: "center" }}>
              {admin === "pin" ? t("dev.pinFor", { name: who.name }) : step === "pin" ? t("pinFor", { name: who.name }) : step === "new1" ? t("newPin", { n: rules.length }) : t("again")}
            </div>
            {step !== "pin" && <div className="cap" style={{ textAlign: "center" }}>{t("newWhy", { n: rules.length })}</div>}
            <PinKeypad key={`${who.id}-${step}`} length={len} error={err} onDone={(p) => void typed(p)} />
            <Button variant="ghost" onClick={close}>{t("notMe")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
