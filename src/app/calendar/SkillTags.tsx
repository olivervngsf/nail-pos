"use client";
// A tech's skills as small tags. Skills the picked services need are marked ✓ (has it) or crossed out (doesn't).
// Facts only, like turns: the desk still picks who.
import { useTranslations } from "next-intl";
import { skillMatch } from "@/lib/booking/skills";

export function SkillTags({ have, need }: { have?: string[]; need: string[] }) {
  const t = useTranslations("calendar");
  const m = skillMatch(have, need);
  const rest = (have ?? []).filter((s) => !m.yes.includes(s) && !need.some((n) => n.toLowerCase() === s.toLowerCase()));
  if (!m.yes.length && !m.no.length && !rest.length) return null;
  return (
    <span className="sk-tags" data-testid="skill-tags">
      {m.yes.map((s) => <span key={s} className="sk-tag yes" title={t("sk_has", { s })}>✓ {s}</span>)}
      {m.no.map((s) => <span key={s} className="sk-tag no" title={t("sk_not", { s })}>{s}</span>)}
      {rest.map((s) => <span key={s} className="sk-tag">{s}</span>)}
    </span>
  );
}

/** "Good at all of it" badge for a tech who has every needed skill. */
export function GoodFit({ have, need }: { have?: string[]; need: string[] }) {
  const t = useTranslations("calendar");
  return skillMatch(have, need).all ? <span className="tag jade" data-testid="good-fit">{t("sk_fit")}</span> : null;
}
