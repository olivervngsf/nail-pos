"use client";
// More (phones): everything that is not one of the four main tabs. Board "Phone Friendly Audit + Plan" D7.
// Same choices as the bottom-left profile pop-up on a computer, plus the money and salon screens, as one list.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar, LeftMenu, ListGroup, Segmented, SyncPill, TopBar } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { lockDevice } from "@/components/RailAccount";
import { SMS_ON, amPlatformAdmin, signOut } from "@/lib/auth";
import { isAdminRole, useMe } from "@/lib/me";

const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "NP";

export default function MoreMenu() {
  const t = useTranslations("moreMenu");
  const ta = useTranslations("account");
  const router = useRouter();
  const { lang, setLang } = useLang();
  const { me, device, acting, isDevice } = useMe();
  const name = acting?.name ?? me?.name ?? "";
  const role = acting?.role ?? me?.role;
  const admin = !!role && isAdminRole(role);
  const [founder, setFounder] = useState(false); // platform admin: link back to Founder Admin (never on a salon device)
  useEffect(() => { if (SMS_ON && !isDevice) void amPlatformAdmin().then(setFounder); }, [isDevice]);
  const item = (href: string, label: string, id: string, note?: string) => (
    <a className="opt" href={href} data-testid={id}><span className="grow">{label}</span>{note && <span className="cap">{note}</span>}<span className="cap" aria-hidden>›</span></a>
  );
  const lock = async () => { await lockDevice(device?.id, acting?.membership_id); router.push("/desk"); };

  return (
    <div className="app">
      <LeftMenu active="More" salonInitials={initials(me?.salonName ?? "")} me={name[0]} />
      <div className="col">
        <TopBar title={t("title")}><SyncPill /></TopBar>
        <main className="mm" data-testid="more-menu">
          <ListGroup>
            <Link className="opt mm-me" href="/me" data-testid="go-me">
              <Avatar name={name || "?"} large />
              <span className="grow"><b style={{ display: "block" }}>{name}</b><span className="cap">{role ? ta(`role.${role}`) : ""}{me?.salonName ? ` · ${me.salonName}` : ""} · {ta("profile")}</span></span>
              <span className="cap" aria-hidden>›</span>
            </Link>
          </ListGroup>
          <div className="eyebrow">{t("money")}</div>
          <ListGroup>
            {item("/close-day", t("closeDay"), "more-close")}
            {admin && item("/payouts", t("payouts"), "more-payouts")}
            {admin && item("/numbers", t("numbers"), "more-numbers")}
            {admin && item("/gift-cards", t("giftCards"), "more-gift-cards")}
            {admin && item("/settings/loyalty", t("loyalty"), "more-loyalty")}
            {isDevice && item("/earnings", t("earnings"), "more-earnings")}
          </ListGroup>
          {(admin || isDevice) && <>
            <div className="eyebrow">{t("salon")}</div>
            <ListGroup>
              {admin && item("/settings", ta("settings"), "more-settings", isDevice ? ta("needsPin") : undefined)}
              {admin && item("/settings/texting", t("textCredit"), "more-texting")}
              {isDevice && item("/clock", t("timeClock"), "more-clock")}
            </ListGroup>
          </>}
          {founder && !isDevice && <ListGroup>{item("/admin", ta("founderAdmin"), "more-admin", ta("founderAdminHint"))}</ListGroup>}
          <div className="mm-row">
            <span className="cap">{ta("language")}</span>
            <Segmented label={ta("language")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }]} />
          </div>
          {isDevice
            ? <button type="button" className="btn primary block" data-testid="more-lock" onClick={() => void lock()}>{ta("lock")}</button>
            : <button type="button" className="btn block mm-out" data-testid="more-sign-out" onClick={async () => { await signOut(); router.replace("/login"); }}>{ta("signOut")}</button>}
        </main>
      </div>
    </div>
  );
}
