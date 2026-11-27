"use client";
// Tech app (M13): who I am on this phone + the shell every tab shares (top bar, bottom tabs Home · Schedule · Book ·
// Earnings · Me). A tech only ever sees their own clients and money: bookings come from `my_appts`, money from `my_earnings`.
import { useSyncWeekStart } from "@/lib/useWeekStart";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { SMS_ON, isSignedIn, myMemberships, myPhoneLast4, signOut, type Membership } from "@/lib/auth";
import { IC, LangRow, PmRow, SizeRow, SUPPORT_MAIL, useMyTime } from "@/components/ProfileMenu";
import { useLang } from "@/components/AppProviders";
import { PhoneBar, SyncPill } from "@/components/kit";
import { DEMO_DESK } from "@/lib/desk";
import { setLive } from "@/lib/checkout/store";

export type TechMe = { salonId: string; salonName: string; id: string; name: string; role: Membership["role"]; live: boolean };

/** The signed-in person on this phone (the tech membership first). Test copy = Kim at the sample salon. */
export function useTechMe() {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const [me, setMe] = useState<TechMe | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!SMS_ON) {
      setLive(false);
      const k = DEMO_DESK.staff[0];
      setMe({ salonId: DEMO_DESK.salonId, salonName: DEMO_DESK.salonName, id: k.id, name: k.name, role: "tech", live: false });
      return;
    }
    void (async () => {
      try {
        if (!(await isSignedIn())) return router.replace("/login");
        const list = await myMemberships();
        const m = list.find((x) => x.role === "tech") ?? list[0];
        if (!m) return router.replace("/setup");
        setLive(true);
        if (m.language && m.language !== lang) setLang(m.language);
        setMe({ salonId: m.salon_id, salonName: m.salon_name, id: m.membership_id, name: m.display_name, role: m.role, live: true });
      } catch (e) { setErr((e as Error).message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);
  useSyncWeekStart(me?.salonId, !!me?.live);
  return { me, err };
}

const TABS = [
  { href: "/t", key: "home", icon: "M3 11l9-7 9 7v9H3z" },
  { href: "/t/schedule", key: "schedule", icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4" },
  { href: "/t/book", key: "book", icon: "M12 5v14M5 12h14" },
  { href: "/t/earnings", key: "earnings", icon: "M4 4h16v16l-3-2-2 2-2-2-2 2-2-2-3 2zM8 9h8M8 13h8" },
  { href: "/t/me", key: "me", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4 4-6 8-6s7 2 8 6" },
] as const;

/** Bottom tabs (links, so the phone's back button works). */
export function TechTabs() {
  const t = useTranslations("tech");
  const path = usePathname();
  return (
    <nav className="ptabs" aria-label={t("menu")}>
      {TABS.map((x) => {
        const on = x.href === "/t" ? path === "/t" : path.startsWith(x.href);
        return (
          <Link key={x.key} href={x.href} className={`ptab${on ? " on" : ""}`} aria-current={on ? "page" : undefined} data-testid={`tab-${x.key}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={x.icon} /></svg>
            {t(`tab_${x.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}

/** One tab's page: top bar, body, tabs. */
export function TechShell({ title, me, err, children }: { title: string; me: TechMe | null; err?: string; children: ReactNode }) {
  return (
    <div className="phone">
      <PhoneBar title={title} left={me ? <TechSheet me={me} /> : null} right={<SyncPill />} />
      {err ? <div className="pbody"><p className="hint err">{err}</p></div>
        : !me ? <div className="pbody" aria-busy="true" />
        : <div className="pbody in">{!me.live && <TestNote />}{children}</div>}
      <TechTabs />
    </div>
  );
}

function TestNote() {
  const t = useTranslations("tech");
  return <div className="demo">{t("demo")}</div>;
}

const initial = (n: string) => n.trim()[0]?.toUpperCase() ?? "?";

/** Profile sheet on the tech's own phone (board Profile pop-up C): tap your face (top left) → sheet from the bottom.
 *  Own things only: profile, time, earnings, PIN, language, text size, help, sign out. Techs never see salon settings. */
export function TechSheet({ me }: { me: TechMe }) {
  const t = useTranslations("account");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const [last4, setLast4] = useState<string | null>(null);
  useEffect(() => { if (open) void myPhoneLast4().then(setLast4).catch(() => {}); else setSub(null); }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const time = useMyTime(me.live ? me.salonId : undefined, me.live ? me.id : undefined, 285);
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <>
      <button type="button" className="tk-me-btn" aria-label={t("menu")} aria-haspopup="dialog" aria-expanded={open} data-testid="tech-me" onClick={() => setOpen(true)}>
        <span className="av tk-av" aria-hidden>{initial(me.name)}</span>
      </button>
      {open && createPortal(
        <>
          <div className="pm-scrim" onClick={() => setOpen(false)} aria-hidden />
          <div className="pm-sheet" role="dialog" aria-modal="true" aria-label={t("menu")} data-testid="tech-sheet">
            <div className="pm-grab" aria-hidden />
            <div className="pm-who">
              <span className="av tk-av lg" aria-hidden>{initial(me.name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}><b className="ell">{me.name}</b>
                <span className="cap ell">{[t(`role.${me.role}`), me.salonName, last4 ? `••${last4}` : ""].filter(Boolean).join(" · ")}</span></span>
            </div>
            <div className="pm" role="menu">
              <PmRow icon={IC.user} label={t("profile")} onClick={() => go("/t/me")} testid="sheet-me" />
              <PmRow icon={IC.clock} label={t("myTime")} right={time ? t("today", { time }) : ""} onClick={() => go(`/t/clock?s=${me.salonId}`)} testid="sheet-time" />
              <PmRow icon={IC.money} label={t("earnings")} onClick={() => go("/t/earnings")} testid="sheet-earnings" />
              <PmRow icon={IC.lock} label={t("changePin")} onClick={() => go(`/t/pin?s=${me.salonId}`)} testid="sheet-pin" />
              <LangRow sub={sub} setSub={setSub} inline long />
              <SizeRow sub={sub} setSub={setSub} inline />
              <PmRow icon={IC.help} label={t("help")} href={SUPPORT_MAIL} />
              <div className="pm-sep" />
              <PmRow icon={IC.out} label={t("signOut")} onClick={async () => { setOpen(false); await signOut(); router.replace("/login"); }} testid="sheet-out" />
            </div>
          </div>
        </>, document.body,
      )}
    </>
  );
}
