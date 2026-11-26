"use client";
// /settings. Phones + upright tablets (< 900px): the Settings list (Claude's iPad pattern: your card, grouped rows, a
// value and › on each, Sign out at the bottom); tap a row → its page. Computers: the window opens on the first page
// the person may use (Salon info for owner + manager, My profile for everyone else), menu beside it.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LeftMenu } from "@/components/kit";
import type { Role } from "@/lib/auth";
import { isAdminRole, useMe } from "@/lib/me";
import { SettingsWindow } from "./SettingsShell";

export default function SettingsHome() {
  const router = useRouter();
  const { me, isDevice, acting, ready } = useMe();
  const role: Role | null = me ? (isDevice ? (acting?.role ?? "tech") : me.role) : null;
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 900px)");
    const on = () => setWide(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!ready || wide === null) return;
    if (!me) { router.replace("/login?next=/settings"); return; }
    if (wide) router.replace(role && isAdminRole(role) ? "/settings/salon" : "/me");
  }, [ready, me, role, router, wide]);
  if (!me || !role) return <div className="app" aria-busy="true" />;
  return (
    <div className="app set-app" data-testid="settings-home">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <SettingsWindow role={role} title="" home />
    </div>
  );
}
