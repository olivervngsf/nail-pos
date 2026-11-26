"use client";
// /settings: the window (computer) or sheet (phone) opens on the first page the person may use
// (Salon info for owner + manager, My profile for everyone else).
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LeftMenu } from "@/components/kit";
import type { Role } from "@/lib/auth";
import { isAdminRole, useMe } from "@/lib/me";
import { SettingsWindow } from "./SettingsShell";

export default function SettingsHome() {
  const router = useRouter();
  const { me, isDevice, acting, ready } = useMe();
  const role: Role | null = me ? (isDevice ? (acting?.role ?? "tech") : me.role) : null;
  useEffect(() => {
    if (!ready) return;
    if (!me) { router.replace("/login?next=/settings"); return; }
    router.replace(role && isAdminRole(role) ? "/settings/salon" : "/me");
  }, [ready, me, role, router]);
  if (!me || !role) return <div className="app" aria-busy="true" />;
  return (
    <div className="app set-app" data-testid="settings-home">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <SettingsWindow role={role} title="" home />
    </div>
  );
}
