"use client";
// Close day (Main Screens · CloseDay Z1–Z5): 1 open tickets → 2 count the cash drawer → 3 card money checked with Stripe →
// 4 tips per staff → 5 closed. Every number comes from the server (day_summary); closing saves a locked record (close_day).
// Front desk can fill it in; finishing needs an owner/manager (own login) or a manager PIN on the salon device.
import { pinLenFor } from "@/lib/pin";
import { canOk, useRolePerms } from "@/lib/roles";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Button, Drawer, Field, LeftMenu, ListGroup, OfflineBanner, PinKeypad, SyncPill, Toast, TopBar } from "@/components/kit";
import { pinMessage, rpc, type PinResult } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatCents, parseDollars } from "@/lib/money";
import { useDesk } from "@/lib/desk";
import { BILLS, countCents, demoDay, isoDay, nums, type Counts, type DaySummary } from "@/lib/closeday";

const $ = formatCents;
const STEPS = ["open", "count", "card", "tips", "done"] as const;
type Step = (typeof STEPS)[number];
type StripeCheck = { checked: boolean; reason?: string; stripeCount?: number; stripeCents?: number; recordedCents?: number; matches?: boolean; missing?: string[] };
const REASONS = ["reasonChange", "reasonNotSure", "reasonCountAgain"] as const;

function clean(d: DaySummary): DaySummary {
  return { ...d, sales: nums(d.sales), paid: nums(d.paid), refunds: nums(d.refunds), cash: nums(d.cash), card_cents: Number(d.card_cents),
    unmatched_cents: Number(d.unmatched_cents), tips: d.tips.map(nums), open: d.open.map(nums), closed: d.closed ? nums(d.closed) : null };
}

export default function CloseDay() {
  const t = useTranslations("closeDay");
  const f = useFormatter();
  const params = useSearchParams();
  const day = params.get("d") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("d")!) ? params.get("d")! : isoDay();
  const { desk, err } = useDesk();
  const perms = useRolePerms(desk?.salonId, desk?.mode === "demo");
  const [sum, setSum] = useState<DaySummary | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [step, setStep] = useState<Step>("open");
  const [left, setLeft] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Counts>({});
  const [coins, setCoins] = useState("");
  const [reason, setReason] = useState("");
  const [removed, setRemoved] = useState("");
  const [stripe, setStripe] = useState<StripeCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [pin, setPin] = useState<null | { approver: string | null; err: string }>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ diff: number; tomorrow: number } | null>(null);
  const [toast, setToast] = useState("");
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (!desk) return;
    setLoadErr("");
    if (desk.mode === "demo") { setSum(demoDay(day)); return; }
    try {
      const s = clean(await rpc<DaySummary>("day_summary", { p_salon: desk.salonId, p_day: day }));
      setSum(s);
      if (s.closed) setStep("done");
    } catch (e) { setLoadErr(navigator.onLine ? (e as Error).message : t("needNet")); }
  }, [desk, day, t]);
  useEffect(() => { void load(); }, [load]);

  const counted = countCents(counts, parseDollars(coins) ?? 0);
  const expected = sum?.cash.expected_cents ?? 0;
  const diff = counted - expected;
  const allResolved = useMemo(() => (sum?.open ?? []).every((o) => left[o.id]), [sum, left]);
  const idx = STEPS.indexOf(step);
  const admins = (desk?.staff ?? []).filter((s) => canOk(perms, s.role, "close"));
  const ownLoginAdmin = !!desk && !desk.device && canOk(perms, desk.me.role, "close");

  if (err) return <main className="pad"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;
  const demo = desk.mode === "demo";
  const dayLabel = f.dateTime(new Date(`${day}T12:00:00`), { weekday: "short", month: "short", day: "numeric" });

  const finish = async (approvalId?: string) => {
    if (!sum) return;
    setBusy(true);
    try {
      if (demo) { setDone({ diff, tomorrow: counted - (parseDollars(removed) ?? 0) }); setStep("done"); return; }
      const r = await rpc<{ diff_cents: number; tomorrow_start_cents: number }>("close_day", { p: {
        salonId: desk.salonId, day, counts, coinsCents: parseDollars(coins) ?? 0, diffReason: reason, cashRemovedCents: parseDollars(removed) ?? 0,
        cardStripeCents: stripe?.checked ? stripe.stripeCents : null, approvalId,
        leftOpen: Object.entries(left).map(([id, why]) => ({ id, reason: why })) } });
      setDone({ diff: Number(r.diff_cents), tomorrow: Number(r.tomorrow_start_cents) });
      setStep("done");
      await load();
    } catch (e) { say((e as Error).message); } finally { setBusy(false); setPin(null); }
  };
  const askClose = () => {
    if (demo) return void finish();
    // Owner / manager on their own login: their OK is one tap (the server still records who gave it).
    if (ownLoginAdmin) return void (async () => {
      try {
        const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", { p_salon: desk.salonId, p_purpose: "close" });
        if (!r.ok) return say(t("notManager"));
        await finish(r.approval_id);
      } catch (e) { say((e as Error).message); }
    })();
    setPin({ approver: admins.length === 1 ? admins[0].id : null, err: "" });
  };
  const checkPin = async (code: string) => {
    if (!pin?.approver || !desk.device) return;
    try {
      const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", { p_salon: desk.salonId, p_device: desk.device.id, p_membership: pin.approver, p_pin: code, p_purpose: "close" });
      if (!r.ok) return setPin({ ...pin, err: (r.reason as string) === "not_manager" ? t("notManager") : pinMessage(r) });
      await finish(r.approval_id);
    } catch (e) { setPin({ ...pin, err: (e as Error).message }); }
  };
  const checkStripe = async () => {
    setChecking(true);
    try {
      if (demo) setStripe({ checked: true, stripeCount: sum!.paid.card_count, stripeCents: sum!.paid.card_cents, recordedCents: sum!.paid.card_cents, matches: true, missing: [] });
      else setStripe(await api<StripeCheck>("/api/close/stripe", { salonId: desk.salonId, day }));
    } catch (e) { setStripe({ checked: false, reason: (e as Error).message }); } finally { setChecking(false); }
  };

  const stepNames = [t("stepOpen"), t("stepCount"), t("stepCard"), t("stepTips"), t("stepClose")];
  const closed = sum?.closed;

  return (
    <div className="app cd-app">
      <LeftMenu active="Close day" salonInitials={desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={desk.me.display_name[0]} />
      <div className="col">
        <TopBar title={t("title")} fact={dayLabel}>
          {step !== "done" && !closed && <span className="cap bar-step" data-testid="bar-step">{t("stepOf", { n: idx + 1, total: STEPS.length })}</span>}
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        {demo && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        {loadErr && <p className="hint err" style={{ margin: "12px 24px 0" }}>{loadErr} <Button size="sm" onClick={() => void load()}>{t("retry")}</Button></p>}
        {!sum ? <main className="cd-main" aria-busy="true" /> : (
          <main className="cd-main">
            <aside className="cd-steps">
              {stepNames.map((label, i) => (
                <button key={label} type="button" className={`stp${i === idx ? " on" : i < idx ? " done" : ""}`} disabled={i > idx || !!closed} onClick={() => setStep(STEPS[i])}>
                  <span className="n">{i < idx ? "✓" : i + 1}</span>{label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <div className="cap">{t("stepsNote")}</div>
              <Link className="btn ghost sm" href="/payouts">{t("payoutLink")}</Link>
            </aside>

            <section className="card cd-body">
              {step === "open" && (
                <div className="fade cd-col" data-testid="cd-open">
                  <div className="h2">1 · {t("openTitle")}</div>
                  <div className="cap" style={{ fontSize: 14, marginTop: -6 }}>{t("openSub")}</div>
                  {sum.open.length === 0 ? <div className="note">{t("noOpen")}</div> : (
                    <ListGroup style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
                      {sum.open.map((o) => (
                        <div className="row cd-open-row" key={o.id} style={{ minHeight: 58, flexWrap: "wrap", rowGap: 8 }}>
                          <Avatar name={o.client || "#"} />
                          <span className="grow"><b>{o.client || t("walkIn")} · #{o.number}</b><span className="cap" style={{ display: "block" }}>{[o.services, o.staff].filter(Boolean).join(" · ")}</span></span>
                          <b className="num" style={{ marginRight: 8 }}>{$(o.total_cents)}</b>
                          {left[o.id] ? <span className="tag jade fade">{t("leftOpen", { reason: left[o.id] })}</span> : <>
                            <Link className="btn primary sm" href={`/checkout/${o.id}`}>{t("takePayment")}</Link>
                            <Button size="sm" data-testid={`leave-${o.number}`} onClick={() => setLeft({ ...left, [o.id]: t("paysTomorrow") })}>{t("leaveOpen")}</Button>
                          </>}
                        </div>
                      ))}
                    </ListGroup>
                  )}
                  <div style={{ flex: 1 }} />
                  <Button variant="primary" data-testid="cd-next-count" disabled={!allResolved} onClick={() => setStep("count")}>{t("nextCount")}</Button>
                </div>
              )}

              {step === "count" && (
                <div className="fade cd-split" data-testid="cd-count">
                  <div className="cd-col" style={{ flex: 1, minWidth: 0 }}>
                    <div className="h2">2 · {t("countTitle")}</div>
                    <ListGroup style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
                      {BILLS.map((b) => {
                        const q = counts[b] ?? 0;
                        const setQ = (n: number) => setCounts({ ...counts, [b]: Math.max(0, n) });
                        return (
                          <div className="den" key={b}>
                            <span style={{ width: 60, fontWeight: 600 }}>${b}</span>
                            <button className="mini" type="button" aria-label={t("less", { bill: `$${b}` })} onClick={() => setQ(q - 1)}>−</button>
                            <input className="qty num" inputMode="numeric" aria-label={t("billCount", { bill: `$${b}` })} value={q || ""} placeholder="0"
                              onChange={(e) => setQ(parseInt(e.target.value.replace(/\D/g, "") || "0", 10))} />
                            <button className="mini" type="button" aria-label={t("more", { bill: `$${b}` })} onClick={() => setQ(q + 1)}>+</button>
                            <span className="grow" /><span className="num">{$(q * b * 100)}</span>
                          </div>
                        );
                      })}
                      <div className="den"><span style={{ width: 60, fontWeight: 600 }}>{t("coins")}</span>
                        <input className="qty num" style={{ width: 110 }} inputMode="decimal" aria-label={t("coins")} placeholder="$0.00" value={coins} onChange={(e) => setCoins(e.target.value)} /></div>
                    </ListGroup>
                  </div>
                  <div className="cd-col" style={{ width: 280 }}>
                    <div className="card cd-calc">
                      <div className="line"><span>{t("startCash")}</span><span>{$(sum.cash.start_cents)}</span></div>
                      <div className="line"><span>{t("cashTaken")}</span><span>{$(sum.cash.taken_cents)}</span></div>
                      <div className="line"><span>{t("cashRefunded")}</span><span>−{$(sum.cash.refunded_cents)}</span></div>
                      <div className="sep" />
                      <div className="line" style={{ fontWeight: 600 }}><span>{t("shouldBe")}</span><span data-testid="cd-expected">{$(expected)}</span></div>
                      <div className="line" style={{ fontWeight: 600 }}><span>{t("youCounted")}</span><span data-testid="cd-counted">{$(counted)}</span></div>
                    </div>
                    <div className="card fade cd-diff" data-testid="cd-diff" data-match={diff === 0} style={{ background: diff === 0 ? "#EAF5EC" : "#FDEEE6" }}>
                      <b style={{ fontSize: 16 }}>{diff === 0 ? t("matches") : diff < 0 ? t("short", { amount: $(-diff) }) : t("over", { amount: $(diff) })}</b>
                      <span className="cap" style={{ display: "block", fontSize: 13 }}>{diff === 0 ? t("nothingToExplain") : t("diffSaved")}</span>
                    </div>
                    {diff !== 0 && <div className="fade" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className="cap" style={{ width: "100%" }}>{t("reasonLabel")}</span>
                      {REASONS.map((r) => <button key={r} type="button" className={`chip${reason === t(r) ? " on" : ""}`} onClick={() => { setReason(t(r)); if (r === "reasonCountAgain") { setCounts({}); setCoins(""); } }}>{t(r)}</button>)}
                    </div>}
                    <Field id="cd-removed" label={t("takeOut")} hint={t("takeOutHint", { amount: $(Math.max(0, counted - (parseDollars(removed) ?? 0))) })} inputMode="decimal" placeholder="$0.00" value={removed} onChange={(e) => setRemoved(e.target.value)} />
                    <div style={{ flex: 1 }} />
                    <Button variant="primary" block data-testid="cd-next-card" onClick={() => setStep("card")}>{t("nextCard")}</Button>
                  </div>
                </div>
              )}

              {step === "card" && (
                <div className="fade cd-col" data-testid="cd-card">
                  <div className="h2">3 · {t("cardTitle")}</div>
                  <ListGroup style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
                    <div className="row"><span className="grow">{t("cardOnTickets")}</span><b className="num">{sum.paid.card_count} · {$(sum.paid.card_cents)}</b></div>
                    <div className="row"><span className="grow">{t("cardStripe")}</span>
                      {stripe?.checked ? <><b className="num">{stripe.stripeCount} · {$(stripe.stripeCents ?? 0)}</b>
                        {stripe.matches ? <span className="tag jade">✓ {t("cardMatches")}</span> : <span className="tag warn-tag">{t("cardOff")}</span>}</>
                        : <Button size="sm" data-testid="cd-check-stripe" disabled={checking} onClick={() => void checkStripe()}>{checking ? t("checking") : t("checkStripe")}</Button>}
                    </div>
                    {stripe && !stripe.checked && <div className="row"><span className="cap">{stripe.reason}</span></div>}
                    {!!stripe?.missing?.length && <div className="row cd-warn"><span className="grow">{t("cardMissing", { count: stripe.missing.length })}</span></div>}
                    <div className="row"><span className="grow">{t("cardFees")}</span><b className="num">−{$(sum.paid.fee_cents)}</b></div>
                    <div className="row"><span className="grow">{t("refunds")}</span><b className="num">{$(sum.refunds.cents)} · {sum.refunds.count}</b></div>
                    {sum.paid.extra_count > 0 && <div className="row cd-warn"><span className="grow">{t("extra", { count: sum.paid.extra_count })}</span><b className="num">{$(sum.paid.extra_cents)}</b></div>}
                    {sum.unmatched_cents !== 0 && <div className="row cd-warn"><span className="grow">{t("unmatched")}</span><b className="num">{$(sum.unmatched_cents)}</b></div>}
                    <div className="row" style={{ fontWeight: 600 }}><span className="grow">{t("toBank")}</span><b className="num">{$(sum.paid.card_cents - sum.paid.fee_cents - sum.refunds.card_cents)}</b></div>
                  </ListGroup>
                  <div className="cap">{t("cardNote")}</div>
                  <div style={{ flex: 1 }} />
                  <Button variant="primary" data-testid="cd-next-tips" onClick={() => setStep("tips")}>{t("nextTips")}</Button>
                </div>
              )}

              {step === "tips" && (
                <div className="fade cd-col" data-testid="cd-tips">
                  <div className="h2">4 · {t("tipsTitle")}</div>
                  <table className="cd-table">
                    <thead><tr><th>{t("staff")}</th><th>{t("cardTips")}</th><th>{t("cashTips")}</th><th>{t("feeOnTips")}</th><th>{t("totalTips")}</th></tr></thead>
                    <tbody>{sum.tips.length === 0 ? <tr><td colSpan={5} className="cap">{t("noTips")}</td></tr> : sum.tips.map((r) => (
                      <tr key={r.id}><td>{r.name}</td><td>{$(r.card_cents)}</td><td>{$(r.cash_cents)}</td><td>{$(r.fee_cents)}</td><td><b>{$(r.total_cents)}</b></td></tr>
                    ))}</tbody>
                  </table>
                  <div className="cap">{t("tipsNote")}</div>
                  <div style={{ flex: 1 }} />
                  <Button variant="primary" data-testid="cd-finish" disabled={busy} onClick={askClose}>{ownLoginAdmin || demo ? t("closeNow") : t("closeWithPin")}</Button>
                </div>
              )}

              {step === "done" && (
                <div className="fade cd-done" data-testid="cd-done">
                  <div className="pop cd-check">✓</div>
                  <div className="h1" style={{ fontSize: 30 }}>{t("closedTitle")}</div>
                  <div className="cap" style={{ fontSize: 15 }}>
                    {closed ? t("closedAt", { time: f.dateTime(new Date(closed.closed_at), { hour: "numeric", minute: "2-digit" }) }) : t("closedSaved")}
                  </div>
                  {(done || closed) && <div className="cap" style={{ fontSize: 15 }} data-testid="cd-done-cash">
                    {(() => { const d = done ? done.diff : closed!.cash_counted_cents - closed!.cash_expected_cents;
                      return d === 0 ? t("drawerMatched") : d < 0 ? t("short", { amount: $(-d) }) : t("over", { amount: $(d) }); })()}
                    {" · "}{t("tomorrowStarts", { amount: $(done ? done.tomorrow : closed!.cash_counted_cents - closed!.cash_removed_cents) })}
                  </div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
                    <Button onClick={() => window.print()}>{t("printReport")}</Button>
                    <Link className="btn" href="/payouts">{t("openPayouts")}</Link>
                    {closed && (desk.me.role === "owner" || desk.me.role === "manager") && <Button variant="ghost" onClick={() => { setStep("open"); setSum({ ...sum, closed: null }); }}>{t("closeAgain")}</Button>}
                  </div>
                </div>
              )}
            </section>

            <aside className="card cd-money" aria-label={t("moneyToday")}>
              <b style={{ fontSize: 16 }}>{t("moneyToday")}</b>
              <div className="line"><span>{t("services")}</span><span>{$(sum.sales.services_cents)}</span></div>
              <div className="line"><span>{t("discounts")}</span><span>−{$(sum.sales.discount_cents)}</span></div>
              <div className="line"><span>{t("giftSold")}</span><span>{$(sum.sales.gift_sold_cents)}</span></div>
              <div className="line"><span>{t("tips")}</span><span>{$(sum.sales.tips_cents)}</span></div>
              <div className="sep" />
              <div className="eyebrow" style={{ marginTop: 4 }}>{t("paidBy")}</div>
              <div className="line"><span>{t("card")} ({sum.paid.card_count})</span><span>{$(sum.paid.card_cents)}</span></div>
              <div className="line"><span>{t("cash")} ({sum.paid.cash_count})</span><span>{$(sum.paid.cash_cents)}</span></div>
              <div className="line"><span>{t("giftCard")}</span><span>{$(sum.paid.gift_cents)}</span></div>
              {sum.refunds.count > 0 && <div className="line"><span>{t("refunds")}</span><span>−{$(sum.refunds.cents)}</span></div>}
              <div className="sep" />
              <div className="line"><span>{t("cardFees")}</span><span>−{$(sum.paid.fee_cents)}</span></div>
              <div className="line" style={{ fontWeight: 600 }}><span>{t("toBankShort")}</span><span>{$(sum.paid.card_cents - sum.paid.fee_cents - sum.refunds.card_cents)}</span></div>
              <div className="cap" data-testid="cd-unmatched">{sum.unmatched_cents === 0 ? t("allMatch") : t("unmatched")}</div>
            </aside>
          </main>
        )}
      </div>

      {pin && (
        <Drawer title={t("closeWithPin")} onClose={() => setPin(null)}>
          {!pin.approver ? <ListGroup>{admins.map((m) => <button key={m.id} type="button" className="opt" onClick={() => setPin({ approver: m.id, err: "" })}><Avatar name={m.name} />{m.name}</button>)}</ListGroup>
            : <PinKeypad length={pinLenFor(pin.approver)} error={pin.err} onDone={(c) => void checkPin(c)} />}
        </Drawer>
      )}

      {sum && (
        <div className="receipt-print" aria-hidden>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 16 }}>{desk.salonName}</div>
          <div style={{ textAlign: "center" }}>{t("title")} · {dayLabel}</div>
          <hr />
          <div className="rl"><span>{t("services")}</span><span>{$(sum.sales.services_cents)}</span></div>
          <div className="rl"><span>{t("discounts")}</span><span>−{$(sum.sales.discount_cents)}</span></div>
          <div className="rl"><span>{t("giftSold")}</span><span>{$(sum.sales.gift_sold_cents)}</span></div>
          <div className="rl"><span>{t("tips")}</span><span>{$(sum.sales.tips_cents)}</span></div>
          <hr />
          <div className="rl"><span>{t("card")} ({sum.paid.card_count})</span><span>{$(sum.paid.card_cents)}</span></div>
          <div className="rl"><span>{t("cash")} ({sum.paid.cash_count})</span><span>{$(sum.paid.cash_cents)}</span></div>
          <div className="rl"><span>{t("giftCard")}</span><span>{$(sum.paid.gift_cents)}</span></div>
          <div className="rl"><span>{t("refunds")}</span><span>−{$(sum.refunds.cents)}</span></div>
          <div className="rl"><span>{t("cardFees")}</span><span>−{$(sum.paid.fee_cents)}</span></div>
          <hr />
          <div className="rl"><span>{t("shouldBe")}</span><span>{$(closed?.cash_expected_cents ?? expected)}</span></div>
          <div className="rl"><span>{t("youCounted")}</span><span>{$(closed?.cash_counted_cents ?? counted)}</span></div>
          <hr />
          {sum.tips.map((r) => <div className="rl" key={r.id}><span>{r.name} · {t("tips")}</span><span>{$(r.total_cents)}</span></div>)}
        </div>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
