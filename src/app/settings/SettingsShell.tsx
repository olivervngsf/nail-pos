"use client";
// Settings frame (board 5.1): left menu + settings side nav + one section. Owner/manager only; on a salon device the person
// unlocked with the faces screen must be an owner or manager (else: lock and come back with that PIN).
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar, Button, LeftMenu, OfflineBanner, SyncPill, TopBar } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { lockDevice } from "@/components/RailAccount";
import { rpc, signOut, SMS_ON, type Role } from "@/lib/auth";
import { DEMO_DESK, type Desk } from "@/lib/desk";
import { devicesOn } from "@/lib/devices";
import { fmtPhone } from "@/lib/onboarding/data";
import { getSupabase } from "@/lib/supabase/client";
import { cachedRules } from "@/lib/pin";
import { getTextSize } from "@/lib/textSize";
import { useMyPhoto } from "@/lib/photo";
import { isAdminRole, useMe } from "@/lib/me";
import { can, useRolePerms, type Perm, type RolePerms } from "@/lib/roles";

export type Access = { salonId: string; salonName: string; role: Role; owner: boolean; demo: boolean };

// Grouped by job (Oliver, Nov 25: clearer grouping). Order inside a group = how often it's opened.
// One rule (Oliver, Nov 27): every item here is a setting and opens INSIDE the Settings window. Work tools (Gift cards,
// Payout sheet, Close day) live in the left menu / More → Money, never in this list; a settings page may point to one
// only with <LeaveLink> ("Open payout sheet ↗"), which says it leaves.
const GROUPS = ["me", "salon", "team", "pay", "clients", "money", "safety"] as const;
const NAV = [
  { href: "/me", key: "profile", group: "me", who: "all" },
  { href: "/settings/salon", key: "salon", group: "salon", who: "admin" },
  { href: "/settings/business", key: "business", group: "salon", who: "admin" },
  { href: "/settings/menu", key: "menu", group: "salon", who: "admin" },
  { href: "/settings/devices", key: "devices", group: "salon", who: "admin" },
  { href: "/settings/billing", key: "billing", group: "salon", who: "admin" },
  { href: "/settings/team", key: "team", group: "team", who: "admin" },
  { href: "/settings/timesheet", key: "timesheet", group: "team", who: "admin" },
  { href: "/settings/clock-in", key: "clockIn", group: "team", who: "admin" },
  { href: "/settings/pin", key: "pinRules", group: "team", who: "admin" },
  { href: "/settings/roles", key: "roles", group: "team", who: "owner" },
  { href: "/settings/payments", key: "payments", group: "pay", who: "admin" },
  { href: "/settings/reader", key: "reader", group: "pay", who: "admin" },
  { href: "/settings/tap-to-pay", key: "tapToPay", group: "pay", who: "admin" },
  { href: "/settings/printer", key: "printer", group: "pay", who: "admin" },
  { href: "/settings/booking-page", key: "bookingPage", group: "clients", who: "admin" },
  { href: "/settings/reminders", key: "reminders", group: "clients", who: "admin" },
  { href: "/settings/contact", key: "contact", group: "clients", who: "admin" },
  { href: "/settings/texting", key: "texting", group: "clients", who: "admin" },
  { href: "/settings/loyalty", key: "loyalty", group: "clients", who: "admin" },
  { href: "/settings/pay-rules", key: "payRules", group: "money", who: "admin" },
  { href: "/settings/activity", key: "activity", group: "safety", who: "admin" },
  { href: "/settings/notifications", key: "notifications", group: "safety", who: "admin" },
  { href: "/settings/support", key: "support", group: "safety", who: "admin" },
] as const;

// Line icons for the menu (Claude-style: an icon beside every item). Paths on a 24px grid.
const ICON: Record<string, string> = {
  notifications: "M12 3a6 6 0 00-6 6v4l-2 3h16l-2-3V9a6 6 0 00-6-6zM10 19a2 2 0 004 0",
  profile: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4.5-6 8-6s7 2 8 6",
  salon: "M3 11l9-7 9 7v9H3z", business: "M4 21V7l8-4 8 4v14M9 21v-6h6v6", menu: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  devices: "M6 3h12v18H6zM11 18h2", billing: "M2 6h20v12H2zM2 10h20", support: "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17v.5",
  team: "M9 5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7",
  clockIn: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2", timesheet: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M8 14h3M8 17h6", pinRules: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3",
  payments: "M2 6h20v12H2zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5", reader: "M7 2h10v20H7zM10 6h4M10 18h4", tapToPay: "M6 3h12v18H6zM11 18h2M9 9c1.5-1.5 4.5-1.5 6 0M10.5 11.5c.8-.8 2.2-.8 3 0",
  printer: "M6 9V3h12v6M6 17H4v-6h16v6h-2M7 14h10v7H7z", bookingPage: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4", texting: "M4 4h16v12H8l-4 4z", reminders: "M12 3a7 7 0 00-7 7v4l-2 3h18l-2-3v-4a7 7 0 00-7-7zM10 20a2 2 0 004 0",
  contact: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  loyalty: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z", giftCards: "M3 9h18v4H3zM5 13h14v8H5zM12 9v12",
  roles: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4",
  payouts: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z", payRules: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z", activity: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  pin: "M5 11h14v10H5zM8 11V8a4 4 0 018 0v3M12 15v2", language: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  textSize: "M4 18L9 6l5 12M6 14h6M15 18l3-7 3 7M16 15.5h4",
};
const NEW = new Set(["activity", "roles", "timesheet", "notifications"]);

type Who = "all" | "admin" | "owner";
/** Who may open a settings page: everyone (own profile), owner + manager, or the owner only.
 *  A manager also needs that group switched on by the owner (Settings → Roles + permissions). */
export const canOpen = (who: Who, role: Role, group?: string, perms?: RolePerms) =>
  who === "all" || (who === "owner" ? role === "owner" : isAdminRole(role) && (role !== "manager" || !group || group === "me" || can(perms, role, `set.${group}` as Perm)));

/** This salon's permissions for the menu (salon from the device's cached "who am I"). */
function useMyPerms() {
  const [salon, setSalon] = useState<string | null>(null);
  useEffect(() => { try { setSalon((JSON.parse(localStorage.getItem("nailpos.me") ?? "null") as { salonId?: string } | null)?.salonId ?? null); } catch { /* */ } }, []);
  return useRolePerms(salon, !SMS_ON);
}

/** Settings side menu; also shown on My profile (/me) for owners + managers so both feel like one place. */
/** Menu items this person may open (techs + front desk see just Me: no locked clutter), filtered by the search box. */
function useItems(role: Role, q: string) {
  const t = useTranslations("settings");
  const words = q.trim().toLowerCase();
  const perms = useMyPerms();
  return NAV.filter((n) => canOpen(n.who, role, n.group, perms) && (!words || t(`nav.${n.key}`).toLowerCase().includes(words) || t(`group.${n.group}`).toLowerCase().includes(words)));
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

const BACK = "nailpos.setBack";
/** Remember the screen Settings was opened from, so X closes back to it. */
export function rememberSettingsBack(path: string) { try { if (!path.startsWith("/settings") && path !== "/me" && !path.startsWith("/me/")) sessionStorage.setItem(BACK, path); } catch { /* private mode */ } }

/** Where a page's ✓ Save goes: the page header (all sizes). Pages render <SaveCheck> and it lands here. */
export const SAVE_SLOT = "set-save-slot";

/** Phones + tablets list (board "Settings like Claude · Tablet", frame 1): 3 groups, 13 rows. Each row in "Running the
 *  salon" opens a short list of its pages (/settings/more/<group>); Business details sits on Salon info. Search = every page. */
type LRow = { key: string; href: string; who: Who; label?: string; icon?: string };
const HUB_ICON: Record<string, string> = { team: "team", pay: "payments", clients: "bookingPage", money: "payouts", safety: "activity" };
const HUBS = ["team", "pay", "clients", "money", "safety"] as const;
const ME_ROWS: LRow[] = [
  { key: "profile", href: "/me", who: "all", label: "list.profile" },
  { key: "pin", href: "/me/pin", who: "all" }, { key: "language", href: "/me/language", who: "all" }, { key: "textSize", href: "/me/text-size", who: "all" },
];
const SALON_ROWS: LRow[] = [
  { key: "salon", href: "/settings/salon", who: "admin" }, { key: "menu", href: "/settings/menu", who: "admin" },
  { key: "devices", href: "/settings/devices", who: "admin" }, { key: "billing", href: "/settings/billing", who: "admin", label: "list.billing" },
];
/** The pages behind one "Running the salon" row, for this role. */
const hubItems = (g: string, role: Role, perms?: RolePerms) => NAV.filter((n) => n.group === g && canOpen(n.who, role, n.group, perms));

const ICO = ({ k }: { k: string }) => <svg className="set-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[k] ?? ICON.menu} /></svg>;

/** One card of rows: icon · name · value · ›. */
function RowCard({ rows, vals }: { rows: { key: string; href: string; name: string; icon?: string }[]; vals: Record<string, string> }) {
  return (
    <div className="set-lcard">
      {rows.map((r) => (
        <Link key={r.href} href={r.href} className="set-lrow" data-testid={`row-${r.key}`}>
          <ICO k={r.icon ?? r.key} />
          <span className="set-lrow-t">{r.name}</span>
          {vals[r.key] && <span className="set-lrow-v">{vals[r.key]}</span>}
          <span className="set-chev" aria-hidden>›</span>
        </Link>
      ))}
    </div>
  );
}

/** Right-hand value on a row ("English", "6-digit", "42 services", "2 of 3 on", "Stripe ✓"). From what this device
 *  already saved (desk cache), so it shows offline; devices are re-checked when online. */
function useRowValues(role: Role): Record<string, string> {
  const t = useTranslations("settings.val");
  const ta = useTranslations("account");
  const { lang } = useLang();
  const { me } = useMe();
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!me) return;
    const salon = me.salonId;
    const desk: Desk | null = !SMS_ON ? DEMO_DESK : (() => { try { const r = localStorage.getItem(`nailpos.desk.${salon}`); return r ? (JSON.parse(r) as Desk) : null; } catch { return null; } })();
    const devKey = `nailpos.devOn.${salon}`;
    const devText = (on: number, n: number) => (n ? t("devicesOn", { on, n }) : "");
    let dev = "";
    try { dev = localStorage.getItem(devKey) || ""; } catch { /* */ }
    const base: Record<string, string> = {
      language: lang === "vi" ? "Tiếng Việt" : "English",
      textSize: ta(`size.${getTextSize()}`),
      pin: `${cachedRules(salon).length}-digit`,
      billing: ta("planSalon"),
    };
    if (isAdminRole(role)) {
      if (desk?.services?.length) base.menu = t("services", { n: desk.services.length });
      if (desk?.staff?.length) base.team = t("people", { n: desk.staff.length });
      if (desk) base.pay = desk.pay?.ready ? t("stripeOk") : t("notSet");
      base.devices = !SMS_ON ? devText(2, 3) : dev;
    }
    setV(base);
    if (SMS_ON && isAdminRole(role) && navigator.onLine) {
      void rpc<{ last_seen: string | null }[]>("devices_list", { p_salon: salon }).then((list) => {
        const txt = devText(devicesOn(list.map((d) => d.last_seen), Date.now()), list.length);
        try { localStorage.setItem(devKey, txt); } catch { /* */ }
        setV((cur) => ({ ...cur, devices: txt }));
      }).catch(() => { /* offline or not allowed: keep the saved one */ });
    }
  }, [lang, me, role, t, ta]);
  return v;
}

/** The sign-in phone of this login, for the account card ("Owner · Lotus Nails · (408) 555-0101"). */
function useMyPhone(): string {
  const [p, setP] = useState(SMS_ON ? "" : "(408) 555-0101");
  useEffect(() => {
    if (!SMS_ON) return;
    void getSupabase()?.auth.getUser().then(({ data }) => setP(data.user?.phone ? fmtPhone(data.user.phone.replace(/^1/, "")) : "")).catch(() => {});
  }, []);
  return p;
}

/** Phones + upright tablets: Settings opens as a list (Claude's iPad app): your card, then grouped rows with a value
 *  and ›; tap a row → that page (with ‹ back). Sign out sits alone at the bottom. */
function SettingsList({ role, q }: { role: Role; q: string }) {
  const t = useTranslations("settings");
  const ta = useTranslations("account");
  const router = useRouter();
  const { me, isDevice, device, acting } = useMe();
  const photo = useMyPhoto();
  const phone = useMyPhone();
  const vals = useRowValues(role);
  const perms = useMyPerms();
  const words = q.trim().toLowerCase();
  const name = (r: LRow) => t(r.label ?? `nav.${r.key}`);
  const groups: { g: string; rows: { key: string; href: string; name: string; icon?: string }[] }[] = words
    ? [{ g: "", rows: [...ME_ROWS.map((r) => ({ ...r, name: name(r) })), ...NAV.filter((n) => n.href !== "/me" && canOpen(n.who, role, n.group, perms)).map((n) => ({ key: n.key, href: n.href, name: t(`nav.${n.key}`) }))]
        .filter((r) => r.name.toLowerCase().includes(words)) }]
    : [
        { g: "me", rows: ME_ROWS.filter((r) => canOpen(r.who, role)).map((r) => ({ ...r, name: name(r) })) },
        { g: "salon", rows: SALON_ROWS.filter((r) => canOpen(r.who, role, "salon", perms)).map((r) => ({ ...r, name: name(r) })) },
        { g: "running", rows: HUBS.map((g) => ({ g, items: hubItems(g, role, perms) })).filter((h) => h.items.length).map(({ g, items }) => ({
            key: g, name: t(`group.${g}`), icon: HUB_ICON[g], href: items.length === 1 ? items[0].href : `/settings/more/${g}` })) },
      ];
  const shown = groups.filter((x) => x.rows.length);
  return (
    <div className="set-list" data-testid="settings-list">
      {me && !words && (
        <Link href="/me" className="set-acct" data-testid="settings-account">
          <Avatar name={me.name} src={isDevice ? undefined : photo} />
          <span className="set-acct-t"><b>{me.name}</b><span>{[ta(`role.${me.role}`), me.salonName, isDevice ? "" : phone].filter(Boolean).join(" · ")}</span></span>
          <span className="set-chev" aria-hidden>›</span>
        </Link>
      )}
      {shown.map(({ g, rows }) => (
        <div key={g || "found"} className="set-lgroup">
          {g && <div className="set-lgroup-h">{t(`group.${g}`)}</div>}
          <RowCard rows={rows} vals={vals} />
        </div>
      ))}
      {!shown.length && <p className="cap" style={{ padding: "8px 4px" }}>{t("noMatch")}</p>}
      {!words && (isDevice
        ? <button type="button" className="set-lcard set-danger" data-testid="settings-lock" onClick={async () => { await lockDevice(device?.id, acting?.membership_id); router.push("/desk"); }}>{t("lockDevice")}</button>
        : <button type="button" className="set-lcard set-danger" data-testid="settings-signout" onClick={async () => { await signOut(); router.replace("/login"); }}>{ta("signOut")}</button>)}
    </div>
  );
}

/** /settings/more/<group>: the pages behind one "Running the salon" row (phones + tablets). Computers have the menu
 *  beside every page, so they go straight to the group's first page. */
export function SettingsGroupPage({ group }: { group: string }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const { me, isDevice, acting, ready } = useMe();
  const role: Role | null = me ? (isDevice ? (acting?.role ?? "tech") : me.role) : null;
  const perms = useMyPerms();
  const items = role ? hubItems(group, role, perms) : [];
  const first = items[0]?.href ?? "";
  const vals = useRowValues(role ?? "tech");
  useEffect(() => {
    if (!ready) return;
    if (!me) { router.replace(`/login?next=/settings/more/${group}`); return; }
    if (!(HUBS as readonly string[]).includes(group) || !first) { router.replace("/settings"); return; }
    if (window.matchMedia("(min-width: 900px)").matches) router.replace(first);
  }, [ready, me, group, first, router]);
  if (!me || !role || !items.length) return <div className="app" aria-busy="true" />;
  return (
    <div className="app set-app">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <SettingsWindow role={role} title={t(`group.${group}`)}>
        <main className="set-main set-more" data-testid="settings-more">
          <RowCard rows={items.map((n) => ({ key: n.key, href: n.href, name: t(`nav.${n.key}`) }))} vals={vals} />
        </main>
      </SettingsWindow>
    </div>
  );
}

/** The Settings window. Computers (900+): a window over the app, menu on the left + the page on the right.
 *  Phones + upright tablets: list → page, like Claude's iPad app (home = the list; a page = ‹ back, title, ✓ Save). */
export function SettingsWindow({ role, title, actions, home, back, children }: {
  role: Role; title: string; actions?: React.ReactNode; home?: boolean;
  /** Where ‹ goes (default: the Settings list, shown on phones + tablets only). A deeper page (e.g. Profile → Language) passes its parent. */
  back?: { href: string; label: string }; children?: React.ReactNode;
}) {
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
  const backTo = back ?? { href: "/settings", label: t("title") };
  return (
    <>
      <div className="set-scrim" aria-hidden onClick={close} />
      <section className={`set-win${home ? " is-home" : " is-page"}${back ? " is-deep" : ""}`} role="dialog" aria-label={t("title")}>
        <div className="set-win-h">
          <Button variant="ghost" size="sm" className="set-x" aria-label={t("close")} onClick={close} data-testid="settings-close">✕</Button>
          <span>{t("title")}</span>
          <span className="set-x-pad" aria-hidden />
        </div>
        <div className="set-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} data-testid="settings-search" />
        </div>
        <div className="set-win-b">
          <SettingsNav role={role} q={q} />
          {home ? <SettingsList role={role} q={q} /> : (
            <div className="col">
              <TopBar title={title} back={backTo}><span className="set-bar-r">{actions}<span id={SAVE_SLOT} className="set-save-slot" /><SyncPill /></span></TopBar>
              <OfflineBanner />
              {children}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/** The one way a settings page points to a work screen outside Settings: a quiet link at the bottom that says it
 *  leaves (↗). Following it closes the window (the work screen has no Settings frame). */
export function LeaveLink({ href, children, testId }: { href: string; children: React.ReactNode; testId?: string }) {
  return <Link href={href} className="set-leave" data-testid={testId}>{children}<span aria-hidden> ↗</span></Link>;
}

/** ✓ Save in the page header (Claude's pattern): grey until something changed; "Not saved · Undo" beside it while
 *  there are changes. The page keeps its own state; this only draws the button where the header has room for it. */
export function SaveCheck({ dirty, busy, disabled, onSave, onUndo, testId }: {
  dirty: boolean; busy?: boolean; disabled?: boolean; onSave: () => void; onUndo?: () => void; testId?: string;
}) {
  const t = useTranslations("settings");
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined);
  useEffect(() => { setSlot(document.getElementById(SAVE_SLOT)); }, []);
  // A page outside the Settings window (no header slot): a plain Save button where the page put this.
  if (slot === null) return <Button variant="primary" disabled={!dirty || !!disabled || !!busy} onClick={onSave} data-testid={testId}>{busy ? t("saving") : t("save")}</Button>;
  const ui = (
    <span className="set-save">
      {dirty && <span className="set-save-note" data-testid="save-note">{t("notSaved")}</span>}
      {dirty && onUndo && <button type="button" className="set-undo" onClick={onUndo} disabled={busy}>{t("undo")}</button>}
      <button type="button" className={`set-check${dirty && !disabled ? " on" : ""}`} aria-label={busy ? t("saving") : t("save")} title={t("save")}
        disabled={!dirty || !!disabled || !!busy} onClick={onSave} data-testid={testId}>
        {busy ? <span className="set-spin" aria-hidden /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      </button>
    </span>
  );
  return slot ? createPortal(ui, slot) : null;
}

export default function SettingsShell({ title, actions, children }: { title: string; actions?: React.ReactNode; children: (a: Access) => React.ReactNode }) {
  const t = useTranslations("settings");
  const tr = useTranslations("account");
  const path = usePathname();
  const router = useRouter();
  const { me, isDevice, acting, device, ready } = useMe();
  const perms = useRolePerms(me?.salonId, !SMS_ON);
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
  const page = NAV.find((n) => n.href === path);
  const ok = isAdminRole(role) && (!page || canOpen(page.who, role, page.group, perms));
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
                <div><b>{t("youCan", { role: tr(`role.${role}`) })}</b>{NAV.filter((n) => canOpen(n.who, role, n.group, perms)).map((n) => <Link key={n.href} href={n.href}>{t(`nav.${n.key}`)}</Link>)}</div>
                <div><b>{t("youCant")}</b><span className="cap">{NAV.filter((n) => !canOpen(n.who, role, n.group, perms)).map((n) => t(`nav.${n.key}`)).join(" · ")}</span></div>
              </div>
              {isDevice && <Button variant="primary" onClick={async () => { await lockDevice(device?.id, acting?.membership_id); router.push("/desk"); }}>{t("unlock")}</Button>}
            </div>
          )}
        </main>
      </SettingsWindow>
    </div>
  );
}
