"use client";
// Founder Admin shell (Oliver, Elang): gate (platform admins only), data (admin_health, cached on the device), left menu.
// Design: Founder Admin Variations board https://claude.ai/artifact/WpMg52SxZ9Hzz577hUtSeg (B = Home, A = Salons).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SMS_ON, isSignedIn, myMemberships, rpc, signOut } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { openAlerts, sampleOverview, type Overview } from "@/lib/admin/health";
import { Button, OfflineBanner, Toast, TopBar } from "@/components/kit";

const CACHE = "nailpos.admin";
type Gate = "loading" | "no" | "live" | "demo";

export type Admin = {
  gate: Gate; data: Overview | null; err: string; hasSalon: boolean; savedAt: string | null;
  reload: () => Promise<void>; handle: (salonId: string, kind: string) => Promise<void>; say: (t: string) => void; toast: string;
};

export function useAdmin(): Admin {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("loading");
  const [data, setData] = useState<Overview | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [hasSalon, setHasSalon] = useState(false);
  const [toast, setToast] = useState("");
  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(""), 3000); }, []);

  const reload = useCallback(async () => {
    try {
      const o = await rpc<Overview>("admin_health");
      setData(o); setSavedAt(null); setErr("");
      try { localStorage.setItem(CACHE, JSON.stringify({ at: new Date().toISOString(), o })); } catch { /* private mode */ }
    } catch (e) {
      let cached: { at: string; o: Overview } | null = null;
      try { cached = JSON.parse(localStorage.getItem(CACHE) ?? "null"); } catch { /* ignore */ }
      if (cached) { setData(cached.o); setSavedAt(cached.at); } else setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!getSupabase() || !SMS_ON) { setGate("demo"); setData(sampleOverview()); return; }
    void (async () => {
      if (!(await isSignedIn())) return router.replace("/login?next=/admin");
      let admin: boolean;
      try { admin = Boolean(await rpc<boolean>("is_platform_admin")); }
      catch {
        // Can't reach the server (offline): signed in + saved overview from an earlier admin visit → show that.
        let cached: { at: string; o: Overview } | null = null;
        try { cached = JSON.parse(localStorage.getItem(CACHE) ?? "null"); } catch { /* ignore */ }
        if (cached) { setData(cached.o); setSavedAt(cached.at); setGate("live"); } else setGate("no");
        return;
      }
      if (!admin) { setGate("no"); try { localStorage.removeItem(CACHE); } catch { /* ignore */ } return; }
      setHasSalon((await myMemberships().catch(() => [])).length > 0);
      setGate("live");
      await reload();
    })();
  }, [router, reload]);

  const handle = useCallback(async (salonId: string, kind: string) => {
    if (gate === "demo") {
      setData((d) => d && { ...d, handled: [...d.handled, { salon_id: salonId, kind, at: new Date().toISOString(), by: d.me }] });
      return say("Handled");
    }
    try { await rpc("admin_handle", { p_salon: salonId, p_kind: kind }); say("Handled · logged"); await reload(); }
    catch (e) { say((e as Error).message); }
  }, [gate, reload, say]);

  return { gate, data, err, hasSalon, savedAt, reload, handle, say, toast };
}

const ICONS = {
  home: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  salons: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
};
const TABS = [{ key: "home", label: "Home", href: "/admin" }, { key: "salons", label: "Salons", href: "/admin/salons" }] as const;
export type Tab = (typeof TABS)[number]["key"];

export function AdminShell({ tab, admin, title, actions, children }: { tab: Tab; admin: Admin; title: string; actions?: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const open = admin.data ? openAlerts(admin.data).length : 0;
  const out = async () => { try { localStorage.removeItem(CACHE); } catch { /* ignore */ } await signOut(); router.replace("/login"); };

  if (admin.gate === "loading") return <div className="app" aria-busy="true" />;
  if (admin.gate === "no") return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad" style={{ maxWidth: 420, width: "100%", padding: 28, gap: 12 }}>
        <h1 className="h2">Admins only</h1>
        <p className="cap">This page is for the PolishOS team. Sign in with an admin phone.</p>
        <Button onClick={() => void out()}>Sign in as someone else</Button>
      </div>
    </main>
  );
  return (
    <div className="app ad-app">
      <nav className="rail" aria-label="Admin menu">
        <div className="logo">P</div>
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} className={t.key === tab ? "on" : ""} aria-current={t.key === tab ? "page" : undefined} style={{ position: "relative" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[t.key]}</svg>
            {t.label}
            {t.key === "home" && open > 0 && <span className="ad-badge" aria-label={`${open} open alerts`}>{open}</span>}
          </Link>
        ))}
      </nav>
      <div className="col">
        <TopBar title={<span className="ad-title">
          <span className="ad-tabs">{TABS.map((t) => <Link key={t.key} href={t.href} className={`chip${t.key === tab ? " on" : ""}`}>{t.label}{t.key === "home" && open ? ` · ${open}` : ""}</Link>)}</span>
          <span className="ad-wide">{title}</span>
        </span>}>
          {actions}
          {admin.hasSalon && <Button onClick={() => router.push("/today")}>Open Today</Button>}
          {admin.gate === "live" && <Button variant="ghost" data-testid="sign-out" onClick={() => void out()}>Sign out</Button>}
        </TopBar>
        <OfflineBanner />
        <main className="ad-main">
          {admin.gate === "demo" && <div className="demo">Test version: sample salons. Real data shows when you sign in as an admin (text codes on).</div>}
          {admin.savedAt && <div className="demo">Offline: showing what this device saved at {new Date(admin.savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.</div>}
          {admin.err && <div className="hint err" role="alert">{admin.err}</div>}
          {children}
          <p className="cap">Health only: totals per salon. No client names, phones or staff pay. Support access needs the owner’s OK (24 h, logged).</p>
        </main>
      </div>
      {admin.toast && <Toast>{admin.toast}</Toast>}
    </div>
  );
}
