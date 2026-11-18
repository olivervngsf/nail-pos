"use client";
// Owner / manager: what every printout shows. Pick a printout (client receipt, staff slip, ticket slip), turn parts
// on/off, see the paper change on the right (the same lines the printer prints), save for the whole salon, print a test.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Field, LeftMenu, OfflineBanner, Segmented, Switch, SyncPill, Toast, TopBar } from "@/components/kit";
import { PrinterSetup, usePrinter } from "@/components/PrinterSetup";
import { useDesk } from "@/lib/desk";
import { demoPayout } from "@/lib/closeday";
import { formatCents } from "@/lib/money";
import { receiptLines, type Paper, type ReceiptDoc } from "@/lib/print/escpos";
import { earningsDoc } from "@/lib/print/earnings";
import { printDoc } from "@/lib/print/print";
import { printInWindow } from "@/lib/print/slip";
import { PRINT_DEFAULTS, usePrintSettings, type PrintSettings } from "@/lib/print/settings";

type Kind = "receipt" | "staff" | "slip";
const $ = formatCents;

export default function PrinterSettings() {
  const t = useTranslations("printSettings");
  const tp = useTranslations("payouts");
  const tc = useTranslations("checkout");
  const { desk, err } = useDesk();
  const demo = desk?.mode === "demo";
  const { settings, save } = usePrintSettings(desk?.salonId, demo);
  const printer = usePrinter();
  const [kind, setKind] = useState<Kind>("receipt");
  const [draft, setDraft] = useState<PrintSettings>(PRINT_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 3000); };
  useEffect(() => setDraft(settings), [settings]);
  const changed = JSON.stringify(draft) !== JSON.stringify(settings);
  const salon = desk?.salonName ?? "Cosmo Nails";

  // Sample paper for the chosen printout, built by the same code that prints it.
  const doc: ReceiptDoc = useMemo(() => {
    if (kind === "staff") {
      const r = demoPayout()[0];
      return earningsDoc(r, salon, "11/16 - 11/17", {
        slipFor: (name) => tp("slipFor", { name }), services: tp("services"), cardTips: tp("cardTips"), cashTips: tp("cashTips"), tips: tp("tipsAll"),
        feeOnTips: tp("feeOnTips"), total: tp("total"), byCheck: tp("byCheck"), inCash: tp("inCash"), signature: tp("signature"), printed: tp("printed"),
        colTicket: tp("colTicket"), colTips: tp("colTips"), colService: tp("colService"), pay: (x) => tp("commission", { pct: x.commission_pct ?? 0 }),
      }, "11/17 7:12 PM", draft.staff);
    }
    if (kind === "slip") {
      const o = draft.slip;
      return { title: salon, sub: ["Nov 17, 2026, 2:05 PM", ...(o.staff ? ["Kim"] : [])], rows: [{ bold: [tc("slipTicket"), "#1042"] }, ...(o.client ? [{ text: "Hannah N." }] : []),
        { text: "Gel manicure" }, { text: "Gel polish change" }], footer: [tc("slipForTech"), tc("slipBack")], qr: "https://polishosapp.com/t/ticket/sample" };
    }
    const o = draft.receipt;
    return {
      title: salon,
      sub: [`${tc("receiptFor")} #1042`, "Nov 17, 2026, 2:40 PM", ...(o.client ? ["Hannah N."] : [])],
      rows: [[`Gel manicure${o.staff ? " - Kim" : ""}`, $(4500)], [`Gel polish change${o.staff ? " - Kim" : ""}`, $(2800)],
        ...(o.tips ? [[o.staff ? `${tc("tip")} - Kim` : tc("tip"), $(1200)] as [string, string]] : []),
        "sep", { bold: [tc("total"), $(o.tips ? 8500 : 7300)] }, ["VISA 4242", $(o.tips ? 8500 : 7300)]],
      footer: [o.thanks || tc("thanks", { name: "" }), ...(o.qr ? [tc("scanReceipt")] : []), "PolishOS"],
      qr: o.qr ? "https://polishosapp.com/r/sample" : undefined,
    };
  }, [kind, draft, salon, tp, tc]);
  const lines = receiptLines(doc, printer.paper as Paper);

  if (err) return <main className="pad"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;
  const admin = demo || desk.me.role === "owner" || desk.me.role === "manager";
  const set = <K extends Kind>(k: K, part: Partial<PrintSettings[K]>) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...part } }));
  const toggles: { k: Kind; key: string; label: string; sub?: string }[] = kind === "receipt" ? [
    { k: "receipt", key: "staff", label: t("rStaff") }, { k: "receipt", key: "tips", label: t("rTips") },
    { k: "receipt", key: "client", label: t("rClient") }, { k: "receipt", key: "qr", label: t("rQr"), sub: t("rQrSub") },
  ] : kind === "staff" ? [
    { k: "staff", key: "tickets", label: t("sTickets"), sub: t("sTicketsSub") }, { k: "staff", key: "tipSplit", label: t("sTipSplit") },
    { k: "staff", key: "checkCash", label: t("sCheckCash") }, { k: "staff", key: "signature", label: t("sSignature") },
    { k: "staff", key: "printedAt", label: t("sPrinted") },
  ] : [
    { k: "slip", key: "client", label: t("tClient") }, { k: "slip", key: "staff", label: t("tStaff") },
  ];
  const doSave = async () => {
    setBusy(true);
    try { await save(draft); say(t("saved")); } catch (e) { say(navigator.onLine ? (e as Error).message : t("needNet")); }
    setBusy(false);
  };
  const test = async () => {
    try { if (!(await printDoc(doc))) await printInWindow([doc]); printer.refresh(); } catch (e) { if (!/cancel/i.test((e as Error).message)) say((e as Error).message); }
  };

  return (
    <div className="app">
      <LeftMenu active="Today" salonInitials={desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={desk.me.display_name[0]} />
      <div className="col">
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Link className="btn ghost sm" href="/today">‹ {t("back")}</Link>{t("title")}</span>}><SyncPill /></TopBar>
        <OfflineBanner />
        {demo && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        {!admin ? <main style={{ padding: "20px 24px" }}><p className="hint err">{t("ownerOnly")}</p></main> : (
          <main className="ps">
            <section className="ps-left">
              {(printer.ok || printer.ios) && <div className="card" style={{ padding: "6px 16px" }}><PrinterSetup p={printer} /></div>}
              <Segmented label={t("which")} value={kind} onChange={setKind}
                options={[{ value: "receipt", label: t("kReceipt") }, { value: "staff", label: t("kStaff") }, { value: "slip", label: t("kSlip") }]} />
              <div className="cap">{t(`about_${kind}`)}</div>
              <div className="card ps-opts" data-testid="ps-opts">
                {toggles.map((x) => {
                  const on = (draft[x.k] as Record<string, unknown>)[x.key] as boolean;
                  return <div key={x.key} className="row s"><span className="g">{x.label}{x.sub && <span className="cap" style={{ display: "block" }}>{x.sub}</span>}</span>
                    <Switch label={x.label} on={on} onChange={(v) => set(x.k, { [x.key]: v } as Partial<PrintSettings[typeof x.k]>)} /></div>;
                })}
                {kind === "receipt" && <div style={{ padding: "10px 0" }}><Field id="ps-thanks" label={t("rThanks")} placeholder={tc("thanks", { name: "" })} maxLength={60}
                  value={draft.receipt.thanks} onChange={(e) => set("receipt", { thanks: e.target.value })} /></div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary" data-testid="ps-save" disabled={!changed || busy} onClick={() => void doSave()}>{t("save")}</Button>
                <Button onClick={() => setDraft(PRINT_DEFAULTS)}>{t("reset")}</Button>
                <span style={{ flex: 1 }} />
                <Button data-testid="ps-test" onClick={() => void test()}>{t("test")}</Button>
              </div>
              <div className="cap">{t("note")}</div>
            </section>
            <section className="ps-right" aria-label={t("preview")}>
              <div className="eyebrow">{t("preview")} · {printer.paper} mm</div>
              <div className={`ps-paper w${printer.paper}`} data-testid="ps-paper">
                {lines.map((l, i) => "qr" in l ? <div key={i} className="ps-qr" aria-label="QR">QR</div>
                  : <div key={i} className={l.bold ? "b" : undefined} style={l.big ? { fontSize: "1.25em" } : undefined}>{l.text || " "}</div>)}
              </div>
            </section>
          </main>
        )}
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
