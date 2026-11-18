"use client";
// Tech app · My earnings: today / this week / last week, my own money only (`my_earnings`), every ticket, print my slip
// on the salon printer (same printer setup as checkout).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Segmented, Toast } from "@/components/kit";
import { EarningsSlip, useEarningsPrint } from "@/app/earnings/Earnings";
import { PrinterSetup, usePrinter } from "@/components/PrinterSetup";
import { formatCents } from "@/lib/money";
import { TechShell, useTechMe } from "../tech";
import { periodRange, timeOf, useMyEarnings, type Period } from "../data";

const $ = formatCents;

export default function TechEarnings() {
  const t = useTranslations("tech");
  const { me, err } = useTechMe();
  const [p, setP] = useState<Period>("today");
  const row = useMyEarnings(me, p);
  const printSlips = useEarningsPrint(me?.salonId, me ? !me.live : false);
  const printer = usePrinter();
  const [toast, setToast] = useState("");
  const [from, to] = periodRange(p);
  const label = from === to ? from : `${from} → ${to}`;
  return (
    <TechShell title={t("myEarnings")} me={me} err={err}>
      <Segmented label={t("period")} value={p} onChange={setP} options={[{ value: "today", label: t("today") }, { value: "week", label: t("thisWeek") }, { value: "last", label: t("lastWeek") }]} />
      <span className="cap">{label}</span>
      {row === undefined ? <div aria-busy="true" style={{ height: 120 }} /> : !row ? <p className="cap">{t("noEarnings")}</p> : <>
        <EarningsSlip r={row} />
        {!!row.lines?.length && <div className="card" style={{ padding: 0 }} data-testid="my-tickets">
          {row.lines.map((l) => (
            <div key={l.number} className="t-row" style={{ cursor: "default" }}>
              <span className="when"><b>#{l.number}</b><span className="cap" style={{ display: "block" }}>{timeOf(l.at)}</span></span>
              <span style={{ flex: 1, minWidth: 0 }} className="cap">{l.services}{l.tip_card_cents + l.tip_cash_cents ? ` · ${t("tipAmount", { amount: $(l.tip_card_cents + l.tip_cash_cents) })}` : ""}</span>
              <b className="num">{$(l.services_cents)}</b>
            </div>
          ))}
        </div>}
        <Button variant="primary" block data-testid="tech-print" onClick={() => void printSlips([row], me!.salonName, label).then(printer.refresh)
          .catch((e) => { setToast((e as Error).message); setTimeout(() => setToast(""), 3500); })}>{t("printMine")}</Button>
        <PrinterSetup p={printer} />
      </>}
      {toast && <Toast>{toast}</Toast>}
    </TechShell>
  );
}
