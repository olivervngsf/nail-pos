"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SMS_ON, homeFor, isSignedIn, myMemberships } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { useLang } from "@/components/AppProviders";
import { Segmented } from "@/components/kit";

export default function Home() {
  const t = useTranslations("home");
  const tl = useTranslations("lang");
  const { lang, setLang } = useLang();
  const router = useRouter();
  // Already signed in on this device → skip the start screen, go to your home (Today, tech phone or setup).
  useEffect(() => {
    void isSignedIn().then(async (yes) => { if (yes) router.replace(homeFor(await myMemberships())); }).catch(() => { /* offline: stay here */ });
  }, [router]);
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad in" style={{ width: "100%", maxWidth: 440, padding: 28, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="logo" style={{ margin: 0 }}>P</div>
          <Segmented label={tl("label")} value={lang} onChange={setLang} options={[{ value: "en", label: "EN" }, { value: "vi", label: "VI" }]} />
        </div>
        <h1 className="h1">PolishOS</h1>
        <p className="cap lead">{t("tagline")}</p>
        {SMS_ON ? <>
          {/* Real version: salons are made by PolishOS; owners and staff get an invite link + code. */}
          <Link className="btn primary block" href="/login" data-testid="sign-in">{t("signInMain")}</Link>
          <Link className="btn block" href="/invite" data-testid="have-code">{t("haveCode")}</Link>
          <p className="cap" style={{ margin: 0 }}>{t("askInvite")}</p>
        </> : <>
          <Link className="btn primary block" href="/setup">{t("setup")}</Link>
          <Link className="btn block" href="/join/DEMO">{t("join")}</Link>
          <Link className="btn ghost block" href="/login" data-testid="sign-in">{t("signIn")}</Link>
          <div className="demo">{t("test")}</div>
        </>}
      </div>
    </main>
  );
}
