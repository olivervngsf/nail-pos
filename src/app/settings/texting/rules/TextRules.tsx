"use client";
// Settings → Texting → "Texting rules, and why": every rule a text follows, grouped by who made it, in plain words
// (EN/VI). Linked from each message status (#law, #carriers, #stripe, #polishos). Not legal advice.
import Link from "next/link";
import { useTranslations } from "next-intl";
import SettingsShell from "../../SettingsShell";

const OWNERS = ["law", "carriers", "stripe", "polishos"] as const;

export default function TextRules() {
  const t = useTranslations("textrules");
  return (
    <SettingsShell title={t("title")}>
      {() => (
        <div className="tr" data-testid="textrules">
          <p className="cap" style={{ margin: 0 }}>{t("intro")}</p>
          {OWNERS.map((o) => (
            <section key={o} id={o} className="card pad in2 tr-sec">
              <div className="eyebrow">{t(`${o}.who`)}</div>
              <h2 className="h2" style={{ fontSize: 17, margin: 0 }}>{t(`${o}.title`)}</h2>
              <ul className="tr-list">
                {(t.raw(`${o}.items`) as string[]).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
              <p className="cap" style={{ margin: 0 }}>{t(`${o}.why`)}</p>
            </section>
          ))}
          <p className="cap" style={{ margin: 0 }}>{t("note")}</p>
          <Link href="/settings/texting">{t("back")}</Link>
        </div>
      )}
    </SettingsShell>
  );
}
