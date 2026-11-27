"use client";
// Settings → Pay the team → Pay rules (Oliver, Nov 27): the setup side of paying the team, inside the Settings window.
// Each person's pay (commission % or hourly, check vs cash split) + what the staff slip prints. The payout sheet itself
// is a work screen (left menu / More → Money); this page points to it with one "Open payout sheet ↗" link.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/kit";
import { rpc } from "@/lib/auth";
import { DEMO_TEAM, payLabel, type Member } from "@/lib/team";
import SettingsShell, { LeaveLink, type Access } from "../SettingsShell";

export default function PayRulesPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.payRules")}>{(a) => <Rules a={a} />}</SettingsShell>;
}

function Rules({ a }: { a: Access }) {
  const t = useTranslations("settings.payRules");
  const ta = useTranslations("account");
  const [team, setTeam] = useState<Member[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (a.demo) { setTeam(DEMO_TEAM); return; }
    void rpc<Member[]>("team_list", { p_salon: a.salonId })
      .then((list) => setTeam(list.map((m) => ({ ...m, commissionPct: m.commissionPct == null ? null : Number(m.commissionPct), hourlyCents: m.hourlyCents == null ? null : Number(m.hourlyCents), checkPct: Number(m.checkPct ?? 100) }))))
      .catch((e) => setErr((e as Error).message));
  }, [a.demo, a.salonId]);
  const paid = (team ?? []).filter((m) => m.payType);

  return (
    <>
      <p className="cap">{t("intro")}</p>
      <div className="eyebrow">{t("who")}</div>
      {err ? <p className="hint err">{err}</p> : !team ? <div aria-busy="true" /> : (
        <div className="card pr-card" data-testid="pay-rules-list">
          {paid.length === 0 && <p className="cap" style={{ padding: "12px 16px" }}>{t("none")}</p>}
          {paid.map((m) => (
            <Link key={m.id} href="/settings/team" className="pr-row" data-testid="pay-rule-row">
              <Avatar name={m.name} />
              <span className="pr-t">{m.name}<span className="cap">{ta(`role.${m.role}`)}</span></span>
              <span className="pr-v num">{payLabel(m)}</span>
              <span className="pr-chev" aria-hidden>›</span>
            </Link>
          ))}
        </div>
      )}
      <p className="cap">{a.owner ? t("changeOwner") : t("changeManager")}</p>
      <div className="eyebrow">{t("slip")}</div>
      <div className="card pr-card">
        <Link href="/settings/printer" className="pr-row" data-testid="pay-rules-printer">
          <span className="pr-t">{t("slipRow")}<span className="cap">{t("slipSub")}</span></span>
          <span className="pr-chev" aria-hidden>›</span>
        </Link>
      </div>
      <LeaveLink href="/payouts" testId="open-payouts">{t("openSheet")}</LeaveLink>
    </>
  );
}
