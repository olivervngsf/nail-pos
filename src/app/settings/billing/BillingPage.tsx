"use client";
// Settings → Billing: the salon's PolishOS plan (monthly vs yearly), status + next renewal, payment card, invoices,
// add-ons (text battery), cancel. Owner changes; manager reads. Test version: plan kept on this device until
// Stripe Billing is wired (prices are the pilot proposal, not final).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, DataTable, Drawer, StatusPill, Toast } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { useStored } from "@/lib/useStored";
import SettingsShell, { type Access } from "../SettingsShell";

type Cycle = "monthly" | "yearly";
type Status = "trial" | "active" | "canceling";
type Billing = { cycle: Cycle; status: Status; renews: string; texts: number; refill: boolean };

export const PRICE: Record<Cycle, number> = { monthly: 4900, yearly: 3900 }; // cents per month
const TEXT_PACK = { texts: 500, cents: 1000 };

const plus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const daysTo = (iso: string) => Math.max(0, Math.round((new Date(iso + "T12:00:00").getTime() - Date.now()) / 864e5));

export default function BillingPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.billing")}>{(a) => <BillingView a={a} />}</SettingsShell>;
}

function BillingView({ a }: { a: Access }) {
  const t = useTranslations("settings.bill");
  const [b, setB] = useStored<Billing>(`nailpos.billing.${a.salonId}`, () => ({ cycle: "monthly", status: "trial", renews: plus(30), texts: 420, refill: false }));
  const [cancel, setCancel] = useState(false);
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const dis = !a.owner;

  const pick = (cycle: Cycle) => {
    if (dis || cycle === b.cycle) return;
    setB({ ...b, cycle, status: b.status === "canceling" ? "active" : b.status });
    say(t("switched", { plan: t(cycle) }));
  };
  const statusPill = b.status === "trial" ? <StatusPill tone="ok">{t("st.trial")}</StatusPill>
    : b.status === "active" ? <StatusPill tone="ok">{t("st.active")}</StatusPill>
    : <StatusPill tone="warn">{t("st.canceling")}</StatusPill>;
  const lowTexts = b.texts < 100;

  return (
    <div className="bill" data-testid="billing">
      {!a.owner && <div className="note">{t("ownerOnly")}</div>}
      <div className="bill-plans">
        {(["monthly", "yearly"] as const).map((c) => {
          const on = b.cycle === c;
          return (
            <section key={c} className={`card pad bill-plan${on ? " on" : ""}`} data-testid={`plan-${c}`}>
              <div className="bill-plan-h">
                <b>{on && <span className="bill-check" aria-hidden>✓</span>}{t(c)}</b>
                {on ? <span className="cap">{t("current")}</span> : c === "yearly" && <span className="tag jade">{t("save", { pct: Math.round((1 - PRICE.yearly / PRICE.monthly) * 100) })}</span>}
              </div>
              <div className="bill-price"><span className="num">{formatCents(PRICE[c]).replace(/\.00$/, "")}</span><span className="cap">{t(`per.${c}`)}</span></div>
              {on ? (
                <div className="group bill-facts">
                  <div className="row xs"><span className="g">{t("status")}</span>{statusPill}</div>
                  <div className="row xs"><span className="g">{b.status === "canceling" ? t("ends") : b.status === "trial" ? t("firstCharge") : t("renews")}</span><span className="num">{fmtDate(b.renews)} · {t("days", { n: daysTo(b.renews) })}</span></div>
                </div>
              ) : null}
              <ul className="bill-list">
                {(c === "monthly" ? ["staff", "all", "texts", "support"] : ["allMonthly", "yearTotal"]).map((k) => (
                  <li key={k}>{t(`f.${k}`, { total: formatCents(PRICE.yearly * 12) })}</li>
                ))}
              </ul>
              <div className="bill-plan-f">
                {on ? (b.status === "canceling"
                  ? <Button variant="primary" disabled={dis} onClick={() => { setB({ ...b, status: "active" }); say(t("resumed")); }}>{t("resume")}</Button>
                  : <Button disabled={dis} onClick={() => say(t("manageSoon"))}>{t("manage")}</Button>)
                  : <Button variant="ghost" disabled={dis} data-testid={`switch-${c}`} onClick={() => pick(c)}>{t("switchTo", { plan: t(c) })}</Button>}
              </div>
            </section>
          );
        })}
      </div>

      {b.status !== "canceling" && (
        <div className="bill-cancel">
          <Button size="sm" disabled={dis} data-testid="cancel-sub" onClick={() => setCancel(true)}>{t("cancel")}</Button>
          <span className="cap">{t("cancelNote")}</span>
        </div>
      )}

      <div className="eyebrow">{t("addOns")}</div>
      <section className="card pad">
        <div className="bill-addon">
          <div className="g"><b>{t("battery")}</b><span className="cap">{t("batteryNote", { n: TEXT_PACK.texts, price: formatCents(TEXT_PACK.cents) })}</span></div>
          <span className={`pill${lowTexts ? " warn" : ""}`} data-testid="text-balance">{t("left", { n: b.texts })}</span>
          <Button variant="primary" disabled={dis} data-testid="buy-texts" onClick={() => { setB({ ...b, texts: b.texts + TEXT_PACK.texts }); say(t("added", { n: TEXT_PACK.texts })); }}>{t("buy", { price: formatCents(TEXT_PACK.cents) })}</Button>
        </div>
        <label className="bill-refill cap">
          <input type="checkbox" checked={b.refill} disabled={dis} onChange={(e) => setB({ ...b, refill: e.target.checked })} /> {t("refill")}
        </label>
      </section>

      <div className="set-two">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("payWith")}</div>
          <div className="group">
            <div className="row s"><span className="g"><b>Visa ••4242</b><span className="cap">{t("expires", { d: "08/2028" })}</span></span><Button size="sm" disabled={dis} onClick={() => say(t("manageSoon"))}>{t("change")}</Button></div>
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("invoices")}</div>
          {b.status === "trial"
            ? <div className="card pad cap">{t("noInvoices")}</div>
            : <div className="set-table"><DataTable head={[t("date"), t("amount"), ""]} rows={[[fmtDate(plus(-1)), formatCents(b.cycle === "yearly" ? PRICE.yearly * 12 : PRICE.monthly), <span key="p" className="tag jade">{t("paid")}</span>]]} /></div>}
        </div>
      </div>

      <div className="demo">{t("demo")}</div>

      {cancel && (
        <Drawer title={t("cancelTitle")} onClose={() => setCancel(false)} footer={
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <Button block onClick={() => setCancel(false)}>{t("keep")}</Button>
            <Button block variant="primary" data-testid="confirm-cancel" onClick={() => { setB({ ...b, status: "canceling" }); setCancel(false); say(t("canceled", { d: fmtDate(b.renews) })); }}>{t("cancelYes")}</Button>
          </div>
        }>
          <p>{t("cancelBody", { d: fmtDate(b.renews) })}</p>
          <ul className="bill-list"><li>{t("keep1")}</li><li>{t("keep2")}</li><li>{t("keep3")}</li></ul>
        </Drawer>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
