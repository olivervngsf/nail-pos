"use client";
// Client pays on their own phone (Checkout board An1–An4): pick a tip, then Stripe's secure pay page. No sign-in.
// Two layouts, picked by the owner in Settings → Payments (board "Client Pay Page · 3 options", A + C):
//   Receipt   = bill first (services + who did them), then the tip, then the total.
//   Quick pay = everything in one card; with two techs the client can share the tip by service or evenly.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Segmented } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { formatCents, parseDollars, percentOf } from "@/lib/money";
import { asLayout, techNames, tipShares, type PayLayout, type PayLine, type PayTech, type TipSplit } from "@/lib/checkout/paypage";

type Info = {
  salon: string; number: number; amountCents: number; tipCents: number | null; status: "pending" | "paid" | "failed" | "canceled";
  layout?: PayLayout; lines?: PayLine[]; techs?: PayTech[];
};
type Pick = number | "none" | "custom";
type T = ReturnType<typeof useTranslations>;

const PCTS = [15, 20, 25];
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

export default function ClientPay({ id, demo }: { id: string; demo?: Info }) {
  const t = useTranslations("pay");
  const done = useSearchParams().get("done") === "1";
  const [info, setInfo] = useState<Info | null>(demo ?? null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<Pick>(20);
  const [custom, setCustom] = useState("");
  const [split, setSplit] = useState<TipSplit>("service");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
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
  }, [id, done, t, demo]);

  const base = info?.amountCents ?? 0;
  const tip = pick === "none" ? 0 : pick === "custom" ? parseDollars(custom) ?? 0 : percentOf(base, pick);
  const pay = async () => {
    if (demo) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/pay/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, tipCents: tip, tipSplit: split }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) { location.href = d.url; return; }
    setErr(d.error ?? t("invalid")); setBusy(false);
  };

  const layout = asLayout(info?.layout);
  const techs = info?.techs ?? [];
  const lines = info?.lines ?? [];
  // The pay request can be less than the services (discount, gift card, part already paid) or more (other items).
  const adjust = lines.length ? base - lines.reduce((a, l) => a + l.cents, 0) : 0;
  const names = techNames(techs, t("and"));
  const who = names ?? (techs.length > 1 ? t("yourTechs") : t("yourTech"));
  const useSplit: TipSplit = layout === "quick" ? split : "service";
  const shares = techs.length > 1 && tip > 0 ? tipShares(tip, techs.map((x) => x.cents), useSplit) : [];
  const p: Parts = { t, info: info!, base, tip, pick, setPick, custom, setCustom, lines, techs, adjust, who, shares, split, setSplit };

  return (
    <main className="phone" style={{ background: "var(--surface)" }} data-layout={layout}>
      <div className="pbody" style={{ gap: 14, paddingTop: 16 }}>
        {err && !info ? <div className="card pad"><b>{err}</b></div>
          : !info ? <div className="cap">{t("loading")}</div>
          : info.status === "paid" ? (
            <div className="card pad" style={{ alignItems: "center", textAlign: "center", gap: 12, padding: 28, marginTop: 16 }} data-testid="client-paid">
              <div className="okmark lg pop">✓</div>
              <h1 className="h2">{t("paid")}</h1>
              <div className="money">{formatCents(base + (info.tipCents ?? 0))}</div>
              <div className="cap">{info.salon} · {t("ticket", { n: info.number })}</div>
              <div className="cap">{t("paidSub")}</div>
            </div>)
          : info.status !== "pending" ? <div className="card pad"><b>{t("cancelled")}</b></div>
          : <>
            {demo && <div className="demo">{t("previewNote")}</div>}
            {layout === "quick" ? <Quick {...p} /> : <Receipt {...p} />}
            {err && <div className="hint err">{err}</div>}
            <Button variant="primary" block disabled={busy} data-testid="client-pay" style={{ height: 52, fontSize: 17, borderRadius: 14 }} onClick={() => void pay()}>{t("payNow", { amount: formatCents(base + tip) })}</Button>
            <div className="cap" style={{ textAlign: "center" }}>{t("secure")}</div>
          </>}
      </div>
    </main>
  );
}

type Parts = {
  t: T; info: Info; base: number; tip: number; pick: Pick; setPick: (p: Pick) => void; custom: string; setCustom: (s: string) => void;
  lines: PayLine[]; techs: PayTech[]; adjust: number; who: string; shares: number[]; split: TipSplit; setSplit: (s: TipSplit) => void;
};

/** EN / VI for this phone only. */
function Lang() {
  const { lang, setLang } = useLang();
  return <span className="payseg"><Segmented label="Language" value={lang} onChange={setLang} options={[{ value: "en", label: "EN" }, { value: "vi", label: "VI" }]} /></span>;
}

/** A tip choice: big, same size for every choice, dark when picked. */
function TipBtn({ on, onClick, height, children, testid }: { on: boolean; onClick: () => void; height: number; children: React.ReactNode; testid?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} data-testid={testid} className="paytip"
      style={{ height, borderRadius: 14, border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`, background: on ? "var(--ink)" : "var(--paper)", color: on ? "#fff" : "var(--ink)",
        font: "inherit", fontSize: 16, cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, minWidth: 0 }}>
      {children}
    </button>
  );
}

function CustomTip({ t, custom, setCustom }: Pick_<Parts, "t" | "custom" | "setCustom">) {
  return <input className="inp" inputMode="decimal" autoFocus placeholder="$0.00" aria-label={t("customAmount")} data-testid="tip-custom" style={{ height: 48, fontSize: 17 }}
    value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} />;
}
type Pick_<O, K extends keyof O> = { [P in K]: O[P] };

/** "Kim $4.40 · Vy $9.60": what each tech gets from one tip. */
function Shares({ techs, shares, t }: Pick_<Parts, "techs" | "shares" | "t">) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(techs.length, 3)}, minmax(0, 1fr))`, gap: 8 }} data-testid="tip-shares">
      {techs.map((x, i) => (
        <div key={i} style={{ background: "var(--surface)", borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
          <span className="cap" style={{ display: "block" }}>{x.name ? t("gets", { name: x.name }) : t("techN", { n: i + 1 })}</span>
          <b className="num">{formatCents(shares[i] ?? 0)}</b>
        </div>
      ))}
    </div>
  );
}

/** A · Receipt: bill first, then tip, then total. */
function Receipt({ t, info, base, tip, pick, setPick, custom, setCustom, lines, techs, adjust, who, shares }: Parts) {
  return <>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <b style={{ flex: 1, minWidth: 0, fontSize: 17 }}>{info.salon}</b>
      <Lang />
    </div>
    <div style={{ textAlign: "center" }}>
      <div className="cap">{t("ticket", { n: info.number })} · {t("toPay")}</div>
      <div className="money" style={{ fontSize: 46, lineHeight: "54px" }} data-testid="pay-total">{formatCents(base + tip)}</div>
    </div>
    {lines.length > 0 && (
      <div className="card pad" style={{ gap: 10 }} data-testid="pay-visit">
        <span className="eyebrow">{t("visit")}</span>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block" }}>{l.name}</b>{l.tech && <span className="cap">{t("withTech", { name: l.tech })}</span>}</div>
            <b className="num">{formatCents(l.cents)}</b>
          </div>
        ))}
        {adjust !== 0 && <><div className="sep" /><div className="line"><span className="cap">{adjust < 0 ? t("less") : t("other")}</span><span>{formatCents(adjust)}</span></div></>}
      </div>
    )}
    <div className="card pad" style={{ gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {techs.length > 0 && <span style={{ display: "flex", flex: "none" }}>
          {techs.slice(0, 3).map((x, i) => <span key={i} className="av" style={{ width: 40, height: 40, fontSize: 15, marginLeft: i ? -10 : 0, boxShadow: "0 0 0 2px #fff" }} aria-hidden>{initials(x.name)}</span>)}
        </span>}
        <div style={{ minWidth: 0 }}><b style={{ display: "block", fontSize: 17 }}>{t("tipFor", { who })}</b><span className="cap">{cap1(t("goesTo", { who }))}</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {PCTS.map((v) => (
          <TipBtn key={v} on={pick === v} onClick={() => setPick(v)} height={68} testid={`tip-${v}`}><b>{v}%</b><span className="num" style={{ fontSize: 14 }}>{formatCents(percentOf(base, v))}</span></TipBtn>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <TipBtn on={pick === "none"} onClick={() => setPick("none")} height={48} testid="tip-none"><b>{t("noTip")}</b></TipBtn>
        <TipBtn on={pick === "custom"} onClick={() => setPick("custom")} height={48} testid="tip-other"><b>{t("otherAmount")}</b></TipBtn>
      </div>
      {pick === "custom" && <CustomTip t={t} custom={custom} setCustom={setCustom} />}
      {shares.length > 0 && <><span className="cap">{t("sharedByService")}</span><Shares techs={techs} shares={shares} t={t} /></>}
    </div>
    <div className="card pad" style={{ gap: 8 }}>
      <div className="line"><span>{t("visit")}</span><span>{formatCents(base)}</span></div>
      <div className="line"><span>{t("tip")}{typeof pick === "number" ? ` (${pick}%)` : ""}</span><span data-testid="pay-tip">{formatCents(tip)}</span></div>
      <div className="sep" />
      <div className="line" style={{ fontSize: 17, fontWeight: 600 }}><span>{t("total")}</span><span>{formatCents(base + tip)}</span></div>
    </div>
  </>;
}

/** C · Quick pay: everything in one card. */
function Quick({ t, info, base, tip, pick, setPick, custom, setCustom, lines, techs, adjust, who, shares, split, setSplit }: Parts) {
  return <>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}><h1 className="h2" style={{ margin: 0 }}>{t("title", { salon: info.salon })}</h1><div className="cap">{t("ticket", { n: info.number })}</div></div>
      <Lang />
    </div>
    <div className="card pad" style={{ gap: 14, padding: 18 }}>
      {lines.length > 0 && <>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="pay-visit">
          {lines.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="av" style={{ width: 40, height: 40, fontSize: 15 }} aria-hidden>{initials(l.tech ?? "")}</span>
              <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block" }}>{l.name}</b>{l.tech && <span className="cap">{t("techIs", { name: l.tech })}</span>}</div>
              <b className="num">{formatCents(l.cents)}</b>
            </div>
          ))}
          {adjust !== 0 && <div className="line"><span className="cap">{adjust < 0 ? t("less") : t("other")}</span><span>{formatCents(adjust)}</span></div>}
        </div>
        <div className="sep" />
      </>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b>{t("tipForShort", { who })}</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
          <TipBtn on={pick === "none"} onClick={() => setPick("none")} height={52} testid="tip-none"><b style={{ fontSize: 15 }}>{t("none")}</b></TipBtn>
          {PCTS.map((v) => <TipBtn key={v} on={pick === v} onClick={() => setPick(v)} height={52} testid={`tip-${v}`}><b style={{ fontSize: 15 }}>{v}%</b></TipBtn>)}
          <TipBtn on={pick === "custom"} onClick={() => setPick("custom")} height={52} testid="tip-other"><b style={{ fontSize: 15 }}>{t("custom")}</b></TipBtn>
        </div>
        {pick === "custom" && <CustomTip t={t} custom={custom} setCustom={setCustom} />}
        <div className="cap">{tip > 0 ? `${typeof pick === "number" ? `${pick}% = ` : ""}${formatCents(tip)} · ${t("goesTo", { who })}` : t("noTipAdded")}</div>
        {shares.length > 0 && <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="cap" style={{ flex: 1, minWidth: 120 }}>{t("shareTip")}</span>
            <span className="payseg" data-testid="tip-split"><Segmented label={t("shareTip")} value={split} onChange={setSplit} options={[{ value: "service", label: t("byService") }, { value: "even", label: t("evenly") }]} /></span>
          </div>
          <Shares techs={techs} shares={shares} t={t} />
        </>}
      </div>
      <div className="sep" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="line"><span>{t("visit")}</span><span>{formatCents(base)}</span></div>
        <div className="line"><span>{t("tip")}</span><span data-testid="pay-tip">{formatCents(tip)}</span></div>
      </div>
      <div className="sep" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <b style={{ fontSize: 17 }}>{t("total")}</b>
        <span className="money" data-testid="pay-total">{formatCents(base + tip)}</span>
      </div>
    </div>
  </>;
}
