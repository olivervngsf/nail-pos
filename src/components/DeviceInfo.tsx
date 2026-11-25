"use client";
// Faces screen device pieces (board https://claude.ai/artifact/FMfHSYjGBmviTiqfX8TYXK): bottom strip (who + status + gear),
// device menu (owner/manager PIN first), removed screen (no PIN). Same facts as Settings → Devices (useDeviceCheck).
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import StatusIcon from "@/components/StatusIcon";
import { forgetDevice, signOut } from "@/lib/auth";
import type { DeviceCheck } from "@/lib/deviceInfo";

const tone = (s: DeviceCheck["state"]) => (s === "active" ? "good" : s === "removed" ? "bad" : "none");
const clearActing = () => { try { localStorage.removeItem("nailpos.acting"); } catch { /* storage blocked */ } };

export function useWhoLine(c: DeviceCheck) {
  const t = useTranslations("faces.dev");
  const ta = useTranslations("account");
  const who = c.person ? t("as", { name: c.person.name, role: ta(`role.${c.person.role}`) }) : t("asDevice");
  return c.salonName ? `${who} · ${c.salonName}` : who;
}

export function DeviceStrip({ c, onGear }: { c: DeviceCheck; onGear: () => void }) {
  const t = useTranslations("faces.dev");
  const who = useWhoLine(c);
  return (
    <div className="dev-strip" data-testid="device-strip">
      <StatusIcon tone={tone(c.state)} size={20} />
      <div className="dev-strip-t">
        <b>{c.name} <span className="dev-code">#{c.code}</span> · {t(`state.${c.state}`)}</b>
        <span className="cap">{who}</span>
      </div>
      <button type="button" className="dev-gear" aria-label={t("gear")} data-testid="device-gear" onClick={onGear}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
    </div>
  );
}

/** The device's facts, same rows on the gear menu and on /device. */
export function DeviceFacts({ c }: { c: DeviceCheck }) {
  const t = useTranslations("faces.dev");
  const td = useTranslations("settings.dev");
  const who = useWhoLine(c);
  const facts: [string, string][] = [
    [t("nick"), c.name],
    [t("id"), `#${c.code} · ${t("idNote")}`],
    ...(c.kind ? [[t("job"), td(`kind.${c.kind}`)] as [string, string]] : []),
    [t("who"), who],
    ...(c.setUpAt ? [[t("setUp"), `${new Date(c.setUpAt).toLocaleString()}${c.setUpBy ? ` · ${c.setUpBy}` : ""}`] as [string, string]] : []),
  ];
  return (
    <dl className="dev-facts" data-testid="device-facts">
      {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      <div><dt>{t("status")}</dt><dd className="dev-st"><StatusIcon tone={tone(c.state)} size={16} />{t(`state.${c.state}`)}</dd></div>
    </dl>
  );
}

/** What an owner/manager may do with this device (PIN checked before these show). */
export function DeviceActions({ c, onSettings }: { c: DeviceCheck; onSettings?: () => void }) {
  const t = useTranslations("faces.dev");
  return (
    <>
      {onSettings
        ? <Button variant="primary" block data-testid="device-settings" onClick={onSettings}>{t("settings")}</Button>
        : <p className="cap">{t("ownDevice")}</p>}
      {c.person && (
        <Button block data-testid="device-stop" onClick={() => { forgetDevice(); clearActing(); location.href = "/today"; }}>
          {t("stop", { name: c.person.name })}
        </Button>
      )}
      <Button block data-testid="device-signout" style={{ color: "var(--orange)" }}
        onClick={async () => { forgetDevice(); clearActing(); await signOut(); location.href = "/login"; }}>{t("signOut")}</Button>
    </>
  );
}

/** Owner/manager only (PIN checked before this opens). Closes by itself after 60 s. */
export function DeviceMenu({ c, openedBy, onSettings, onClose }: { c: DeviceCheck; openedBy: string; onSettings?: () => void; onClose: () => void }) {
  const t = useTranslations("faces.dev");
  useEffect(() => { const h = setTimeout(onClose, 60_000); return () => clearTimeout(h); }, [onClose]);
  return (
    <>
      <button className="scrim" aria-label={t("close")} onClick={onClose} />
      <div className="faces-pin card dev-menu" role="dialog" aria-modal="true" aria-label={t("title")} data-testid="device-menu">
        <div className="dev-menu-h"><b className="h2">{t("title")}</b><span className="cap">{t("openedBy", { name: openedBy })}</span></div>
        <DeviceFacts c={c} />
        <DeviceActions c={c} onSettings={onSettings} />
        <Button variant="ghost" onClick={onClose}>{t("close")}</Button>
        <span className="cap" style={{ textAlign: "center" }}>{t("backupHint")}</span>
      </div>
    </>
  );
}

export function DeviceRemoved({ c }: { c: DeviceCheck }) {
  const t = useTranslations("faces.dev");
  const who = useWhoLine(c);
  return (
    <div className="card dev-removed" data-testid="device-removed">
      <StatusIcon tone="bad" size={44} label={t("state.removed")} />
      <b className="h2">{t("removedTitle")}</b>
      <span className="cap">{t("removedWhy")} {who}</span>
      <Button variant="primary" block data-testid="device-again"
        onClick={() => { forgetDevice(); clearActing(); location.href = c.person ? (c.person.role === "owner" || c.person.role === "manager" ? "/settings/devices" : "/today") : "/login"; }}>{t("again")}</Button>
      <Button variant="ghost" onClick={async () => { forgetDevice(); clearActing(); await signOut(); location.href = "/login"; }}>{t("signOutInstead")}</Button>
      {c.person?.role !== "owner" && <span className="cap">{t("askOwner")}</span>}
      <span className="cap">{t("backupHint")}</span>
    </div>
  );
}
