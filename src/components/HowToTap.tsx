"use client";
// Apple's rule R8 (docs/tap-to-pay-iphone-plan.md): "how to tap" for staff. Opens Apple's own screens in the iPhone
// app (iOS 18+); on older iOS / older app our short steps instead (same words as Apple's: amount, hold flat on top,
// PIN on screen if asked, wait for the check mark).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import { showHowToTap } from "@/lib/app/reader";

export function HowToTapButton({ variant = "ghost", size }: { variant?: "ghost" | "primary"; size?: "sm" }) {
  const t = useTranslations("howToTap");
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = async () => { setBusy(true); if ((await showHowToTap()) === "own") setOwn(true); setBusy(false); };
  return <>
    <Button variant={variant} size={size} data-testid="how-to-tap" disabled={busy} onClick={() => void open()}>{t("button")}</Button>
    {own && <HowToTapSteps onClose={() => setOwn(false)} />}
  </>;
}

export function HowToTapSteps({ onClose }: { onClose: () => void }) {
  const t = useTranslations("howToTap");
  return (
    <div role="presentation" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="howto-h" className="card pad" data-testid="how-to-tap-steps"
        style={{ width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", gap: 12, paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <b id="howto-h" style={{ fontSize: 20 }}>{t("title")}</b>
        <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8, fontSize: 16 }}>
          <li>{t("s1")}</li><li>{t("s2")}</li><li>{t("s3")}</li><li>{t("s4")}</li><li>{t("s5")}</li>
        </ol>
        <div><Button variant="primary" onClick={onClose}>{t("ok")}</Button></div>
      </div>
    </div>
  );
}
