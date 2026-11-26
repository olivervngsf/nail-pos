"use client";
// Settings frame (board 5.1): left menu + settings side nav + one section. Owner/manager only; on a salon device the person
// unlocked with the faces screen must be an owner or manager (else: lock and come back with that PIN).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, LeftMenu, OfflineBanner, SyncPill, TopBar } from "@/components/kit";
import { lockDevice } from "@/components/RailAccount";
import { SMS_ON, type Role } from "@/lib/auth";
import { isAdminRole, useMe } from "@/lib/me";

export type Access = { salonId: string; salonName: string; role: Role; owner: boolean; demo: boolean };

// Grouped by job (Oliver, Nov 25: clearer grouping). Order inside a group = how often it's opened.
const GROUPS = ["me", "salon", "team", "pay", "clients", "money", "safety"] as const;
const NAV = [
  { href: "/me", key: "profile", group: "me", who: "all" },
  { href: "/settings/salon", key: "salon", group: "salon", who: "admin" },
  { href: "/settings/business", key: "business", group: "salon", who: "admin" },
  { href: "/settings/menu", key: "menu", group: "salon", who: "admin" },
  { href: "/settings/devices", key: "devices", group: "salon", who: "admin" },
  { href: "/settings/billing", key: "billing", group: "salon", who: "admin" },
  { href: "/settings/team", key: "team", group: "team", who: "admin" },
  { href: "/settings/clock-in", key: "clockIn", group: "team", who: "admin" },
  { href: "/settings/pin", key: "pinRules", group: "team", who: "admin" },
  { href: "/settings/payments", key: "payments", group: "pay", who: "admin" },
  { href: "/settings/reader", key: "reader", group: "pay", who: "admin" },
  { href: "/settings/tap-to-pay", key: "tapToPay", group: "pay", who: "admin" },
  { href: "/settings/printer", key: "printer", group: "pay", who: "admin" },
  { href: "/settings/booking-page", key: "bookingPage", group: "clients", who: "admin" },
  { href: "/settings/texting", key: "texting", group: "clients", who: "admin" },
  { href: "/loyalty", key: "loyalty", group: "clients", who: "admin" },
  { href: "/gift-cards", key: "giftCards", group: "clients", who: "admin" },
  { href: "/payouts", key: "payouts", group: "money", who: "admin" },
  { href: "/settings/activity", key: "activity", group: "safety", who: "admin" },
  { href: "/settings/support", key: "support", group: "safety", who: "admin" },
] as const;

// Line icons for the menu (Claude-style: an icon beside every item). Paths on a 24px grid.
const ICON: Record<string, string> = {
  profile: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4.5-6 8-6s7 2 8 6",
  salon: "M3 11l9-7 9 7v9H3z", business: "M4 21V7l8-4 8 4v14M9 21v-6h6v6", menu: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  devices: "M6 3h12v18H6zM11 18h2", billing: "M2 6h20v12H2zM2 10h20", support: "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17v.5",
  team: "M9 5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7",
  clockIn: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2", pinRules: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3",
  payments: "M2 6h20v12H2zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5", reader: "M7 2h10v20H7zM10 6h4M10 18h4", tapToPay: "M6 3h12v18H6zM11 18h2M9 9c1.5-1.5 4.5-1.5 6 0M10.5 11.5c.8-.8 2.2-.8 3 0",
  printer: "M6 9V3h12v6M6 17H4v-6h16v6h-2M7 14h10v7H7z", bookingPage: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4", texting: "M4 4h16v12H8l-4 4z",
  loyalty: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z", giftCards: "M3 9h18v4H3zM5 13h14v8H5zM12 9v12",
  payouts: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z", activity: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
};
const NEW = new Set(["activity"]);

type Who = "all" | "admin" | "owner";
/** Who may open a settings page: everyone (own profile), owner + manager, or the owner only. */
export const canOpen = (who: Who, role: Role) => who === "all" || (who === "owner" ? role === "owner" : isAdminRole(role));

/** Settings side menu; also shown on My profile (/me) for owners + managers so both feel like one place. */
/** Menu items this person may open (techs + front desk see just Me: no locked clutter), filtered by the search box. */
function useItems(role: Role, q: string) {
  const t = useTranslations("settings");
  const words = q.trim().toLowerCase();
  return NAV.filter((n) => canOpen(n.who, role) && (!words || t(`nav.${n.key}`).toLowerCase().includes(words) || t(`group.${n.group}`).toLowerCase().includes(words)));
}

export function SettingsNav({ role, q = "" }: { role: Role; q?: string }) {
  const t = useTranslations("settings");
  const path = usePathname();
  const items = useItems(role, q);
  const groups = GROUPS.map((g) => ({ g, items: items.filter((n) => n.group === g) })).filter((x) => x.items.length);
  return (
    <nav className="set-nav" aria-label={t("title")}>
      <div className="set-nav-title">{t("title")}<span className="set-nav-who">{t("who")}</span></div>
      {groups.map(({ g, items }) => (
        <div key={g} className="set-nav-group">
          <div className="set-nav-h">{t(`group.${g}`)}</div>
          <div className="set-nav-items">
            {items.map((n) => (
              <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""} aria-current={path === n.href ? "page" : undefined} data-testid={`nav-${n.key}`}>
                <svg className="set-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[n.key] ?? ICON.menu} /></svg>
                <span style={{ flex: 1, minWidth: 0 }}>{t(`nav.${n.key}`)}</span>
                {NEW.has(n.key) && <span className="new-tag">NEW</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
      {!groups.length && <p className="cap" style={{ padding: "8px 10px" }}>{t("noMatch")}</p>}
    </nav>
  );
}

/** Phones + upright tablets: the same menu as a row of tabs you swipe sideways (Claude's mobile Settings). */
function SettingsTabs({ role, q }: { role: Role; q: string }) {
  const t = useTranslations("settings");
  const path = usePathname();
  const items = useItems(role, q);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => { row.current?.querySelector<HTMLElement>("a.on")?.scrollIntoView({ block: "nearest", inline: "center" }); }, [path]);
  return (
    <div className="set-tabs-row" ref={row} role="tablist" aria-label={t("title")}>
      {items.map((n) => (
        <Link key={n.href} href={n.href} role="tab" aria-selected={path === n.href} className={path === n.href ? "on" : ""} data-testid={`tab-${n.key}`}>{t(`nav.${n.key}`)}</Link>
      ))}
      {!items.length && <span className="cap">{t("noMatch")}</span>}
    </div>
  );
}

const BACK = "nailpos.setBack";
/** Remember the screen Settings was opened from, so X closes back to it. */
export function rememberSettingsBack(path: string) { try { if (!path.startsWith("/settings") && path !== "/me") sessionStorage.setItem(BACK, path); } catch { /* private mode */ } }

/** The Settings window: a pop-up over the app on computers, a full page (list → page) on phones and upright tablets. */
export function SettingsWindow({ role, title, actions, home, children }: { role: Role; title: string; actions?: React.ReactNode; home?: boolean; children?: React.ReactNode }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [q, setQ] = useState("");
  const close = () => { let to = "/today"; try { to = sessionStorage.getItem(BACK) || to; } catch { /* */ } router.push(to); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { // Esc closes the window only when nothing smaller is open (a drawer, sheet, menu or popover closes first).
      if (e.key === "Escape" && window.innerWidth >= 900 && !document.querySelector(".drawer, .sheet, .scrim, [role=menu], [data-testid=credit-pop], [aria-expanded=true]")) close(); };
    // Capture phase: look before a popover's own Esc handler closes it (else both would close at once).
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  });
  return (
    <>
      <div className="set-scrim" aria-hidden onClick={close} />
      <section className="set-win" role="dialog" aria-label={t("title")}>
        <div className="set-win-h"><span>{t("title")}</span><Button variant="ghost" size="sm" aria-label={t("close")} onClick={close} data-testid="settings-close">✕</Button></div>
        <div className="set-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} data-testid="settings-search" />
        </div>
        <SettingsTabs role={role} q={q} />
        <div className="set-win-b">
          <SettingsNav role={role} q={q} />
          {!home && (
            <div className="col">
              <TopBar title={title}>{actions}<SyncPill /></TopBar>
              <OfflineBanner />
              {children}
            </div>
          )}
        </div>
      </section>
    </>
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
      <SettingsWindow role={role} title={title} actions={ok ? actions : undefined}>
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
      </SettingsWindow>
    </div>
  );
}
