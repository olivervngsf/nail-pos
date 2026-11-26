"use client";
// Bottom-left profile pop-up (board "Profile, PIN + Settings": 2.2 desk monitor, 4.2 own computer). Same on every desk screen.
// (No kit import: the kit's LeftMenu renders this, so it uses the kit classes directly.)
// Salon device: big "Lock · show faces" (never sign out; next person taps their face + PIN). Own login: profile, settings, sign out.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLang } from "@/components/AppProviders";
import { amPlatformAdmin, rpc, signOut, SMS_ON } from "@/lib/auth";
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
  // Founders (platform admins) who also work in a salon: a way back to Founder Admin. Never on a salon device.
  const [founder, setFounder] = useState(false);
  useEffect(() => { if (SMS_ON && !isDevice) void amPlatformAdmin().then(setFounder); }, [isDevice]);
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

  const admin = !!role && isAdminRole(role);
  const toSettings = (href: string) => { try { if (!location.pathname.startsWith("/settings") && location.pathname !== "/me") sessionStorage.setItem("nailpos.setBack", location.pathname + location.search); } catch { /* */ } go(href); };
  const Ico = ({ d }: { d: string }) => <svg className="pm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
  const I = {
    user: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4.5-6 8-6s7 2 8 6",
    gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.8 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 002.9-1.2V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
    log: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4", card: "M2 6h20v12H2zM2 10h20",
    globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9",
    home: "M3 11l9-7 9 7v9H3zM9 20v-6h6v6", shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7", money: "M2 6h20v12H2zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5",
    lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3", out: "M14 4h5v16h-5M10 17l-5-5 5-5M5 12h11",
  };

  return (
    <div className="rail-acct" ref={box}>
      <button type="button" className="rail-acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t("menu")} data-testid="account-menu" onClick={() => setOpen((o) => !o)}>
        <Avatar name={name || "?"} />
      </button>
      {open && (
        <div className="rail-pop pm" role="menu" aria-label={t("menu")} data-testid="account-pop">
          <div className="pm-h">
            <b>{name}</b>
            <span className="cap">{role ? t(`role.${role}`) : ""}{me?.salonName ? ` · ${me.salonName}` : ""}</span>
          </div>
          {isDevice && <button type="button" role="menuitem" className="pm-it" onClick={() => void lock()}><Ico d={I.swap} />{t("switchPerson")}<span className="pm-r">{t("faceAndPin")}</span></button>}
          <button type="button" role="menuitem" className="pm-it" data-testid="go-me" onClick={() => toSettings("/me")}><Ico d={I.user} />{t("profile")}</button>
          {admin && <button type="button" role="menuitem" className="pm-it" data-testid="go-settings" onClick={() => toSettings("/settings")}><Ico d={I.gear} />{t("settings")}{isDevice && <span className="pm-r">{t("needsPin")}</span>}</button>}
          {admin && <button type="button" role="menuitem" className="pm-it" data-testid="go-activity" onClick={() => toSettings("/settings/activity")}><Ico d={I.log} />{t("activity")}</button>}
          {admin && !isDevice && <button type="button" role="menuitem" className="pm-it" onClick={() => toSettings("/settings/billing")}><Ico d={I.card} />{t("plan")}</button>}
          {isDevice && <button type="button" role="menuitem" className="pm-it" onClick={() => go("/earnings")}><Ico d={I.money} />{t("earnings")}<span className="pm-r">{t("print")}</span></button>}
          <div className="pm-it pm-static"><Ico d={I.globe} />{t("language")}
            <span className="seg pm-r" role="group" aria-label={t("language")}>
              {(["en", "vi"] as const).map((l) => <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
            </span>
          </div>
          {founder && !isDevice && <><div className="pm-sep" /><button type="button" role="menuitem" className="pm-it" data-testid="go-admin" onClick={() => go("/admin")}><Ico d={I.shield} />{t("founderAdmin")}</button></>}
          {!isDevice && me && me.salons.length > 1 && <><div className="pm-sep" />{me.salons.map((x) => (
            <button key={x.id} type="button" role="menuitem" className="pm-it" onClick={() => { try { localStorage.setItem("nailpos.salon", x.id); } catch { /* */ } location.reload(); }}>
              <Ico d={I.home} />{x.name}<span className="pm-r">{x.id === me.salonId ? "✓" : ""}</span>
            </button>
          ))}</>}
          <div className="pm-sep" />
          {isDevice
            ? <>
                <button type="button" role="menuitem" className="pm-it" data-testid="lock-device" onClick={() => void lock()}><Ico d={I.lock} />{t("lock")}</button>
                <p className="cap pm-note">{t("deviceNote", { salon: me?.salonName ?? "" })}</p>
              </>
            : <button type="button" role="menuitem" className="pm-it" data-testid="sign-out" onClick={async () => { await signOut(); router.replace("/login"); }}><Ico d={I.out} />{t("signOut")}</button>}
        </div>
      )}
    </div>
  );
}
