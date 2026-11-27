"use client";
import { useTranslations } from "next-intl";
import { useLang } from "@/components/AppProviders";
import SignInEmail from "@/components/SignInEmail";
import SignInPassword from "@/components/SignInPassword";
import TwoStep from "@/components/TwoStep";
import { isAdminRole, useMe } from "@/lib/me";
import MeSub from "../MeSub";

export default function Page() {
  const t = useTranslations("me");
  const { lang } = useLang();
  const { me, isDevice } = useMe();
  const vi = lang === "vi";
  return (
    <MeSub title={t("signInShort")} parent="profile">
      <div>
        <section className="card pad" style={{ gap: 12 }}>
          <SignInEmail vi={vi} />
          <div className="sep" />
          <SignInPassword vi={vi} />
          {me && isAdminRole(me.role) && !isDevice && <><div className="sep" /><TwoStep vi={vi} /></>}
        </section>
        <p className="me-hint">{t("signInHint")}</p>
      </div>
    </MeSub>
  );
}
