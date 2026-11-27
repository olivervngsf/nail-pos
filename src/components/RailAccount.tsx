"use client";
// Bottom-left profile pop-up, like Claude (board "Settings, Activity log + Timesheet" → Profile pop-up, Nov 26). Same on every desk screen.
// A · own login: email on top · My profile, Settings (⌘,), Activity log, Plan + usage, Language › | Text size ›, Get help, What's new |
//   Switch salon › | Sign out.  B · salon device: who unlocked + device #ID + since · My time today, Switch person, Language ›,
//   Text size ›, Get help | Lock (back to faces). Salon devices never sign out.
// (No kit import: the kit's LeftMenu renders this, so it uses the kit classes directly.)
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { amPlatformAdmin, myEmail, rpc, signOut, SMS_ON } from "@/lib/auth";
import { setActing } from "@/lib/desk";
import { deviceCode } from "@/lib/deviceInfo";
import { isAdminRole, useMe } from "@/lib/me";
import { useMyPhoto } from "@/lib/photo";
import { IC, LangAndSize, LangRow, PmRow, SizeRow, SUPPORT_MAIL, useMyTime } from "@/components/ProfileMenu";

const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
// eslint-disable-next-line @next/next/no-img-element -- own profile photo (public link or data: URL)
const Avatar = ({ name, large, src }: { name: string; large?: boolean; src?: string }) => <span className={`${large ? "av lg" : "av"}${src ? " has-photo" : ""}`} aria-hidden>{src ? <img src={src} alt="" /> : initials(name)}</span>;

/** Lock the salon device: forget who is working, log it, show the faces screen. */
export async function lockDevice(deviceId: string | undefined, membershipId: string | undefined) {
  setActing(null);
  if (SMS_ON && deviceId) await rpc("device_event", { p_device: deviceId, p_membership: membershipId ?? null, p_action: "lock" }).catch(() => {});
}

export default function RailAccount({ initial }: { initial?: string }) {
  const t = useTranslations("account");
  const f = useFormatter();
  const router = useRouter();
  const { me, device, acting, isDevice } = useMe();
  const photo = useMyPhoto();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  // Founders (platform admins) who also work in a salon: a way back to Founder Admin. Never on a salon device.
  const [founder, setFounder] = useState(false);
  useEffect(() => { if (SMS_ON && !isDevice) void amPlatformAdmin().then(setFounder); }, [isDevice]);
  useEffect(() => { if (open && !isDevice) void myEmail().then(setEmail).catch(() => {}); }, [open, isDevice]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) { setSub(null); return; }
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (sub ? setSub(null) : setOpen(false));
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [open, sub]);

  const name = acting?.name ?? me?.name ?? initial ?? "";
  const role = acting?.role ?? me?.role;
  const admin = !!role && isAdminRole(role);
  const go = (href: string) => { setOpen(false); router.push(href); };
  const lock = async () => { setOpen(false); await lockDevice(device?.id, acting?.membership_id); router.push("/desk"); };
  const toSettings = (href: string) => { try { if (!location.pathname.startsWith("/settings") && location.pathname !== "/me") sessionStorage.setItem("nailpos.setBack", location.pathname + location.search); } catch { /* */ } go(href); };
  const myTime = useMyTime(me?.salonId, acting?.membership_id, 330);

  // ⌘, / Ctrl+, opens Settings (like Claude) for owners + managers on their own login.
  useEffect(() => {
    if (!admin || isDevice) return;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); toSettings("/settings"); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, isDevice]);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const noSub = () => setSub(null);
  const salons = me?.salons ?? [];

  return (
    <div className="rail-acct" ref={box}>
      <button type="button" className="rail-acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t("menu")} data-testid="account-menu" onClick={() => setOpen((o) => !o)}>
        <Avatar name={name || "?"} src={isDevice ? undefined : photo} />
      </button>
      {open && (
        <div className="rail-pop pm" role="menu" aria-label={t("menu")} data-testid="account-pop">
          {isDevice ? (
            <>
              <div className="pm-h dev">
                <b>{name}{role ? ` · ${t(`role.${role}`)}` : ""}</b>
                <span>{[device?.name, device?.id ? `#${deviceCode(device.id)}` : ""].filter(Boolean).join(" ")}{acting?.since ? ` · ${t("byPin", { time: f.dateTime(new Date(acting.since), { hour: "numeric", minute: "2-digit" }) })}` : ""}</span>
              </div>
              {acting && <PmRow icon={IC.clock} label={t("myTimeToday")} right={myTime} onHover={noSub} onClick={() => go("/clock")} testid="pm-time" />}
              <PmRow icon={IC.swap} label={t("switchPerson")} right={t("faceAndPin")} onHover={noSub} onClick={() => void lock()} testid="pm-switch" />
              {admin && <PmRow icon={IC.gear} label={t("settings")} right={t("needsPin")} onHover={noSub} onClick={() => toSettings("/settings")} testid="go-settings" />}
              {admin && <PmRow icon={IC.log} label={t("activity")} onHover={noSub} onClick={() => toSettings("/settings/activity")} testid="go-activity" />}
              <LangAndSize sub={sub} setSub={setSub} />
              <PmRow icon={IC.help} label={t("help")} href={SUPPORT_MAIL} onHover={noSub} testid="pm-help" />
              <div className="pm-sep" />
              <PmRow icon={IC.lock} label={t("lockShort")} right={t("backToFaces")} onHover={noSub} onClick={() => void lock()} testid="lock-device" />
              <p className="pm-note">{t("deviceNever")}</p>
            </>
          ) : (
            <>
              <div className="pm-h" data-testid="pm-email">{email || [name, role ? t(`role.${role}`) : ""].filter(Boolean).join(" · ")}</div>
              <PmRow icon={IC.user} label={t("profile")} onHover={noSub} onClick={() => toSettings("/me")} testid="go-me" />
              {admin && <PmRow icon={IC.gear} label={t("settings")} right={mac ? "⌘," : "Ctrl+,"} onHover={noSub} onClick={() => toSettings("/settings")} testid="go-settings" />}
              {admin && <PmRow icon={IC.log} label={t("activity")} onHover={noSub} onClick={() => toSettings("/settings/activity")} testid="go-activity" />}
              {admin && <PmRow icon={IC.bill} label={t("plan")} right={t("planSalon")} onHover={noSub} onClick={() => toSettings("/settings/billing")} testid="go-plan" />}
              <LangRow sub={sub} setSub={setSub} />
              <div className="pm-sep" />
              <SizeRow sub={sub} setSub={setSub} />
              <PmRow icon={IC.help} label={t("help")} href={SUPPORT_MAIL} onHover={noSub} testid="pm-help" />
              <PmRow icon={IC.news} label={t("whatsNew")} onHover={noSub} onClick={() => toSettings("/settings/whats-new")} testid="pm-news" />
              {(salons.length > 1 || founder) && <div className="pm-sep" />}
              {salons.length > 1 && (
                <div className="pm-subw">
                  <PmRow icon={IC.home} label={t("switchSalon")} right={`${t("salons", { n: salons.length })} ›`} sub open={sub === "salon"} onHover={() => setSub("salon")} onClick={() => setSub(sub === "salon" ? null : "salon")} testid="pm-salons" />
                  {sub === "salon" && (
                    <div className="pm-sub" role="menu" aria-label={t("switchSalon")}>
                      {salons.map((x) => (
                        <button key={x.id} type="button" role="menuitemradio" aria-checked={x.id === me?.salonId} className={`pm-it${x.id === me?.salonId ? " sel" : ""}`}
                          onClick={() => { try { localStorage.setItem("nailpos.salon", x.id); } catch { /* */ } location.reload(); }}>
                          <span className="ell">{x.name}</span>{x.id === me?.salonId && <span className="pm-r pm-ck">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {founder && <PmRow icon={IC.shield} label={t("founderAdmin")} onHover={noSub} onClick={() => go("/admin")} testid="go-admin" />}
              <div className="pm-sep" />
              <PmRow icon={IC.out} label={t("signOut")} onHover={noSub} onClick={async () => { await signOut(); router.replace("/login"); }} testid="sign-out" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
