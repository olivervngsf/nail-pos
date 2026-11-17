"use client";
// Digital receipt the client opens by scanning the QR on the paper receipt.
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { formatCents as $ } from "@/lib/money";
import { fmtPhone } from "@/lib/onboarding/data";

type R = {
  salon: string; salonPhone: string | null; salonAddress: string | null; number: number; status: "paid" | "refunded"; at: string; client: string | null;
  lines: { kind: "service" | "discount" | "tip" | "loyalty_reward" | "gift_sale"; name: string; cents: number; tech: string | null }[];
  subtotal: number; discount: number; tip: number; total: number;
  points: { earned: number; used: number; balance: number; kind: "points" | "visits"; rewardPoints: number; rewardCents: number } | null;
  pay: { method: "cash" | "card_reader" | "pay_link"; cents: number; given: number | null; change: number | null; brand: string | null; last4: string | null } | null;
};

export default function DigitalReceipt({ id }: { id: string }) {
  const t = useTranslations("receiptPage");
  const f = useFormatter();
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    void fetch(`/api/receipt?id=${encodeURIComponent(id)}`).then(async (x) => {
      const d = await x.json().catch(() => ({}));
      if (x.ok) setR(d as R); else setErr(d.error ?? t("notFound"));
    });
  }, [id, t]);

  return (
    <main className="phone" style={{ background: "var(--surface)" }}>
      <div className="pbody" style={{ paddingTop: 28 }}>
        {err ? <div className="card pad"><b>{t("notFound")}</b></div> : !r ? <div className="cap">…</div> : (
          <div className="card pad" style={{ gap: 12 }} data-testid="digital-receipt">
            <div style={{ textAlign: "center" }}>
              <div className="h2">{r.salon}</div>
              {(r.salonAddress || r.salonPhone) && <div className="cap">{[r.salonAddress, r.salonPhone && fmtPhone(r.salonPhone)].filter(Boolean).join(" · ")}</div>}
              <div className="cap">{t("ticket", { n: r.number })} · {f.dateTime(new Date(r.at), { dateStyle: "medium", timeStyle: "short" })}</div>
              {r.client && <div style={{ marginTop: 6 }}>{t("thanks", { name: r.client })}</div>}
            </div>
            <div className="sep" />
            {r.lines.filter((l) => l.kind === "service").map((l, i) => (
              <div className="line" key={i}><span>{l.name}{l.tech && <span className="cap"> · {l.tech}</span>}</span><span>{$(l.cents)}</span></div>
            ))}
            {(() => { const rw = -r.lines.filter((l) => l.kind === "loyalty_reward").reduce((a, l) => a + l.cents, 0); return <>
              {r.discount - rw > 0 && <div className="line"><span>{t("discount")}</span><span>−{$(r.discount - rw)}</span></div>}
              {rw > 0 && <div className="line" style={{ color: "#1F7A33" }}><span>{t("reward")}</span><span>−{$(rw)}</span></div>}
            </>; })()}
            {r.tip > 0 && <div className="line"><span>{t("tip")}</span><span>{$(r.tip)}</span></div>}
            <div className="sep" />
            <div className="line" style={{ fontSize: 18, fontWeight: 700 }}><span>{t("total")}</span><span>{$(r.total)}</span></div>
            {r.pay && <div className="line cap"><span>{r.pay.method === "cash" ? t("cash") : r.pay.brand ? `${r.pay.brand.toUpperCase()} ••${r.pay.last4 ?? ""}` : t("card")}</span><span>{$(r.pay.method === "cash" ? r.pay.given ?? r.total : r.pay.cents)}</span></div>}
            {r.pay?.method === "cash" && r.pay.change != null && r.pay.change > 0 && <div className="line cap"><span>{t("change")}</span><span>{$(r.pay.change)}</span></div>}
            {r.points && <div className="note" data-testid="receipt-points" style={{ background: "#EAF5EC", color: "#1F7A33" }}>
              {r.points.earned > 0 && t("pointsEarned", { n: r.points.earned, unit: r.points.kind === "visits" ? t("visits") : t("pts") })}{" "}
              {t("pointsBalance", { n: r.points.balance, unit: r.points.kind === "visits" ? t("visits") : t("pts") })}
              {r.points.balance >= r.points.rewardPoints && <> {t("rewardReady", { amt: $(r.points.rewardCents).replace(/\.00$/, "") })}</>}
            </div>}
            {r.status === "refunded" && <div className="note" style={{ background: "var(--orange-soft)", color: "#b5470a" }}>{t("refunded")}</div>}
            <div className="cap" style={{ textAlign: "center", marginTop: 6 }}>{t("keep")}</div>
          </div>
        )}
        <div className="cap" style={{ textAlign: "center" }}>PolishOS</div>
      </div>
    </main>
  );
}
