"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLang } from "@/components/AppProviders";
import { Segmented } from "@/components/kit";

export default function Home() {
  const t = useTranslations("home");
  const tl = useTranslations("lang");
  const { lang, setLang } = useLang();
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad in" style={{ width: "100%", maxWidth: 440, padding: 28, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="logo" style={{ margin: 0 }}>P</div>
          <Segmented label={tl("label")} value={lang} onChange={setLang} options={[{ value: "en", label: "EN" }, { value: "vi", label: "VI" }]} />
        </div>
        <h1 className="h1">PolishOS</h1>
        <p className="cap lead">{t("tagline")}</p>
        <Link className="btn primary block" href="/setup">{t("setup")}</Link>
        <Link className="btn block" href="/join/DEMO">{t("join")}</Link>
        <Link className="btn ghost block" href="/login" data-testid="sign-in">{t("signIn")}</Link>
        <div className="demo">{t("test")}</div>
      </div>
    </main>
  );
}
