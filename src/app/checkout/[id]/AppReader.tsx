"use client";
// Card on the small reader next to a handheld terminal (Stripe Reader M2), inside our Android app.
// `tap` = Tap to Pay on the phone itself (app 1.2+, certified Android phone): same steps, no reader.
// 1. The client picks a tip on this screen (the reader has no screen). 2. The server makes the payment.
// 3. The app's reader kit takes the card. 4. The server checks with Stripe and marks the ticket paid.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Chip } from "@/components/kit";
import { api } from "@/lib/api";
import { formatCents, parseDollars, percentOf } from "@/lib/money";
import { getActing, type Desk } from "@/lib/desk";
import { pullTickets, saveNow } from "@/lib/checkout/store";
import { ticketLabel, totals, type Ticket } from "@/lib/checkout/ticket";
import { setRealReader, stopCard, takeCard, wantsRealReader, type AppPay } from "@/lib/app/reader";

const $ = formatCents;
type Phase = "tip" | "starting" | "card" | "checking";

export function AppReaderPay({ desk, ticket, onBack, tap = false }: { desk: Desk; ticket: Ticket; onBack: () => void; tap?: boolean }) {
  const t = useTranslations("checkout");
  const tp = useTranslations("pay");
  const base = totals(ticket).toPay;
  const [pick, setPick] = useState<number | "none" | "custom">(20);
  const [custom, setCustom] = useState("");
  const [phase, setPhase] = useState<Phase>("tip");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [test, setTest] = useState(false);
  const [real, setReal] = useState(false);
  const pay = useRef<AppPay | null>(null);
  const alive = useRef(true);
  useEffect(() => { setReal(wantsRealReader(tap)); }, [tap]);
  useEffect(() => () => { alive.current = false; }, []);

  const tip = pick === "none" ? 0 : pick === "custom" ? parseDollars(custom) ?? 0 : percentOf(base, pick);
  const name = (id: string) => desk.staff.find((s) => s.id === id)?.name ?? "";
  const showPaid = () => pullTickets(desk.salonId, name, "", ticket.id);

  /** Ask the server until it has checked with Stripe (it records the payment once through). */
  const confirm = async (id: string) => {
    for (let i = 0; i < 30 && alive.current; i += 1) {
      const r = await api<{ status: string; error?: string }>(`/api/pay/status?id=${id}`).catch(() => null);
      if (r?.status === "paid") { await showPaid(); return; }
      if (r?.status === "failed" || r?.status === "canceled") throw new Error(r.error || t("appNotPaid"));
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    throw new Error(t("appSlow"));
  };

  /** Close this try on the server (cancels the payment in Stripe). True when it turned out to be paid. */
  const closeTry = async () => {
    const id = pay.current?.id;
    pay.current = null;
    if (!id) return false;
    const r = await api<{ status: string }>("/api/pay/cancel", { id }).catch(() => null);
    if (r?.status === "paid") { await showPaid(); return true; }
    return false;
  };

  const charge = async () => {
    setErr(""); setText(""); setPhase("starting");
    try {
      await saveNow({ ...ticket, tips: {} });
      const a = getActing();
      const p = await api<AppPay>("/api/pay/start", { ticketId: ticket.id, method: "app", tipCents: tip, by: a?.membership_id ?? desk.me.membership_id });
      pay.current = p;
      setTest(p.test);
      setPhase("card");
      await takeCard(p, (s) => { if (alive.current) setText(s); }, tap);
      setPhase("checking");
      await confirm(p.id);
    } catch (e) {
      const msg = (e as Error).message;
      if (await closeTry()) return; // the card went through after all
      if (!alive.current) return;
      setErr(msg === "canceled" ? "" : t("declined", { msg }));
      setPhase("tip");
    }
  };

  const cancel = async () => { await stopCard(); /* takeCard then fails with "canceled" → back to the tip step */ };
  const switchReader = async (useReal: boolean) => { setRealReader(useReal, tap); setReal(useReal); await stopCard(); };
  const kind = tap ? t("tapTitle") : t("appReader");

  const head = (amount: number) => (
    <div style={{ textAlign: "center" }}>
      <div className="cap">{t("ticket", { n: ticketLabel(ticket) })}{ticket.client?.name ? ` · ${ticket.client.name}` : ""}</div>
      <div className="money" style={{ fontSize: 56, lineHeight: "64px" }} data-testid="app-amount">{$(amount)}</div>
    </div>
  );

  if (phase !== "tip") return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "24px 16px", textAlign: "center" }}>
      {head(base + tip)}
      <div className="spin" />
      <b style={{ fontSize: 18 }} data-testid="app-reader-wait" aria-live="polite">{phase === "starting" ? (tap ? t("tapStarting") : t("appStarting")) : phase === "checking" ? t("appChecking") : text || (tap ? t("tapHold") : t("appTap"))}</b>
      <div className="cap">{kind} · {t("readerFee")}</div>
      {phase === "card" && test && <div className="demo" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", maxWidth: 420 }}>
        <span>{tap ? (real ? t("tapTestReal") : t("tapTestPractice")) : real ? t("appTestReal") : t("appTestPractice")}</span>
        <Button size="sm" onClick={() => void switchReader(!real)}>{tap ? (real ? t("tapUsePractice") : t("tapUseReal")) : real ? t("appUsePractice") : t("appUseReal")}</Button>
      </div>}
      {phase === "card" && <Button variant="ghost" onClick={() => void cancel()}>{t("cancelPay")}</Button>}
    </main>
  );

  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "24px 16px" }}>
      {head(base)}
      <div className="card pad" style={{ gap: 12, width: "100%", maxWidth: 520 }}>
        <b>{tp("addTip")}</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {[15, 20, 25].map((p) => (
            <Chip key={p} on={pick === p} onClick={() => setPick(p)} style={{ height: 56, flexDirection: "column", justifyContent: "center", borderRadius: 14, gap: 0 }}>
              <b>{p}%</b><span className="cap" style={{ color: "inherit" }}>{$(percentOf(base, p))}</span>
            </Chip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Chip on={pick === "none"} onClick={() => setPick("none")}>{tp("noTip")}</Chip>
          <Chip on={pick === "custom"} onClick={() => setPick("custom")}>{tp("custom")}</Chip>
          {pick === "custom" && <input className="inp" inputMode="decimal" placeholder="$0" aria-label={tp("custom")} style={{ height: 44, flex: 1 }} value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} />}
        </div>
        <div className="sep" />
        <div className="line" style={{ fontSize: 17, fontWeight: 600 }}><span>{tp("total")}</span><span data-testid="app-total">{$(base + tip)}</span></div>
      </div>
      {err && <div className="banner" role="alert" data-testid="app-error" style={{ background: "var(--orange-soft)", color: "#b5470a", maxWidth: 520 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="primary" data-testid="app-charge" onClick={() => void charge()}>{t("appCharge", { amount: $(base + tip) })}</Button>
        <Button onClick={onBack}>{t("back")}</Button>
      </div>
      <div className="cap">{kind} · {t("readerFee")}</div>
    </main>
  );
}
