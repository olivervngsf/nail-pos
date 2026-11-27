"use client";
// Settings → Texting → Messages: every text + email, a status mark (never colour alone), the plain reason and who made
// the rule behind it (law / carriers / Stripe / PolishOS) with a link to "Texting rules, and why".
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/kit";
import StatusIcon from "@/components/StatusIcon";
import { useTextActivity } from "@/lib/texting/activity";
import { kindKey, messageStatus, salonTexting } from "@/lib/texting/status";

export default function TextActivity({ salonId, demo }: { salonId: string; demo: boolean }) {
  const t = useTranslations("textlog");
  const { act } = useTextActivity(salonId, demo);
  const [only, setOnly] = useState<"all" | "problems">("all");
  if (!act) return null;
  const now = new Date();
  const state = salonTexting(act);
  const rows = act.rows.map((r) => ({ r, s: messageStatus(r, now, act.timeZone) }))
    .filter((x) => only === "all" || x.s.tone === "bad" || x.s.tone === "watch");
  return (
    <section className="group in2" data-testid="textlog">
      <div className="tl-head">
        <h2 className="h2" style={{ fontSize: 16, margin: 0, flex: 1 }}>{t("title")}</h2>
        <Chip on={only === "all"} onClick={() => setOnly("all")}>{t("all")}</Chip>
        <Chip on={only === "problems"} onClick={() => setOnly("problems")} data-testid="textlog-problems">{t("problems")}</Chip>
      </div>
      <div className={`tl-banner is-${state}`} data-testid="textlog-state">
        <StatusIcon tone={state === "on" ? "good" : state === "waiting" ? "watch" : "none"} />
        <span><b>{t(`state.${state}`)}</b> <span className="cap">{t(`state.${state}Sub`)}</span></span>
      </div>
      {demo && <div className="demo" style={{ margin: "8px 16px 0" }}>{t("demo")}</div>}
      {rows.length === 0 ? <p className="cap" style={{ padding: 16 }}>{t("none")}</p> : (
        <ul className="tl-list">
          {rows.map(({ r, s }) => (
            <li key={r.id} className="tl-row" data-testid="textlog-row">
              <StatusIcon tone={s.tone} />
              <div className="tl-main">
                <div className="tl-top">
                  <b>{t(`kind.${kindKey(r.kind)}`)}</b>
                  <span className="cap">{r.channel === "email" ? t("email") : t("text")} · {r.to === "••" || r.to === "•••@" ? t("noAddress") : r.to} · {new Date(r.sendAt && s.key === "scheduled" ? r.sendAt : r.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <div className="tl-why">{t(`why.${s.key}`)}{s.detail && s.key !== "skipped" && s.key !== "other" ? <span className="cap"> · {s.detail}</span> : null}</div>
                {s.rule && <Link className="tl-rule" href={`/settings/texting/rules#${s.rule}`}>{t(`rule.${s.rule}`)} · {t("why_")}</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="tl-foot"><Link href="/settings/texting/rules" data-testid="textlog-rules">{t("rulesLink")}</Link></div>
    </section>
  );
}
