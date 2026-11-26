"use client";
// What's new (profile pop-up → What's new): the latest changes in plain words, newest first. Words in en/vi.json `whatsNew.items`.
import { useTranslations } from "next-intl";
import { LeftMenu } from "@/components/kit";
import { useMe } from "@/lib/me";
import { SettingsWindow } from "../SettingsShell";

type Item = { date: string; title: string; body: string };

export default function WhatsNew() {
  const t = useTranslations("whatsNew");
  const { me, acting, isDevice } = useMe();
  if (!me) return <div aria-busy="true" />;
  const items = t.raw("items") as Item[];
  return (
    <div className="app me-app set-app">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <SettingsWindow role={isDevice ? (acting?.role ?? me.role) : me.role} title={t("title")}>
      <main className="me-main">
      <p className="cap" style={{ margin: 0 }}>{t("sub")}</p>
      <div className="group" data-testid="whats-new">
        {items.map((x) => (
          <div key={x.title} className="wn-row">
            <span className="cap">{x.date}</span>
            <b>{x.title}</b>
            <span>{x.body}</span>
          </div>
        ))}
      </div>
      </main>
      </SettingsWindow>
    </div>
  );
}
