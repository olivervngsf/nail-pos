"use client";
// Settings → Billing: the salon's PolishOS plan on Stripe Billing (our platform account). Monthly vs yearly cards,
// status + renewal, switch, cancel at period end / keep, Stripe's billing page for card + invoices.
// Text battery row = the salon text credit (src/lib/texting/credit.ts). Owner changes; manager reads. No Stripe (test version / not switched on) = sample plan kept on this device.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Banner, Button, DataTable, Drawer, StatusPill, Toast } from "@/components/kit";
import { api } from "@/lib/api";
import { formatCents } from "@/lib/money";
import { useStored } from "@/lib/useStored";
import { creditLevel, textsLeft, useCredit } from "@/lib/texting/credit";
import SettingsShell, { type Access } from "../SettingsShell";

type Cycle = "monthly" | "yearly";
type View = {
  status: string; cycle: Cycle | null; periodEnd: string | null; trialEnd: string | null; cancelAtPeriodEnd: boolean;
  card: { brand: string; last4: string; exp: string } | null;
  invoices: { id: string; date: string; cents: number; status: string; url: string | null }[];
  prices: Record<Cycle, number>; hadPlan: boolean; test?: boolean;
};
type Demo = { cycle: Cycle; status: "trialing" | "canceling"; renews: string };

const PRICE: Record<Cycle, number> = { monthly: 4900, yearly: 3900 };
const TEXT_PACK = { texts: 500, cents: 1000 }; // = text credit $10 (2¢ a text), same balance as Settings → Texting & credit
const LIVE = new Set(["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]);
const plus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString(); };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const daysTo = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5));
const dollars = (c: number) => formatCents(c).replace(/\.00$/, "");

export default function BillingPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.billing")}>{(a) => <BillingView a={a} />}</SettingsShell>;
}

function BillingView({ a }: { a: Access }) {
  const t = useTranslations("settings.bill");
  const [v, setV] = useState<View | null>(null);
  const [off, setOff] = useState(a.demo);
  const [demo, setDemo] = useStored<Demo>(`nailpos.billing.${a.salonId}`, () => ({ cycle: "monthly", status: "trialing", renews: plus(30) }));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [cancel, setCancel] = useState(false);
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const dis = !a.owner || !!busy;
  // Text battery = the salon's text credit (one balance, shared with the menu ring + Texting & credit).
  const { credit, add } = useCredit(a.demo ? undefined : a.salonId);
  const lowTexts = !!credit && creditLevel(credit) !== "good";

  const load = useCallback(async () => {
    if (a.demo) return;
    try {
      const r = await api<View & { on?: boolean }>("/api/billing", { salonId: a.salonId, action: "status" });
      if (r.on === false) setOff(true); else setV(r);
    } catch (e) { setErr((e as Error).message); }
  }, [a.demo, a.salonId]);
  useEffect(() => {
    void load();
    const q = new URLSearchParams(location.search).get("billing");
    if (q === "done") say(t("started"));
    if (q) history.replaceState(null, "", location.pathname);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // One shape for real + sample plan.
  const view: View | null = off
    ? { status: demo.status === "canceling" ? "trialing" : demo.status, cycle: demo.cycle, periodEnd: demo.renews, trialEnd: demo.renews, cancelAtPeriodEnd: demo.status === "canceling", card: { brand: "visa", last4: "4242", exp: "08/2028" }, invoices: [], prices: PRICE, hadPlan: true }
    : v;

  const act = async (action: "start" | "cycle" | "cancel" | "resume" | "portal", cycle?: Cycle) => {
    setErr("");
    if (off) {
      if (action === "cycle" && cycle) { setDemo({ ...demo, cycle, status: "trialing" }); say(t("switched", { plan: t(cycle) })); }
      else if (action === "cancel") { setDemo({ ...demo, status: "canceling" }); say(t("canceled", { d: fmtDate(demo.renews) })); }
      else if (action === "resume") { setDemo({ ...demo, status: "trialing" }); say(t("resumed")); }
      else say(t("manageSoon"));
      return;
    }
    setBusy(action + (cycle ?? ""));
    try {
      const r = await api<View & { url?: string }>("/api/billing", { salonId: a.salonId, action, cycle });
      if (r.url) { location.href = r.url; return; }
      setV(r);
      say(action === "cycle" ? t("switched", { plan: t(cycle!) }) : action === "cancel" ? t("canceled", { d: r.periodEnd ? fmtDate(r.periodEnd) : "" }) : t("resumed"));
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };

  if (!view) return <div className="bill">{err ? <p className="hint err">{err}</p> : <span className="cap" role="status">{t("loading")}</span>}</div>;

  const live = LIVE.has(view.status);
  const trial = view.status === "trialing";
  const ends = trial ? view.trialEnd : view.periodEnd;
  const pill = view.cancelAtPeriodEnd ? <StatusPill tone="warn">{t("st.canceling")}</StatusPill>
    : trial ? <StatusPill tone="ok">{t("st.trial")}</StatusPill>
    : view.status === "active" ? <StatusPill tone="ok">{t("st.active")}</StatusPill>
    : <StatusPill tone="warn">{t(`st.${view.status === "past_due" || view.status === "unpaid" ? "pastDue" : "other"}`)}</StatusPill>;

  return (
    <div className="bill" data-testid="billing">
      {!a.owner && <div className="note">{t("ownerOnly")}</div>}
      {(view.status === "past_due" || view.status === "unpaid") && (
        <Banner tone="bad" id="billing-late" keep="day" action={<Button size="sm" disabled={dis} onClick={() => void act("portal")}>{t("updateCard")}</Button>}>{t("pastDueNote")}</Banner>
      )}
      {!live && <p className="cap" style={{ margin: 0 }}>{view.hadPlan ? t("pickAgain") : t("pickFirst")}</p>}
      <div className="bill-plans">
        {(["monthly", "yearly"] as const).map((c) => {
          const on = live && view.cycle === c;
          return (
            <section key={c} className={`card pad bill-plan${on ? " on" : ""}`} data-testid={`plan-${c}`}>
              <div className="bill-plan-h">
                <b>{on && <span className="bill-check" aria-hidden>✓</span>}{t(c)}</b>
                {on ? <span className="cap">{t("current")}</span> : c === "yearly" && <span className="tag jade">{t("save", { pct: Math.round((1 - view.prices.yearly / view.prices.monthly) * 100) })}</span>}
              </div>
              <div className="bill-price"><span className="num">{dollars(view.prices[c])}</span><span className="cap">{t(`per.${c}`)}</span></div>
              {on && (
                <div className="group bill-facts">
                  <div className="row xs"><span className="g">{t("status")}</span>{pill}</div>
                  {ends && <div className="row xs"><span className="g">{view.cancelAtPeriodEnd ? t("ends") : trial ? t("firstCharge") : t("renews")}</span><span className="num">{fmtDate(ends)} · {t("days", { n: daysTo(ends) })}</span></div>}
                </div>
              )}
              <ul className="bill-list">
                {(c === "monthly" ? ["staff", "all", "texts", "support"] : ["allMonthly", "yearTotal"]).map((k) => (
                  <li key={k}>{t(`f.${k}`, { total: formatCents(view.prices.yearly * 12) })}</li>
                ))}
              </ul>
              <div className="bill-plan-f">
                {!live ? <Button variant={c === "monthly" ? "primary" : "default"} disabled={dis} data-testid={`start-${c}`} onClick={() => void act("start", c)}>{busy === `start${c}` ? t("opening") : view.hadPlan ? t("choose", { plan: t(c) }) : t("startTrial")}</Button>
                  : on ? (view.cancelAtPeriodEnd
                    ? <Button variant="primary" disabled={dis} onClick={() => void act("resume")}>{t("resume")}</Button>
                    : <Button disabled={dis} data-testid="manage" onClick={() => void act("portal")}>{busy === "portal" ? t("opening") : t("manage")}</Button>)
                  : <Button variant="ghost" disabled={dis} data-testid={`switch-${c}`} onClick={() => void act("cycle", c)}>{busy === `cycle${c}` ? t("saving") : t("switchTo", { plan: t(c) })}</Button>}
              </div>
            </section>
          );
        })}
      </div>

      {live && !view.cancelAtPeriodEnd && (
        <div className="bill-cancel">
          <Button size="sm" disabled={dis} data-testid="cancel-sub" onClick={() => setCancel(true)}>{t("cancel")}</Button>
          <span className="cap">{t("cancelNote")}</span>
        </div>
      )}

      <div className="eyebrow">{t("addOns")}</div>
      <section className="card pad">
        <div className="bill-addon">
          <div className="g"><b>{t("battery")}</b><span className="cap">{t("batteryNote", { n: TEXT_PACK.texts, price: formatCents(TEXT_PACK.cents) })}</span></div>
          <span className={`pill${lowTexts ? " warn" : ""}`} data-testid="text-balance">{credit ? `${t("left", { n: textsLeft(credit) })} · ${formatCents(credit.balanceCents)}` : "…"}</span>
          <Button variant="primary" disabled={dis || !credit} data-testid="buy-texts" onClick={() => { void add(TEXT_PACK.cents).then(() => say(t("added", { n: TEXT_PACK.texts }))).catch((e: Error) => say(e.message)); }}>{t("buy", { price: formatCents(TEXT_PACK.cents) })}</Button>
        </div>
        <Link className="cap" href="/settings/texting" data-testid="manage-credit">{t("manageCredit")}</Link>
      </section>

      <div className="set-two">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("payWith")}</div>
          <div className="group">
            {view.card
              ? <div className="row s"><span className="g"><b style={{ textTransform: "capitalize" }}>{view.card.brand} ••{view.card.last4}</b><span className="cap">{t("expires", { d: view.card.exp })}</span></span><Button size="sm" disabled={dis || !view.hadPlan} onClick={() => void act("portal")}>{t("change")}</Button></div>
              : <div className="row s"><span className="g cap">{t("noCard")}</span></div>}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("invoices")}</div>
          {view.invoices.length === 0
            ? <div className="card pad cap">{trial ? t("noInvoicesTrial") : t("noInvoices")}</div>
            : <div className="set-table"><DataTable head={[t("date"), t("amount"), ""]} rows={view.invoices.map((i) => [
                fmtDate(i.date), formatCents(i.cents),
                i.url ? <a key="u" href={i.url} target="_blank" rel="noreferrer" className={`tag${i.status === "paid" ? " jade" : ""}`}>{t(`inv.${i.status === "paid" ? "paid" : i.status === "open" ? "open" : "other"}`)} ↗</a>
                  : <span key="s" className="tag">{t(`inv.${i.status === "paid" ? "paid" : "other"}`)}</span>,
              ])} /></div>}
        </div>
      </div>

      {off ? <div className="demo">{t("demo")}</div> : view.test && <div className="demo">{t("testMode")}</div>}
      {err && <p className="hint err">{err}</p>}

      {cancel && ends && (
        <Drawer title={t("cancelTitle")} onClose={() => setCancel(false)} footer={
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <Button block onClick={() => setCancel(false)}>{t("keep")}</Button>
            <Button block variant="primary" data-testid="confirm-cancel" onClick={() => { setCancel(false); void act("cancel"); }}>{t("cancelYes")}</Button>
          </div>
        }>
          <p>{t("cancelBody", { d: fmtDate(view.periodEnd ?? ends) })}</p>
          <ul className="bill-list"><li>{t("keep1")}</li><li>{t("keep2")}</li><li>{t("keep3")}</li></ul>
        </Drawer>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
