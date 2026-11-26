"use client";
import { useTranslations } from "next-intl";
import { useLang } from "@/components/AppProviders";
import MeSub, { Choices } from "../MeSub";

export default function Page() {
  const t = useTranslations("me");
  const ta = useTranslations("account");
  const { lang, setLang } = useLang();
  return (
    <MeSub title={ta("language")}>
      <div>
        <Choices testid="lang" value={lang} onPick={setLang} options={[{ value: "en", label: "English", sub: "English" }, { value: "vi", label: "Tiếng Việt", sub: "Vietnamese" }]} />
        <p className="me-hint">{t("langHint")}</p>
      </div>
    </MeSub>
  );
}
