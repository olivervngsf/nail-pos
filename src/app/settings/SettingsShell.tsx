"use client";
// Settings frame (board 5.1): left menu + settings side nav + one section. Owner/manager only; on a salon device the person
// unlocked with the faces screen must be an owner or manager (else: lock and come back with that PIN).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, LeftMenu, OfflineBanner, SyncPill, TopBar } from "@/components/kit";
import { lockDevice } from "@/components/RailAccount";
import { SMS_ON, type Role } from "@/lib/auth";
import { isAdminRole, useMe } from "@/lib/me";

export type Access = { salonId: string; salonName: string; role: Role; owner: boolean; demo: boolean };

// Grouped by job (Oliver, Nov 25: clearer grouping). Order inside a group = how often it's opened.
const GROUPS = ["me", "salon", "team", "pay", "clients", "money"] as const;
const NAV = [
  { href: "/me", key: "profile", group: "me", who: "all" },
  { href: "/settings/salon", key: "salon", group: "salon", who: "admin" },
  { href: "/settings/business", key: "business", group: "salon", who: "admin" },
  { href: "/settings/menu", key: "menu", group: "salon", who: "admin" },
  { href: "/settings/devices", key: "devices", group: "salon", who: "admin" },
  { href: "/settings/billing", key: "billing", group: "salon", who: "admin" },
  { href: "/settings/support", key: "support", group: "salon", who: "admin" },
  { href: "/settings/team", key: "team", group: "team", who: "admin" },
  { href: "/settings/clock-in", key: "clockIn", group: "team", who: "admin" },
  { href: "/settings/pin", key: "pinRules", group: "team", who: "admin" },
  { href: "/settings/pin-activity", key: "pinActivity", group: "team", who: "admin" },
  { href: "/settings/payments", key: "payments", group: "pay", who: "admin" },
  { href: "/settings/reader", key: "reader", group: "pay", who: "admin" },
  { href: "/settings/tap-to-pay", key: "tapToPay", group: "pay", who: "admin" },
  { href: "/settings/printer", key: "printer", group: "pay", who: "admin" },
  { href: "/settings/booking-page", key: "bookingPage", group: "clients", who: "admin" },
  { href: "/settings/texting", key: "texting", group: "clients", who: "admin" },
  { href: "/loyalty", key: "loyalty", group: "clients", who: "admin" },
  { href: "/gift-cards", key: "giftCards", group: "clients", who: "admin" },
  { href: "/payouts", key: "payouts", group: "money", who: "admin" },
] as const;

type Who = "all" | "admin" | "owner";
/** Who may open a settings page: everyone (own profile), owner + manager, or the owner only. */
export const canOpen = (who: Who, role: Role) => who === "all" || (who === "owner" ? role === "owner" : isAdminRole(role));

/** Settings side menu; also shown on My profile (/me) for owners + managers so both feel like one place. */
export function SettingsNav({ role }: { role: Role }) {
  const t = useTranslations("settings");
  const path = usePathname();
  return (
    <nav className="set-nav" aria-label={t("title")}>
      <div className="set-nav-title">{t("title")}<span className="set-nav-who">{t("who")}</span></div>
      {GROUPS.map((g) => (
        <div key={g} className="set-nav-group">
          <div className="set-nav-h">{t(`group.${g}`)}</div>
          {NAV.filter((n) => n.group === g).map((n) => {
            const ok = canOpen(n.who, role);
            return (
              <Link key={n.href} href={n.href} className={`${path === n.href ? "on" : ""}${ok ? "" : " locked"}`} aria-current={path === n.href ? "page" : undefined}
                title={ok ? undefined : t(`access.${n.who}`)} data-testid={`nav-${n.key}`}>
                <span style={{ flex: 1, minWidth: 0 }}>{t(`nav.${n.key}`)}</span>
                {!ok && <span className="set-lock"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>{t(`access.${n.who}`)}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function SettingsShell({ title, actions, children }: { title: string; actions?: React.ReactNode; children: (a: Access) => React.ReactNode }) {
  const t = useTranslations("settings");
  const tr = useTranslations("account");
  const path = usePathname();
  const router = useRouter();
  const { me, isDevice, acting, device, ready } = useMe();
  if (!me) {
    // Not signed in on this device (or no salon yet): say so instead of a blank page.
    if (!ready) return <div className="app" aria-busy="true" />;
    return (
      <main style={{ padding: 24, display: "flex", justifyContent: "center" }}>
        <div className="card pad" style={{ maxWidth: 420, width: "100%" }} data-testid="settings-signin">
          <div className="h2">{t("signInTitle")}</div>
          <p className="cap">{t("signInBody")}</p>
          <Button variant="primary" onClick={() => router.push(`/login?next=${encodeURIComponent(path ?? "/settings")}`)}>{t("signIn")}</Button>
        </div>
      </main>
    );
  }
  const role: Role = isDevice ? (acting?.role ?? "tech") : me.role;
  const ok = isAdminRole(role);
  const a: Access = { salonId: me.salonId, salonName: me.salonName, role, owner: role === "owner", demo: !SMS_ON };

  return (
    <div className="app set-app">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <SettingsNav role={role} />
      <div className="col">
        <TopBar title={title}>{ok && actions}<SyncPill /></TopBar>
        <OfflineBanner />
        <main className="set-main">
          {ok ? children(a) : (
            <div className="card pad" style={{ maxWidth: 520 }} data-testid="settings-locked">
              <div className="h2">{t("needPin")}</div>
              <p className="cap">{isDevice ? t("needPinDevice") : t("needAdmin")}</p>
              <div className="set-access" data-testid="settings-access">
                <div><b>{t("youCan", { role: tr(`role.${role}`) })}</b>{NAV.filter((n) => canOpen(n.who, role)).map((n) => <Link key={n.href} href={n.href}>{t(`nav.${n.key}`)}</Link>)}</div>
                <div><b>{t("youCant")}</b><span className="cap">{NAV.filter((n) => !canOpen(n.who, role)).map((n) => t(`nav.${n.key}`)).join(" · ")}</span></div>
              </div>
              {isDevice && <Button variant="primary" onClick={async () => { await lockDevice(device?.id, acting?.membership_id); router.push("/desk"); }}>{t("unlock")}</Button>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
