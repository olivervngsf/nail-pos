"use client";
// Small pages under Me (board "Settings Map + Back Rules"): same Settings window. Back goes up one step and says where:
// PIN, Language, Text size live on the Settings list → ‹ Settings; Sign in + My sign-ins live on Profile → ‹ Profile.
import { useTranslations } from "next-intl";
import { LeftMenu } from "@/components/kit";
import { useMe } from "@/lib/me";
import { SettingsWindow } from "../settings/SettingsShell";

export default function MeSub({ title, parent = "settings", children }: { title: string; parent?: "settings" | "profile"; children: React.ReactNode }) {
  const t = useTranslations("me");
  const { me, isDevice, acting } = useMe();
  if (!me) return <div className="app" aria-busy="true" />;
  return (
    <div className="app me-app set-app">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <SettingsWindow role={isDevice ? (acting?.role ?? me.role) : me.role} title={title} back={parent === "profile" ? { href: "/me", label: t("titleShort") } : undefined}>
        <main className="me-main me-v2">{children}</main>
      </SettingsWindow>
    </div>
  );
}

/** A list of choices, one with a ✓ (Claude's pickers). Changes apply at once: no Save. */
export function Choices<T extends string>({ value, options, onPick, testid }: { value: T; options: { value: T; label: string; sub?: string }[]; onPick: (v: T) => void; testid: string }) {
  return (
    <section className="me-card" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="me-f me-link me-choice" onClick={() => onPick(o.value)} data-testid={`${testid}-${o.value}`}>
          <span className="me-k" style={{ flex: 1 }}>{o.label}{o.sub && <small>{o.sub}</small>}</span>
          {o.value === value && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
        </button>
      ))}
    </section>
  );
}
