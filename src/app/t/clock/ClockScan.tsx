"use client";
// Opened by scanning the QR on the salon's time clock tablet with your own phone (/t/clock?s=SALON&c=CODE).
// The code changes every 30 seconds, so this only works standing at the salon. The server checks it (`_clock_phone`).
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { phoneClock, refusal } from "@/lib/clockrule";
import { TechShell, useTechMe } from "../tech";

export default function ClockScan() {
  const t = useTranslations("tech");
  const q = useSearchParams();
  const { me, err } = useTechMe();
  const { lang } = useLang();
  const vi = lang === "vi";
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const salon = q.get("s") ?? "";
  const code = q.get("c") ?? "";

  const go = async (kind: "in" | "out") => {
    if (!me) return;
    setBusy(true); setMsg("");
    try {
      if (!me.live) { setOk(true); setMsg(kind === "in" ? t("clockedIn") : t("clockedOut")); return; }
      if (salon && salon !== me.salonId) { setMsg(vi ? "Mã QR này của tiệm khác." : "This QR is for another salon."); return; }
      const r = await phoneClock(me.salonId, kind, code);
      setOk(r.ok);
      setMsg(r.ok ? (kind === "in" ? t("clockedIn") : t("clockedOut")) : refusal(r, vi));
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <TechShell title={vi ? "Chấm công" : "Clock in"} me={me} err={err}>
      <Card pad>
        <b style={{ fontSize: 17 }}>{vi ? "Chấm công bằng QR ở tiệm" : "Clock in with the salon QR"}</b>
        <span className="cap">{vi ? "Bấm trong 30 giây sau khi quét. Quá giờ thì quét lại mã đang hiện." : "Tap within 30 seconds of scanning. Too late? Scan the code showing now."}</span>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button variant="primary" block disabled={busy || !me} data-testid="qr-in" onClick={() => void go("in")}>{t("clockIn")}</Button>
          <Button block disabled={busy || !me} data-testid="qr-out" onClick={() => void go("out")}>{t("clockOut")}</Button>
        </div>
        {msg && <p className={ok ? "cap" : "hint err"} role="status" data-testid="qr-msg">{msg}</p>}
      </Card>
    </TechShell>
  );
}
