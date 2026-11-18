"use client";
// Tech app (M13): who I am on this phone + the shell every tab shares (top bar, bottom tabs Home · Schedule · Book ·
// Earnings · Me). A tech only ever sees their own clients and money: bookings come from `my_appts`, money from `my_earnings`.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SMS_ON, isSignedIn, myMemberships, type Membership } from "@/lib/auth";
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
      <PhoneBar title={title} right={<SyncPill />} />
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
