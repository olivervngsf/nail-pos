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

const NAV = [
  { href: "/me", key: "profile", group: "me" },
  { href: "/settings/team", key: "team", group: "salon" },
  { href: "/settings/pin", key: "pinRules", group: "salon" },
  { href: "/settings/pin-activity", key: "pinActivity", group: "salon" },
  { href: "/settings/devices", key: "devices", group: "salon" },
  { href: "/settings/billing", key: "billing", group: "salon" },
  { href: "/settings/printer", key: "printer", group: "more" },
  { href: "/settings/booking-page", key: "bookingPage", group: "more" },
  { href: "/loyalty", key: "loyalty", group: "more" },
  { href: "/gift-cards", key: "giftCards", group: "more" },
  { href: "/payouts", key: "payouts", group: "more" },
] as const;

export default function SettingsShell({ title, actions, children }: { title: string; actions?: React.ReactNode; children: (a: Access) => React.ReactNode }) {
  const t = useTranslations("settings");
  const path = usePathname();
  const router = useRouter();
  const { me, isDevice, acting, device } = useMe();
  if (!me) return <div className="app" aria-busy="true" />;
  const role: Role = isDevice ? (acting?.role ?? "tech") : me.role;
  const ok = isAdminRole(role);
  const a: Access = { salonId: me.salonId, salonName: me.salonName, role, owner: role === "owner", demo: !SMS_ON };

  return (
    <div className="app set-app">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <nav className="set-nav" aria-label={t("title")}>
        <div className="set-nav-title">{t("title")}</div>
        {(["me", "salon", "more"] as const).map((g) => (
          <div key={g} className="set-nav-group">
            <div className="set-nav-h">{t(`group.${g}`)}</div>
            {NAV.filter((n) => n.group === g).map((n) => (
              <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""} aria-current={path === n.href ? "page" : undefined}>{t(`nav.${n.key}`)}</Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="col">
        <TopBar title={title}>{ok && actions}<SyncPill /></TopBar>
        <OfflineBanner />
        <main className="set-main">
          {ok ? children(a) : (
            <div className="card pad" style={{ maxWidth: 520 }} data-testid="settings-locked">
              <div className="h2">{t("needPin")}</div>
              <p className="cap">{isDevice ? t("needPinDevice") : t("needAdmin")}</p>
              {isDevice && <Button variant="primary" onClick={async () => { await lockDevice(device?.id, acting?.membership_id); router.push("/desk"); }}>{t("unlock")}</Button>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
