"use client";
// Apple's rule R7 (docs/tap-to-pay-iphone-plan.md): tell existing salons that Tap to Pay on iPhone is there. Inside the
// iPhone app, on an iPhone that can take taps and where it isn't on yet, an owner or manager sees this once (per iPhone):
// what it is + "Turn it on" (→ Settings → Tap to Pay on iPhone, where Apple's terms are accepted) or "Not now".
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import { inIosApp } from "@/lib/app/bridge";
import { canTapToPay, tapOnHere, type TapCheck } from "@/lib/app/reader";
import { getActing, type Desk } from "@/lib/desk";
import { isAdminRole } from "@/lib/me";

const SEEN = "nailpos.tapIntro";

export default function TapIntro({ desk }: { desk: Desk }) {
  const t = useTranslations("tapIntro");
  const router = useRouter();
  const [check, setCheck] = useState<TapCheck | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!inIosApp() || tapOnHere()) return;
    try { if (localStorage.getItem(SEEN)) return; } catch { return; }
    const role = getActing()?.role ?? desk.me.role;
    if (!isAdminRole(role)) return;
    void canTapToPay().then((c) => { if (c.supported) { setCheck(c); setOpen(true); } });
  }, [desk.me.role]);

  if (!open) return null;
  const close = (go: boolean) => {
    try { localStorage.setItem(SEEN, new Date().toISOString()); } catch { /* */ }
    setOpen(false);
    if (go) router.push("/settings/tap-to-pay");
  };
  return (
    <div className="drawer-scrim" role="presentation" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="tap-intro-h" className="card pad" data-testid="tap-intro"
        style={{ width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", gap: 14, paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Apple's own symbol, handed over by the app */}
          {check?.icon && <img src={check.icon} alt="" width={40} height={40} />}
          <b id="tap-intro-h" style={{ fontSize: 20 }}>{t("title")}</b>
        </div>
        <p style={{ margin: 0, fontSize: 16 }}>{t("what")}</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
          <li>{t("p1")}</li><li>{t("p2")}</li><li>{t("p3")}</li>
        </ul>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="primary" data-testid="tap-intro-on" onClick={() => close(true)}>{t("on")}</Button>
          <Button variant="ghost" data-testid="tap-intro-later" onClick={() => close(false)}>{t("later")}</Button>
        </div>
      </div>
    </div>
  );
}
