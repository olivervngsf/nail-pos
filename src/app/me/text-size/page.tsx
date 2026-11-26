"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getTextSize, setTextSize, TEXT_SIZES, type TextSize } from "@/lib/textSize";
import MeSub, { Choices } from "../MeSub";

export default function Page() {
  const t = useTranslations("me");
  const ta = useTranslations("account");
  const [size, setSize] = useState<TextSize>("normal");
  useEffect(() => setSize(getTextSize()), []);
  return (
    <MeSub title={ta("textSize")}>
      <div>
        <Choices testid="size" value={size} onPick={(s) => { setTextSize(s); setSize(s); }} options={TEXT_SIZES.map((s) => ({ value: s, label: ta(`size.${s}`) }))} />
        <p className="me-hint">{t("sizeHint")}</p>
      </div>
    </MeSub>
  );
}
