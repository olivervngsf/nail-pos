"use client";
// Bottom-left profile pop-up (board "Profile, PIN + Settings": 2.2 desk monitor, 4.2 own computer). Same on every desk screen.
// (No kit import: the kit's LeftMenu renders this, so it uses the kit classes directly.)
// Salon device: big "Lock · show faces" (never sign out; next person taps their face + PIN). Own login: profile, settings, sign out.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLang } from "@/components/AppProviders";
import { rpc, signOut, SMS_ON } from "@/lib/auth";
import { setActing } from "@/lib/desk";
import { isAdminRole, useMe } from "@/lib/me";

const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const Avatar = ({ name, large }: { name: string; large?: boolean }) => <span className={large ? "av lg" : "av"} aria-hidden>{initials(name)}</span>;

/** Lock the salon device: forget who is working, log it, show the faces screen. */
export async function lockDevice(deviceId: string | undefined, membershipId: string | undefined) {
  setActing(null);
  if (SMS_ON && deviceId) await rpc("device_event", { p_device: deviceId, p_membership: membershipId ?? null, p_action: "lock" }).catch(() => {});
}

export default function RailAccount({ initial }: { initial?: string }) {
  const t = useTranslations("account");
  const router = useRouter();
  const { lang, setLang } = useLang();
  const { me, device, acting, isDevice } = useMe();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [open]);

  const name = acting?.name ?? me?.name ?? initial ?? "";
  const role = acting?.role ?? me?.role;
  const go = (href: string) => { setOpen(false); router.push(href); };
  const lock = async () => { setOpen(false); await lockDevice(device?.id, acting?.membership_id); router.push("/desk"); };

  return (
    <div className="rail-acct" ref={box}>
      <button type="button" className="rail-acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t("menu")} data-testid="account-menu" onClick={() => setOpen((o) => !o)}>
        <Avatar name={name || "?"} />
      </button>
      {open && (
        <div className="rail-pop card" role="menu" aria-label={t("menu")} data-testid="account-pop">
          <div className="rail-pop-h">
            <Avatar name={name || "?"} large />
            <span style={{ minWidth: 0 }}>
              <b style={{ display: "block" }}>{name}</b>
              <span className="cap">{role ? t(`role.${role}`) : ""}{me?.salonName ? ` · ${me.salonName}` : ""}</span>
            </span>
          </div>
          {isDevice && (
            <button type="button" role="menuitem" className="btn primary block" data-testid="lock-device" onClick={() => void lock()}>{t("lock")}</button>
          )}
          <div className="rail-pop-list">
            {isDevice && <button type="button" role="menuitem" className="opt" onClick={() => void lock()}>{t("switchPerson")}<span className="cap">{t("faceAndPin")}</span></button>}
            <button type="button" role="menuitem" className="opt" data-testid="go-me" onClick={() => go("/me")}>{t("profile")}</button>
            {role && isAdminRole(role) && (
              <button type="button" role="menuitem" className="opt" data-testid="go-settings" onClick={() => go("/settings")}>{t("settings")}<span className="cap">{isDevice ? t("needsPin") : t("settingsHint")}</span></button>
            )}
            {isDevice && <button type="button" role="menuitem" className="opt" onClick={() => go("/earnings")}>{t("earnings")}<span className="cap">{t("print")}</span></button>}
            {!isDevice && me && me.salons.length > 1 && me.salons.map((s) => (
              <button key={s.id} type="button" role="menuitem" className="opt" onClick={() => { try { localStorage.setItem("nailpos.salon", s.id); } catch { /* */ } location.reload(); }}>
                {s.name}<span className="cap">{s.id === me.salonId ? "✓" : ""}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span className="cap">{t("language")}</span>
            <div className="seg" role="group" aria-label={t("language")}>
              {(["en", "vi"] as const).map((l) => <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
            </div>
          </div>
          {isDevice
            ? <p className="cap" style={{ margin: 0 }}>{t("deviceNote", { salon: me?.salonName ?? "" })}</p>
            : <button type="button" role="menuitem" className="opt rail-pop-out" data-testid="sign-out"
                onClick={async () => { await signOut(); router.replace("/login"); }}>{t("signOut")}</button>}
        </div>
      )}
    </div>
  );
}
