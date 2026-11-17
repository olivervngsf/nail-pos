"use client";
// Client pays on their own phone (Checkout board An1–An4): pick a tip, then Stripe's secure pay page. No sign-in.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip } from "@/components/kit";
import { formatCents, parseDollars, percentOf } from "@/lib/money";

type Info = { salon: string; number: number; amountCents: number; tipCents: number | null; status: "pending" | "paid" | "failed" | "canceled" };

export default function ClientPay({ id }: { id: string }) {
  const t = useTranslations("pay");
  const done = useSearchParams().get("done") === "1";
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<number | "none" | "custom">(20);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const r = await fetch(`/api/pay/public?id=${encodeURIComponent(id)}`);
      const d = await r.json().catch(() => ({}));
      if (stop) return;
      if (!r.ok) return setErr(d.error ?? t("invalid"));
      setInfo(d as Info);
      // Back from Stripe: Stripe may need a few seconds to confirm.
      if (done && d.status === "pending") setTimeout(load, 2000);
    };
    void load();
    return () => { stop = true; };
  }, [id, done, t]);

  const base = info?.amountCents ?? 0;
  const tip = pick === "none" ? 0 : pick === "custom" ? parseDollars(custom) ?? 0 : percentOf(base, pick);
  const pay = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/pay/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, tipCents: tip }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) { location.href = d.url; return; }
    setErr(d.error ?? t("invalid")); setBusy(false);
  };

  return (
    <main className="phone" style={{ background: "var(--surface)" }}>
      <div className="pbody" style={{ gap: 18, paddingTop: 32 }}>
        {err && !info ? <div className="card pad"><b>{err}</b></div>
          : !info ? <div className="cap">{t("loading")}</div>
          : info.status === "paid" ? (
            <div className="card pad" style={{ alignItems: "center", textAlign: "center", gap: 12, padding: 28 }} data-testid="client-paid">
              <div className="okmark lg pop">✓</div>
              <h1 className="h2">{t("paid")}</h1>
              <div className="money">{formatCents(base + (info.tipCents ?? 0))}</div>
              <div className="cap">{info.salon} · {t("ticket", { n: info.number })}</div>
              <div className="cap">{t("paidSub")}</div>
            </div>)
          : info.status !== "pending" ? <div className="card pad"><b>{t("cancelled")}</b></div>
          : <>
            <div style={{ textAlign: "center" }}>
              <div className="cap">{t("title", { salon: info.salon })} · {t("ticket", { n: info.number })}</div>
              <div className="money" style={{ fontSize: 44, lineHeight: "52px" }}>{formatCents(base)}</div>
            </div>
            <div className="card pad" style={{ gap: 12 }}>
              <b>{t("addTip")}</b>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {[15, 20, 25].map((p) => (
                  <Chip key={p} on={pick === p} onClick={() => setPick(p)} style={{ height: 56, flexDirection: "column", justifyContent: "center", borderRadius: 14, gap: 0 }}>
                    <b>{p}%</b><span className="cap" style={{ color: "inherit" }}>{formatCents(percentOf(base, p))}</span>
                  </Chip>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Chip on={pick === "none"} onClick={() => setPick("none")}>{t("noTip")}</Chip>
                <Chip on={pick === "custom"} onClick={() => setPick("custom")}>{t("custom")}</Chip>
                {pick === "custom" && <input className="inp" inputMode="decimal" placeholder="$0" aria-label={t("custom")} style={{ height: 36, flex: 1 }} value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} />}
              </div>
              <div className="sep" />
              <div className="line" style={{ fontSize: 17, fontWeight: 600 }}><span>{t("total")}</span><span>{formatCents(base + tip)}</span></div>
            </div>
            {err && <div className="hint err">{err}</div>}
            <Button variant="primary" block disabled={busy} data-testid="client-pay" onClick={() => void pay()}>{t("payNow", { amount: formatCents(base + tip) })}</Button>
            <div className="cap" style={{ textAlign: "center" }}>{t("secure")}</div>
          </>}
      </div>
    </main>
  );
}
