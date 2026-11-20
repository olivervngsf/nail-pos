"use client";
// Checkout home, two layouts (board "Checkout Home · 4 variations", A + C). Same facts, same actions:
//   List  = clean rows: name first, tech, how long open, money lined up, Charge on the row. For a computer.
//   Cards = one big card per ticket with a big Charge button + a tech filter. For the salon iPad.
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Button, Chip } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { ticketLabel, totals, type Ticket } from "@/lib/checkout/ticket";
import { canCharge, homeFacts, hoursMins, longestFirst, openMinutes, techCounts, techsOn, type HomeLayout } from "@/lib/checkout/home";

type Props = {
  layout: HomeLayout; open: Ticket[]; paid: Ticket[];
  scan: string; setScan: (s: string) => void; onScan: () => void; scanMsg: string; demo: boolean;
  onNew: () => void; go: (t: Ticket, pay?: boolean) => void;
};
type T = ReturnType<typeof useTranslations>;

const ScanIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="co-scan-ico">
    <path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M8 9v6M12 9v6M16 9v6" />
  </svg>
);

/** Re-draw every 30 s so "Open 16 min" keeps counting. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(iv); }, []);
  return now;
}

const openText = (t: T, x: Ticket, now: number) => { const { h, m } = hoursMins(openMinutes(x.createdAt, now)); return h ? t("openHr", { h, m }) : t("openMin", { m }); };
const services = (x: Ticket) => x.lines.map((l) => l.name).join(", ") || "—";
const paidTag = (t: T, x: Ticket) => (x.payment?.method === "cash" ? t("tagPaidCash") : x.payment ? t("tagPaidCard") : t("tagPaid"));

export default function HomeView(p: Props) {
  const t = useTranslations("checkout");
  const f = useFormatter();
  const now = useNow();
  const [tech, setTech] = useState<string | null>(null);
  const open = longestFirst(p.open);
  const paid = [...p.paid].sort((a, b) => (b.payment?.at ?? b.createdAt).localeCompare(a.payment?.at ?? a.createdAt));
  const facts = homeFacts(open, paid);
  const cards = p.layout === "cards";
  const techs = techCounts(open);
  const pick = tech && techs.some((x) => x.name === tech) ? tech : null;
  const shown = cards && pick ? open.filter((x) => techsOn(x).includes(pick)) : open;
  const paidAt = (x: Ticket) => f.dateTime(new Date(x.payment?.at ?? x.createdAt), { timeStyle: "short" });

  const scanBox = (
    <form className="co-scan" onSubmit={(e) => { e.preventDefault(); p.onScan(); }}>
      <ScanIcon size={cards ? 20 : 18} />
      <input className="inp" data-testid="scan-box" aria-label={t("scanPh")} placeholder={t("scanPh")} value={p.scan} onChange={(e) => p.setScan(e.target.value)} />
    </form>
  );
  const action = (x: Ticket) => canCharge(x)
    ? <Button variant="primary" className="co-act" data-testid="row-charge" onClick={(e) => { e.stopPropagation(); p.go(x, true); }}>{t("chargeShort")}</Button>
    : <Button className="co-act" onClick={(e) => { e.stopPropagation(); p.go(x); }}>{t("openShort")}</Button>;
  const who = (x: Ticket) => x.client?.name || t("walkIn");
  const sub = (x: Ticket) => `${t("ticket", { n: ticketLabel(x) })} · ${services(x)}${!x.number ? ` · ${t("notSynced")}` : ""}`;

  return <>
    <div className="co-head">
      <h1 className="h1">{t("title")}</h1>
      {cards && <span className="cap num co-count">{t("openCount", { n: open.length })} · {formatCents(facts.toCollect)}</span>}
      {scanBox}
      {!cards && <Button variant="primary" data-testid="new-ticket" onClick={p.onNew}>{t("newTicket")}</Button>}
    </div>
    {p.scanMsg && <div className="hint err" role="alert">{p.scanMsg}</div>}
    {p.demo && <div className="demo">{t("demo")}</div>}

    {!cards && (
      <div className="co-stats">
        <div className="card pad"><span className="cap">{t("toCollect")}</span><b className="num bold co-big" data-testid="to-collect">{formatCents(facts.toCollect)}</b><span className="cap">{t("openCount", { n: open.length })}</span></div>
        <div className="card pad"><span className="cap">{t("paidToday")}</span><b className="num bold co-big">{formatCents(facts.paidCents)}</b><span className="cap num">{t("paidCount", { n: paid.length })} · {t("cardCash", { card: formatCents(facts.card), cash: formatCents(facts.cash) })}</span></div>
        <div className="card pad"><span className="cap">{t("tipsToday")}</span><b className="num bold co-big">{formatCents(facts.tips)}</b><span className="cap">{t("tipsSub")}</span></div>
      </div>
    )}

    {cards && techs.length > 1 && (
      <div className="co-chips" role="group" aria-label={t("techFilter")}>
        <Chip on={!pick} onClick={() => setTech(null)}>{t("allTechs", { n: open.length })}</Chip>
        {techs.map((x) => <Chip key={x.name} on={pick === x.name} onClick={() => setTech(x.name)}>{x.name} {x.n}</Chip>)}
      </div>
    )}

    <section className="co-sec">
      <div className="co-sec-h"><span className="eyebrow">{t("open")}</span><span className="tag">{open.length}</span><span className="grow" />{open.length > 1 && <span className="cap">{t("longestFirst")}</span>}</div>
      {cards ? (
        <div className="co-cards">
          {shown.map((x) => (
            <div key={x.id} className="card pad co-card" data-testid="ticket-row" role="button" tabIndex={0} onClick={() => p.go(x)} onKeyDown={(e) => { if (e.key === "Enter") p.go(x); }}>
              <div className="co-card-top"><Avatar name={x.client?.name || "?"} /><div className="grow"><b>{who(x)}</b><span className="cap">{t("ticket", { n: ticketLabel(x) })} · {openText(t, x, now)}</span></div></div>
              <div className="co-card-svc">{services(x)}{techsOn(x).length > 0 && <span className="cap"> · {techsOn(x).join(", ")}</span>}{!x.number && <span className="cap"> · {t("notSynced")}</span>}</div>
              <div className="co-card-foot"><b className="num bold co-big">{formatCents(totals(x).left)}</b>{action(x)}</div>
            </div>
          ))}
          <button type="button" className="co-new" data-testid="new-ticket" onClick={p.onNew}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            {t("newTicket")}
          </button>
        </div>
      ) : (
        <div className="group">
          {open.length ? open.map((x) => (
            <div key={x.id} className="row l co-row" data-testid="ticket-row" role="button" tabIndex={0} onClick={() => p.go(x)} onKeyDown={(e) => { if (e.key === "Enter") p.go(x); }}>
              <Avatar name={x.client?.name || "?"} />
              <div className="g"><b>{who(x)}</b><span className="cap">{sub(x)}</span></div>
              <span className="co-tech">{techsOn(x).join(", ")}</span>
              <span className="cap num co-open">{openText(t, x, now)}</span>
              <b className="num co-amt">{formatCents(totals(x).left)}</b>
              {action(x)}
            </div>
          )) : <div className="row"><span className="cap">{t("none")}</span></div>}
        </div>
      )}
    </section>

    <section className="co-sec">
      <div className="co-sec-h"><span className="eyebrow">{t("paidToday")} · {formatCents(facts.paidCents)}</span><span className="tag">{paid.length}</span></div>
      <div className="group">
        {paid.length ? paid.map((x) => {
          const s = totals(x);
          return (
            <div key={x.id} className="row l co-row" data-testid="ticket-row" role="button" tabIndex={0} onClick={() => p.go(x)} onKeyDown={(e) => { if (e.key === "Enter") p.go(x); }}>
              <Avatar name={x.client?.name || "?"} />
              <div className="g"><b>{who(x)}</b><span className="cap">{sub(x)}</span></div>
              <span className="co-tech">{techsOn(x).join(", ")}</span>
              <span className="cap num co-open">{paidAt(x)}{s.tip > 0 ? ` · ${t("tipOf", { amount: formatCents(s.tip) })}` : ""}</span>
              <span className="tag jade co-paid">{paidTag(t, x)}</span>
              <b className="num co-amt">{formatCents(s.total)}</b>
            </div>
          );
        }) : <div className="row"><span className="cap">{t("noneYet")}</span></div>}
      </div>
    </section>
  </>;
}
