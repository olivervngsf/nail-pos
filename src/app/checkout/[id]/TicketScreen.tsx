"use client";
// Checkout · one ticket (Checkout board Tk1–Tk7, Pay, Cash Cs1–Cs2, Done, An5 receipt).
// Saved on this device after every tap; sent to the server through the outbox (works offline).
import { pinLenFor } from "@/lib/pin";
import { canOk, useRolePerms } from "@/lib/roles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Banner, Button, Chip, Drawer, Field, LeftMenu, ListGroup, OfflineBanner, PinKeypad, Sheet, SyncPill, Tag, Toast, TopBar } from "@/components/kit";
import { ROLE_LABEL, e164, pinMessage, rpc, type PinResult } from "@/lib/auth";
import { formatCents, parseDollars, percentOf } from "@/lib/money";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { useDesk, getActing, touchActing, type Desk, type DeskService } from "@/lib/desk";
import { logReceipt, sendReceipt, pullTickets, putTicket, saveNow, takeCashPart, undoCashPart, useTicket } from "@/lib/checkout/store";
import { api } from "@/lib/api";
import { GiftSellDrawer, GiftUseDrawer } from "./GiftDrawers";
import { AppReaderPay } from "./AppReader";
import { canAppReader, canTapToPay, keepTapWarm, onTapWarm, tapOnHere, tapWarmNow, type TapCheck, type TapWarm } from "@/lib/app/reader";
import { demoSettle, giftUndo } from "@/lib/checkout/gift";
import { receiptBytes, type ReceiptDoc } from "@/lib/print/escpos";
import { receiptCode } from "@/lib/receipt-code";
import { maskTo, receiptLine, type ReceiptOutcome } from "@/lib/checkout/receiptSend";
import StatusIcon from "@/components/StatusIcon";
import { printBytes } from "@/lib/print/bluetooth";
import { PrinterSetup, usePrinter } from "@/components/PrinterSetup";
import { usePrintSettings, type PrintSettings } from "@/lib/print/settings";
import { printTicketSlip } from "@/lib/print/slip";
import { clientLoyalty, pointsFor, type ClientLoyalty } from "@/lib/loyalty/loyalty";
import { getProfile, profileFor, type Profile, type Who } from "@/lib/clients";
import { EditDrawer } from "@/app/clients/ClientParts";
import { blockers, changeCents, quickCash, splitTipByPrice, staffOn, ticketLabel, totals, type Discount, type ServiceLine, type Ticket } from "@/lib/checkout/ticket";

const uuid = () => crypto.randomUUID();
const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const $ = formatCents;

type Step = "ticket" | "pay" | "cash" | "reader" | "link" | "app" | "tap";

export default function TicketScreen({ id, pay }: { id: string; pay?: boolean }) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const { desk, err } = useDesk();
  const [ticket, ready] = useTicket(id);
  const [step, setStep] = useState<Step>("ticket");
  // "Charge" on the Checkout list opens the ticket straight on How to pay (?pay=1), once, and only if nothing is missing.
  const wantPay = useRef(!!pay);
  useEffect(() => {
    if (!wantPay.current || !ticket) return;
    wantPay.current = false;
    if (ticket.status === "open" && blockers(ticket).length === 0 && totals(ticket).toPay > 0) setStep("pay");
  }, [ticket]);
  const [toast, setToast] = useState("");
  const say = useCallback((s: string) => { setToast(s); setTimeout(() => setToast(""), 3500); }, []);
  // Test copy: cards sold on a paid ticket get their money (the server does this for real salons).
  useEffect(() => { if (desk?.mode === "demo" && ticket?.status === "paid") demoSettle(ticket); }, [desk?.mode, ticket]);

  if (err) return <Centered><h1 className="h2">Something went wrong</h1><p className="hint err">{err}</p><Button onClick={() => location.reload()}>Try again</Button></Centered>;
  if (!desk || !ready) return <div className="app" aria-busy="true" />;
  if (!ticket) return <Centered><h1 className="h2">{t("none")}</h1><Button variant="primary" onClick={() => router.push("/checkout")}>{t("title")}</Button></Centered>;

  const save = (patch: Partial<Ticket>, now = false) => { touchActing(); putTicket({ ...ticket, ...patch }, { now }); };
  const title = ticket.status !== "open" ? `${t("ticket", { n: ticketLabel(ticket) })} · ${t("paid")}` : step === "pay" ? t("howPay") : step === "cash" ? t("cash") : t("ticket", { n: ticketLabel(ticket) });

  return (
    <div className="app tk-app" onPointerDown={touchActing}>
      <LeftMenu active="Checkout" salonInitials={initials(desk.salonName)} />
      <div className="col">
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {ticket.status === "open" && step !== "ticket" && <Button variant="ghost" size="sm" onClick={() => setStep(step === "pay" ? "ticket" : "pay")}>‹ {t("back")}</Button>}
          {ticket.status === "open" && step === "ticket" && <Button variant="ghost" size="sm" onClick={() => router.push("/checkout")}>‹ {t("title")}</Button>}
          {title}
        </span>}>
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        {desk.mode === "demo" && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        {ticket.status !== "open" ? <Done desk={desk} ticket={ticket} say={say} />
          : step === "pay" ? <Pay desk={desk} ticket={ticket} onPick={setStep} say={say} />
          : step === "reader" || step === "link" ? <CardWait key={step} desk={desk} ticket={ticket} method={step} onBack={() => setStep("pay")} />
          : step === "app" ? <AppReaderPay desk={desk} ticket={ticket} onBack={() => setStep("pay")} />
          : step === "tap" ? <AppReaderPay key="tap" tap desk={desk} ticket={ticket} onBack={() => setStep("pay")} />
          : step === "cash" ? <Cash desk={desk} ticket={ticket} save={save} onPart={() => setStep("pay")} />
          : <Build desk={desk} ticket={ticket} save={save} onCharge={() => setStep("pay")} />}
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

/* ---------- 1. Build the ticket ---------- */
type SaveFn = (patch: Partial<Ticket>, now?: boolean) => void;

function Build({ desk, ticket, save, onCharge }: { desk: Desk; ticket: Ticket; save: SaveFn; onCharge: () => void }) {
  const t = useTranslations("checkout");
  const [sheet, setSheet] = useState<null | { kind: "service" } | { kind: "staff"; svc?: DeskService; lineId?: string } | { kind: "discount" } | { kind: "gift" }>(null);
  const [noteOpen, setNoteOpen] = useState(!!ticket.note);
  const [more, setMore] = useState(false); // phones: discount / gift card / note / slip live in one sheet
  const [slipMsg, setSlipMsg] = useState("");
  const [slipBusy, setSlipBusy] = useState(false);
  const f = useFormatter();
  const sum = totals(ticket);
  const block = blockers(ticket);

  // Ticket slip: techs add services from their phone, so check the server for new lines every few seconds.
  useEffect(() => {
    if (desk.mode !== "live") return;
    const name = (id: string) => desk.staff.find((x) => x.id === id)?.name ?? "";
    const tick = () => { if (navigator.onLine) void pullTickets(desk.salonId, name, "", ticket.id).catch(() => null); };
    tick();
    const iv = setInterval(tick, 6000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(iv); window.removeEventListener("focus", tick); };
  }, [desk, ticket.id]);

  const printSlip = async () => {
    setSlipBusy(true); setSlipMsg("");
    try {
      await printTicketSlip(ticket.id, desk.salonName, { ticket: t("slipTicket"), forTech: t("slipForTech"), back: t("slipBack") },
        f.dateTime(new Date(ticket.createdAt), { dateStyle: "medium", timeStyle: "short" }));
      setSlipMsg(t("slipPrinted"));
    } catch (e) { setSlipMsg((e as Error).message); }
    setSlipBusy(false);
  };

  const setLine = (lineId: string, patch: Partial<ServiceLine>) => save({ lines: ticket.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) });

  const pickStaff = (staffId: string, staffName: string) => {
    if (!sheet || sheet.kind !== "staff") return;
    if (sheet.lineId) setLine(sheet.lineId, { staffId, staffName });
    else if (sheet.svc) {
      const s = sheet.svc;
      save({ lines: [...ticket.lines, { id: uuid(), serviceId: s.id, name: s.name, minutes: s.minutes, cents: s.cents, priceFrom: s.priceFrom, staffId, staffName }] });
    }
    setSheet(null);
  };

  return (
    <main className="ck-main">
      <section className="ck-left">
        <div className="h1">{t("services")}</div>
        <div className="group" data-testid="lines">
          {ticket.lines.map((l) => (
            <div className="row" key={l.id} data-testid="line">
              <button type="button" className="av" style={{ border: 0, cursor: "pointer" }} aria-label={l.staffName ?? t("whoDoes")} onClick={() => setSheet({ kind: "staff", lineId: l.id })}>{l.staffName ? initials(l.staffName) : "?"}</button>
              <div className="grow">
                <div className="ck-lname" style={{ fontWeight: 600 }}>{l.name}</div>
                {l.staffName
                  ? <div className="cap">{l.staffName} · {l.minutes} min{l.fromPhone && <span className="tag ck-byphone" data-testid="line-by-phone">{l.addedAt ? t("addedByAt", { name: l.staffName, time: new Date(l.addedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) }) : t("addedBy", { name: l.staffName })}</span>}</div>
                  : <button type="button" className="cap" style={{ border: 0, background: "none", padding: 0, color: "var(--orange)", cursor: "pointer", font: "inherit" }} onClick={() => setSheet({ kind: "staff", lineId: l.id })}>{t("needStaff")}</button>}
              </div>
              {l.priceFrom
                ? <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <MoneyInput cents={l.cents} label={`${l.name}: ${t("finalPrice")}`} warn={!l.priceSet} onChange={(c) => setLine(l.id, { cents: c, priceSet: true })} />
                    {!l.priceSet && <span className="cap">{t("fromPrice", { amount: $(l.cents) })}+</span>}
                  </span>
                : <span className="num" style={{ fontWeight: 600 }}>{$(l.cents)}</span>}
              <Button variant="ghost" size="sm" aria-label={`${t("remove")} ${l.name}`} onClick={() => save({ lines: ticket.lines.filter((x) => x.id !== l.id) })}>✕</Button>
            </div>
          ))}
          {(ticket.gifts ?? []).map((g) => (
            <div className="row fade" key={g.id} data-testid="gift-line">
              <div className="av" style={{ background: "#1C1C1E", color: "#fff" }}>🎁</div>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{g.kind === "reload" ? t("giftReload", { last4: g.last4 }) : t("giftSold", { last4: g.last4 })}</div>
                <div className="cap">{g.kind === "digital" ? (g.to ? t("giftTo", { to: g.to.startsWith("+") ? fmtPhone(g.to) : g.to }) : t("giftDigital")) : g.kind === "plastic" ? t("giftPlastic") : t("giftAddMoney")} · {t("giftNoTech")}</div>
              </div>
              <span className="num" style={{ fontWeight: 600 }}>{$(g.cents)}</span>
              <Button variant="ghost" size="sm" aria-label={`${t("remove")} ${g.last4}`} onClick={() => save({ gifts: (ticket.gifts ?? []).filter((x) => x.id !== g.id) })}>✕</Button>
            </div>
          ))}
          <button className="opt" type="button" data-testid="add-service" onClick={() => setSheet({ kind: "service" })} style={{ color: "var(--ink-soft)" }}>
            <div className="av" style={{ background: "transparent", border: "1px dashed var(--muted)" }}>+</div><div className="grow">{t("addService")}</div>
          </button>
        </div>
        <div className="ck-acts">
          <Button onClick={() => setSheet({ kind: "discount" })} disabled={!sum.subtotal}>{t("discountBtn")}</Button>
          <Button data-testid="add-gift" onClick={() => setSheet({ kind: "gift" })}>{t("giftBtn")}</Button>
          <Button variant="ghost" onClick={() => setNoteOpen(true)}>{t("note")}</Button>
          {desk.mode === "live" && <Button variant="ghost" data-testid="print-slip" disabled={slipBusy} onClick={() => void printSlip()}>{t("printSlip")}</Button>}
        </div>
        {slipMsg && <div className="cap" role="status">{slipMsg}</div>}
        {noteOpen && <textarea className="inp" aria-label={t("note")} placeholder={t("notePh")} rows={2} style={{ height: "auto", padding: 12, resize: "vertical" }}
          value={ticket.note} onChange={(e) => save({ note: e.target.value })} />}
        <div style={{ flex: 1 }} />
        <div className="card ck-sum" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="line"><span>{t("subtotal")}</span><span>{$(sum.subtotal)}</span></div>
          {ticket.discount && <div className="line fade" data-testid="discount-line"><span>{t("discountLine", { reason: ticket.discount.reason })}{ticket.discount.kind === "pct" ? ` ${ticket.discount.value}%` : ""}{ticket.discount.approvedBy && <span className="cap"> · {ticket.discount.approvedBy}</span>}</span><span>−{$(sum.discount)}</span></div>}
          {ticket.reward && sum.reward > 0 && <div className="line fade ck-reward" data-testid="reward-line"><span>{t("rewardLine", { n: ticket.reward.points })}</span><span>−{$(sum.reward)}</span></div>}
          {ticket.reward && sum.reward > 0 && <div className="cap">{t("rewardShare", { staff: staffOn(ticket.lines).map((x) => x.name).join(", "), full: $(sum.subtotal), amt: $(sum.reward) })}</div>}
          {sum.gift > 0 && <div className="line fade" data-testid="gift-total"><span>{t("giftCards")}</span><span>{$(sum.gift)}</span></div>}
          <div className="sep" />
          <div className="ck-paybar">
            <div className="ck-due"><div className="cap">{t("dueNow")}</div><div className="money fade" data-testid="due">{$(sum.toPay)}</div></div>
            <div className="ck-go">
              <Button className="ck-more" data-testid="ticket-more" aria-haspopup="dialog" onClick={() => setMore(true)}>{t("moreBtn")}</Button>
              <Button variant="primary" data-testid="charge" disabled={block.length > 0} onClick={onCharge}>{t("charge", { amount: $(sum.toPay) })}</Button>
              {block.length > 0 && <span className="cap" style={{ textAlign: "center" }}>{t(block[0] === "empty" ? "needService" : block[0] === "staff" ? "needStaff" : "needPrice")}</span>}
            </div>
          </div>
        </div>
      </section>
      <ClientPanel desk={desk} ticket={ticket} save={save} />

      {more && <Sheet label={t("moreBtn")} onClose={() => setMore(false)}>
        <div className="h2">{t("moreBtn")}</div>
        <ListGroup>
          <button type="button" className="opt" data-testid="more-discount" disabled={!sum.subtotal} onClick={() => { setMore(false); setSheet({ kind: "discount" }); }}><span className="grow">{t("discountBtn")}</span><span aria-hidden>›</span></button>
          <button type="button" className="opt" data-testid="more-gift" onClick={() => { setMore(false); setSheet({ kind: "gift" }); }}><span className="grow">{t("giftBtn")}</span><span aria-hidden>›</span></button>
          <button type="button" className="opt" data-testid="more-note" onClick={() => { setMore(false); setNoteOpen(true); }}><span className="grow">{t("note")}</span><span aria-hidden>›</span></button>
          {desk.mode === "live" && <button type="button" className="opt" data-testid="more-slip" disabled={slipBusy} onClick={() => { setMore(false); void printSlip(); }}><span className="grow">{t("printSlip")}</span><span aria-hidden>›</span></button>}
        </ListGroup>
        <Button block onClick={() => setMore(false)}>{t("back")}</Button>
      </Sheet>}

      {sheet?.kind === "service" && <ServiceDrawer desk={desk} onClose={() => setSheet(null)} onPick={(svc) => setSheet({ kind: "staff", svc })} />}
      {sheet?.kind === "staff" && <StaffDrawer desk={desk} title={sheet.svc?.name ?? ticket.lines.find((l) => l.id === sheet.lineId)?.name ?? ""}
        onBack={sheet.svc ? () => setSheet({ kind: "service" }) : undefined} onClose={() => setSheet(null)} onPick={pickStaff} />}
      {sheet?.kind === "discount" && <DiscountDrawer desk={desk} subtotal={sum.subtotal} current={ticket.discount} onClose={() => setSheet(null)}
        onApply={(d) => { save({ discount: d }); setSheet(null); }} />}
      {sheet?.kind === "gift" && <GiftSellDrawer desk={desk} ticket={ticket} onClose={() => setSheet(null)} onAdd={(g) => { save({ gifts: [...(ticket.gifts ?? []), g] }); setSheet(null); }} />}
    </main>
  );
}

function ServiceDrawer({ desk, onClose, onPick }: { desk: Desk; onClose: () => void; onPick: (s: DeskService) => void }) {
  const t = useTranslations("checkout");
  const [q, setQ] = useState("");
  const list = desk.services.filter((s) => (s.name + " " + s.cat).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Drawer title={t("addService")} onClose={onClose}>
      <input className="inp" autoFocus placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="eyebrow">{t("pickService")}</div>
      <ListGroup>
        {list.map((s) => (
          <button key={s.id} className="opt" type="button" onClick={() => onPick(s)}>
            <div className="grow"><div style={{ fontWeight: 600 }}>{s.name}</div><div className="cap">{s.cat} · {s.minutes} min</div></div>
            <span className="num">{$(s.cents)}{s.priceFrom ? "+" : ""}</span>
          </button>
        ))}
      </ListGroup>
    </Drawer>
  );
}

function StaffDrawer({ desk, title, onBack, onClose, onPick }: { desk: Desk; title: string; onBack?: () => void; onClose: () => void; onPick: (id: string, name: string) => void }) {
  const t = useTranslations("checkout");
  const staff = [...desk.staff].sort((a, b) => Number(b.clockedIn) - Number(a.clockedIn) || Number(b.role === "tech") - Number(a.role === "tech"));
  return (
    <Drawer title={title} onClose={onClose}>
      {onBack && <Button variant="ghost" size="sm" onClick={onBack} style={{ alignSelf: "flex-start" }}>‹ {t("back")}</Button>}
      <div className="eyebrow">{t("whoDoes")}</div>
      <div className="cap" style={{ marginTop: -8 }}>{t("factsOnly")}</div>
      <ListGroup>
        {staff.map((s) => (
          <button key={s.id} className="opt" type="button" data-testid={`pick-${s.name}`} onClick={() => onPick(s.id, s.name)}>
            <Avatar name={s.name} />
            <div className="grow"><div style={{ fontWeight: 600 }}>{s.name} <span className="cap" style={{ fontWeight: 400 }}>{s.role !== "tech" ? ROLE_LABEL[s.role] : ""}</span></div>
              <div className="cap">{t("turns", { count: s.turns })}{s.centsToday ? ` · ${t("today", { amount: $(s.centsToday) })}` : ""}</div></div>
            {s.clockedIn ? <Tag tone="jade">{t("clockedIn")}</Tag> : <Tag>{t("notIn")}</Tag>}
          </button>
        ))}
      </ListGroup>
    </Drawer>
  );
}

const DISC_OPTS: { kind: "amt" | "pct"; value: number; label: string }[] = [
  { kind: "amt", value: 500, label: "$5" }, { kind: "amt", value: 1000, label: "$10" }, { kind: "pct", value: 10, label: "10%" }, { kind: "pct", value: 15, label: "15%" },
];
const REASONS = ["rRegular", "rBirthday", "rFix", "rOther"] as const;

function DiscountDrawer({ desk, subtotal, current, onClose, onApply }: { desk: Desk; subtotal: number; current?: Discount; onClose: () => void; onApply: (d: Discount | undefined) => void }) {
  const t = useTranslations("checkout");
  const [opt, setOpt] = useState(0);
  const [reason, setReason] = useState(0);
  const [approver, setApprover] = useState<string | null>(null);
  const [ok, setOk] = useState<{ approvalId?: string; name: string } | null>(null);
  const [pinErr, setPinErr] = useState("");
  const o = DISC_OPTS[opt];
  const off = Math.min(subtotal, o.kind === "pct" ? percentOf(subtotal, o.value) : o.value);
  const perms = useRolePerms(desk.salonId, desk.mode === "demo");
  const managers = desk.staff.filter((s) => canOk(perms, s.role, "discount"));
  const meIsAdmin = canOk(perms, desk.me.role, "discount");

  const check = async (pin: string) => {
    setPinErr("");
    if (desk.mode === "demo") return setOk({ name: managers[0]?.name ?? "Mai" });
    if (!navigator.onLine) return setPinErr(t("pinOffline"));
    try {
      const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", { p_salon: desk.salonId, p_device: desk.device!.id, p_membership: approver, p_pin: pin });
      if (!r.ok) return setPinErr((r.reason as string) === "not_manager" ? t("notManager") : pinMessage(r));
      setOk({ approvalId: r.approval_id, name: r.name ?? "" });
    } catch { setPinErr(t("pinOffline")); }
  };
  const selfOk = async () => {
    setPinErr("");
    if (!navigator.onLine) return setPinErr(t("pinOffline"));
    try {
      const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", { p_salon: desk.salonId });
      if (!r.ok) return setPinErr(t("notManager"));
      setOk({ approvalId: r.approval_id, name: r.name ?? desk.me.display_name });
    } catch { setPinErr(t("pinOffline")); }
  };

  return (
    <Drawer title={t("discount")} onClose={onClose} footer={<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Button variant="primary" block data-testid="apply-discount" disabled={!ok}
        onClick={() => onApply({ id: current?.id ?? uuid(), kind: o.kind, value: o.value, reason: t(REASONS[reason]), approvalId: ok?.approvalId, approvedBy: ok?.name })}>{t("applyDiscount")}</Button>
      {current && <Button variant="ghost" block onClick={() => onApply(undefined)}>{t("removeDiscount")}</Button>}
    </div>}>
      <div className="eyebrow">{t("amount")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{DISC_OPTS.map((d, i) => <Chip key={d.label} on={opt === i} onClick={() => setOpt(i)}>{d.label}</Chip>)}</div>
      <div className="line" style={{ fontSize: 16 }}><span>{t("takesOff")}</span><b>−{$(off)}</b></div>
      <div className="eyebrow">{t("reason")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{REASONS.map((r, i) => <Chip key={r} on={reason === i} onClick={() => setReason(i)}>{t(r)}</Chip>)}</div>
      <div className="eyebrow">{t("managerPin")}</div>
      {ok ? <div className="note" data-testid="approved">{t("approvedBy", { name: ok.name })}</div>
        : desk.mode === "live" && !desk.device ? (meIsAdmin
          ? <><span className="cap">{t("selfApprove", { role: ROLE_LABEL[desk.me.role] })}</span><Button onClick={() => void selfOk()}>OK</Button></>
          : <span className="hint err">{t("notManager")}</span>)
        : desk.mode === "live" && !approver ? <>
            <span className="cap">{t("whoApproves")}</span>
            <ListGroup>{managers.map((m) => <button key={m.id} type="button" className="opt" onClick={() => setApprover(m.id)}><Avatar name={m.name} />{m.name}<span className="cap">{ROLE_LABEL[m.role]}</span></button>)}</ListGroup>
          </>
        : <><span className="cap">{t("pinHint")}</span><PinKeypad length={pinLenFor(approver)} error={pinErr} onDone={(p) => void check(p)} /></>}
      {pinErr && (ok || (desk.mode === "live" && !desk.device)) && <span className="hint err">{pinErr}</span>}
      <div className="cap">{t("commissionNote")}</div>
    </Drawer>
  );
}

/* Client panel (CRM): phone first. */
type Found = { client_id: string; name: string; notes: string; visits: number; avg_cents: number; last_visit: string | null; last_services: string | null };

/** Phone first: a number on file attaches that client as a read-only card. The desk can "Change client" (wrong person) or
 *  "Edit details" (owner/manager OK). Typing on a ticket never edits the client on file; a new client's name is typed once. */
function ClientPanel({ desk, ticket, save }: { desk: Desk; ticket: Ticket; save: SaveFn }) {
  const t = useTranslations("checkout");
  const f = useFormatter();
  const [phone, setPhone] = useState(ticket.client?.phone ? fmtPhone(ticket.client.phone) : "");
  const [name, setName] = useState(ticket.client?.name ?? "");
  const [locked, setLocked] = useState(!!ticket.client && (phoneOk(fmtPhone(ticket.client.phone)) || !!ticket.client.name));
  const [found, setFound] = useState<Found | null | "offline">(null);
  const [look, setLook] = useState(0);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [editErr, setEditErr] = useState("");
  const who: Who = { mode: desk.mode, salonId: desk.salonId, salonName: desk.salonName, role: desk.me.role, name: desk.me.display_name };

  useEffect(() => {
    if (!phoneOk(phone) || desk.mode !== "live") { setFound(null); return; }
    if (!navigator.onLine) { setFound("offline"); return; }
    let stop = false;
    void rpc<Found[]>("client_lookup", { p_salon: desk.salonId, p_phone: e164(phone) })
      .then((r) => { if (!stop) setFound(r[0] ?? null); })
      .catch(() => !stop && setFound("offline"));
    return () => { stop = true; };
  }, [phone, desk.mode, desk.salonId, look]);

  const commit = (p: string, n: string) => save({ client: phoneOk(p) ? { phone: e164(p), name: n.trim() } : n.trim() ? { phone: "", name: n.trim() } : undefined });
  const c = found && found !== "offline" ? found : null;
  // A number on file: attach that client as they are (their saved name, not what was typed).
  useEffect(() => {
    if (!c) return;
    setName(c.name);
    if (!locked) { commit(phone, c.name); setLocked(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.client_id, c?.name]);

  const change = () => { setLocked(false); setPhone(""); setName(""); setFound(null); save({ client: undefined }); };
  const openEdit = async () => {
    setEditErr("");
    if (!c) return;
    try { setEdit(await getProfile(who, c.client_id)); } catch { setEditErr(t("lookupOffline")); }
  };
  const canAdd = phoneOk(phone) || (!phone && !!name.trim());
  const showNew = !locked && (phoneOk(phone) ? !c : !phone);

  return (
    <aside className="card ck-aside" data-testid="client-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="av lg">{name ? initials(name) : "?"}</div>
        <div style={{ flex: 1, minWidth: 0 }}><div className="h2" data-testid="client-name">{name || t("walkIn")}</div><div className="cap num">{phone || t("client")}</div></div>
        {c && c.visits > 2 ? <Tag tone="jade">{t("rRegular")}</Tag> : phoneOk(phone) && !c && found !== "offline" ? <Tag>{t("newClient")}</Tag> : null}
      </div>
      {!locked && <>
        <Field id="cphone" label={t("clientPhone")} inputMode="tel" autoComplete="off" value={phone} onChange={(e) => { const p = fmtPhone(e.target.value); setPhone(p); if (phoneOk(p)) commit(p, ""); }} />
        {showNew && <Field id="cname" label={phoneOk(phone) ? t("newClientName") : t("clientName")} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canAdd) { commit(phone, name); setLocked(true); } }} />}
        {showNew && (phoneOk(phone) || name.trim()) && <Button data-testid="add-client" disabled={!canAdd} onClick={() => { commit(phone, name); setLocked(true); }}>{t("addClient")}</Button>}
      </>}
      {locked && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant="ghost" data-testid="change-client" onClick={change}>{t("changeClient")}</Button>
        {c && <Button size="sm" variant="ghost" data-testid="edit-client" onClick={() => void openEdit()}>{t("editClient")}</Button>}
      </div>}
      {locked && name && !phone && <div className="cap" data-testid="no-phone-hint">{t("noPhoneNudge")}</div>}
      {editErr && <div className="hint err">{editErr}</div>}
      {found === "offline" && <div className="cap">{t("lookupOffline")}</div>}
      {edit && <EditDrawer who={who} p={edit} onClose={() => setEdit(null)} onSaved={(_, v) => {
        // Keep the ticket pointing at the same person if their phone or name was fixed.
        setEdit(null); const p = v.phone ? fmtPhone(v.phone) : phone; setPhone(p); setName(v.name || name); commit(p, v.name || name); setLook((n) => n + 1);
      }} />}
      {c && <>
        <div className="grid3" style={{ gap: 8, textAlign: "center" }}>
          <Stat v={String(c.visits)} l={t("visits")} />
          <Stat v={c.visits ? $(Number(c.avg_cents)).replace(/\.00$/, "") : "—"} l={t("avgTicket")} />
          <Stat v={c.last_visit ? f.dateTime(new Date(c.last_visit), { month: "short", day: "numeric" }) : "—"} l={t("lastVisit", { date: "" }).replace(/ · $/, "")} />
        </div>
        <a className="cap" href={`/clients/${c.client_id}`} data-testid="open-profile" style={{ fontWeight: 600 }}>{t("openProfile")} ›</a>
        {c.last_services && <div><div className="eyebrow" style={{ marginBottom: 6 }}>{t("lastVisit", { date: c.last_visit ? f.dateTime(new Date(c.last_visit), { month: "short", day: "numeric" }) : "" })}</div><div style={{ fontSize: 15 }}>{c.last_services}</div></div>}
        {c.notes && <div><div className="eyebrow" style={{ marginBottom: 6 }}>{t("notes")}</div><div style={{ fontSize: 15, background: "var(--surface)", borderRadius: 12, padding: "10px 12px" }}>{c.notes}</div></div>}
      </>}
      {phoneOk(phone) && !c && found === null && desk.mode === "live" && <div className="cap">{t("noVisits")}</div>}
      {phoneOk(phone) && <LoyaltyBox desk={desk} ticket={ticket} save={save} phone={e164(phone)} name={name} />}
    </aside>
  );
}
/* Loyalty (Loyalty board L7–L8): points + "reward ready"; Use asks first; never applied by itself. */
function LoyaltyBox({ desk, ticket, save, phone, name }: { desk: Desk; ticket: Ticket; save: SaveFn; phone: string; name: string }) {
  const t = useTranslations("checkout");
  const [ly, setLy] = useState<ClientLoyalty | null>(null);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    let stop = false;
    void clientLoyalty(desk.mode === "live", desk.salonId, phone).then((r) => !stop && setLy(r)).catch(() => !stop && setLy(null));
    return () => { stop = true; };
  }, [desk.mode, desk.salonId, phone]);
  if (!ly) return null;
  const open = ticket.status === "open";
  const sum = totals(ticket);
  const first = (name || t("client")).split(" ")[0];
  const unit = ly.kind === "visits" ? t("visitsUnit") : t("ptsUnit");
  return (
    <div className="ck-loyalty" data-testid="loyalty">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="eyebrow" style={{ flex: 1 }}>{t("loyalty")}</span>
        <b className="num" data-testid="points">{ly.points} {unit}</b>
      </div>
      {ticket.reward ? <>
        <div className="cap" data-testid="reward-used">{t("rewardUsed", { name: first, n: pointsFor(ly, sum.due), amt: $(sum.due) })}</div>
        {open && <Button size="sm" onClick={() => save({ reward: undefined }, true)} data-testid="reward-undo">{t("undo")}</Button>}
      </> : ly.ready ? <>
        <span className="tag jade" data-testid="reward-ready">{t("rewardReady", { amt: $(ly.rewardCents).replace(/\.00$/, "") })}</span>
        {open && !ask && <Button size="sm" onClick={() => setAsk(true)} disabled={!sum.subtotal} data-testid="reward-use">{t("useReward", { amt: $(ly.rewardCents).replace(/\.00$/, "") })}</Button>}
        {open && ask && <div className="ck-ask">
          <div className="cap">{t("rewardAsk", { amt: $(ly.rewardCents).replace(/\.00$/, "") })}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="primary" data-testid="reward-yes" onClick={() => { save({ reward: { id: crypto.randomUUID(), cents: ly.rewardCents, points: ly.rewardPoints } }, true); setAsk(false); }}>{t("rewardYes")}</Button>
            <Button size="sm" onClick={() => setAsk(false)}>{t("rewardSave")}</Button>
          </div>
        </div>}
      </> : <div className="cap">{t("rewardAway", { n: Math.max(0, ly.rewardPoints - ly.points), unit, amt: $(ly.rewardCents).replace(/\.00$/, "") })}</div>}
    </div>
  );
}
const Stat = ({ v, l }: { v: string; l: string }) => <div style={{ background: "var(--surface)", borderRadius: 12, padding: "10px 4px" }}><div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{v}</div><div className="cap">{l}</div></div>;

/* ---------- 2. How is the client paying? ---------- */
function Pay({ desk, ticket, onPick, say }: { desk: Desk; ticket: Ticket; onPick: (s: Step) => void; say: (s: string) => void }) {
  const t = useTranslations("checkout");
  const sum = totals(ticket);
  const [gift, setGift] = useState(false);
  const online = typeof navigator === "undefined" || navigator.onLine;
  const why = desk.mode === "demo" ? t("payDemo") : !desk.pay.ready ? t("needStripe") : !online ? t("onlineOnly") : "";
  const tile = (id: string, title: React.ReactNode, sub: string, fee: string, on: boolean, go: () => void, note?: string) => on
    ? <button type="button" className="tile" data-testid={id} onClick={go} style={{ border: 0, font: "inherit", textAlign: "left", cursor: "pointer" }}>
        <div className="h2">{title}</div><div style={{ fontSize: 15 }}>{sub}</div><div className="cap num">{fee}</div></button>
    : <div className="tile" aria-disabled="true" data-testid={id} style={{ opacity: 0.55 }}>
        <div className="h2">{title}</div><div style={{ fontSize: 15 }}>{sub}</div><div className="cap num">{fee}</div>{note && <div className="demo">{note}</div>}</div>;
  const cardOk = !why && desk.pay.readers.length > 0;
  // Inside our Android app (handheld terminal): the small reader next to it. No pairing in setup needed.
  const [appReader, setAppReader] = useState(false);
  useEffect(() => setAppReader(canAppReader()), []);
  // Our app on a certified Android phone (app 1.2+): the phone itself takes the card (Tap to Pay). PS10 = no.
  const [tap, setTap] = useState<TapCheck | null>(null);
  useEffect(() => { void canTapToPay().then(setTap); }, []);
  // Tap to Pay on iPhone: get ready before the client taps (Apple's rule; after this phone's first tap).
  const [warm, setWarm] = useState<TapWarm>({ state: "off" });
  // Apple: an owner/manager turns it on (and accepts Apple's terms) in Settings before anyone checks out with it.
  const [tapOn, setTapOn] = useState(true);
  useEffect(() => { setTapOn(tapOnHere()); setWarm(tapWarmNow()); const stop = onTapWarm((w) => { setWarm(w); setTapOn(tapOnHere()); }); if (desk.mode === "live") keepTapWarm(desk.salonId); return stop; }, [desk.salonId, desk.mode]);
  const tapOff = !!tap?.ios && !tapOn;
  // Apple: on an iPhone it is always "Tap to Pay on iPhone" with Apple's own symbol (the app hands it to us).
  const tapTitle = tap?.ios
    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{/* eslint-disable-next-line @next/next/no-img-element -- Apple's symbol, a small picture handed over by the app */}
      {tap.icon && <img src={tap.icon} alt="" width={26} height={26} data-testid="tap-symbol" />}{t("tapTitleIphone")}</span>
    : t("tapTitle");
  const tapFee = tap?.ios && warm.state !== "off" ? `${t("readerFee")} · ${warm.state === "ready" ? t("tapReady") : warm.state === "warming" ? t("tapWarming") : ""}`.replace(/ · $/, "") : t("readerFee");
  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "24px 16px" }}>
      <div style={{ textAlign: "center" }}>
        <div className="cap">{t("ticket", { n: ticketLabel(ticket) })}{ticket.client?.name ? ` · ${ticket.client.name}` : ""}</div>
        <div className="money" style={{ fontSize: 56, lineHeight: "64px" }} data-testid="pay-amount">{$(sum.toPay)}</div>
        <div className="cap">{t("plusTip")}</div>
      </div>
      {(ticket.giftPays ?? []).length > 0 && <div className="group" style={{ width: "100%", maxWidth: 520 }} data-testid="gift-paid">
        {ticket.giftPays!.map((g) => (
          <div className="row" key={g.id}><span className="grow">{t("giftUsed", { last4: g.last4 })}</span><b className="num">−{$(g.cents)}</b>
            <Button variant="ghost" size="sm" onClick={() => void giftUndo(desk, ticket, g.id).catch((e) => say((e as Error).message))}>{t("undo")}</Button></div>
        ))}
      </div>}
      {(ticket.cashParts ?? []).length > 0 && <div className="group" style={{ width: "100%", maxWidth: 520 }} data-testid="cash-parts">
        {ticket.cashParts!.map((c) => (
          <div className="row" key={c.id}><span className="grow">{t("cashPartLine")}</span><b className="num">−{$(c.cents)}</b>
            <Button variant="ghost" size="sm" onClick={() => { undoCashPart(ticket, c.id); say(t("cashPartBack", { amount: $(c.cents) })); }}>{t("undo")}</Button></div>
        ))}
      </div>}
      <div className="grid2" style={{ width: "100%", maxWidth: 880, gap: 16 }}>
        {tap?.supported && tile("pay-tap", tapTitle, tap.ios ? t("tapSubIphone") : t("tapSub"), tapFee, !why && !tap.nfcOff && !tapOff, () => onPick("tap"), why || (tap.nfcOff ? t("tapNfcOff") : tapOff ? t("tapAskOwner") : undefined))}
        {appReader && tile("pay-app", t("appReader"), t("appReaderSub"), t("readerFee"), !why, () => onPick("app"), why)}
        {(!appReader || cardOk) && tile("pay-reader", t("reader"), t("readerSub"), t("readerFee"), cardOk, () => onPick("reader"), why || t("needReader"))}
        {tile("pay-cash", t("cash"), t("cashSub"), t("cashFee"), true, () => onPick("cash"))}
        {tile("pay-link", t("qr"), t("qrSub"), t("qrFee"), !why, () => onPick("link"), why)}
        {tile("pay-gift", t("giftPay"), t("giftPaySub"), t("giftPayFee"), true, () => setGift(true))}
      </div>
      <div className="cap">{t("splitNote")}</div>
      {gift && <GiftUseDrawer desk={desk} ticket={ticket} say={say} onClose={() => setGift(false)} />}
    </main>
  );
}

/* ---------- 2b. Card: reader (Rd1–Rd4) or pay link / QR (An1–An4). Server confirms with Stripe. ---------- */
function CardWait({ desk, ticket, method, onBack }: { desk: Desk; ticket: Ticket; method: "reader" | "link"; onBack: () => void }) {
  const t = useTranslations("checkout");
  const [pr, setPr] = useState<{ id: string; url?: string } | null>(null);
  const [qr, setQr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const sum = totals(ticket);
  const reader = desk.pay.readers[0];

  const start = useCallback(async () => {
    setErr(""); setPr(null);
    try {
      await saveNow({ ...ticket, tips: {} });
      const a = getActing();
      const r = await api<{ id: string; url?: string }>("/api/pay/start", { ticketId: ticket.id, method, readerId: reader?.id, by: a?.membership_id ?? desk.me.membership_id });
      setPr(r);
      if (r.url) setQr(await QRCode.toDataURL(r.url, { width: 280, margin: 1 }));
    } catch (e) { setErr((e as Error).message); }
  }, [ticket, method, reader?.id, desk.me.membership_id]);

  useEffect(() => { if (!started.current) { started.current = true; void start(); } }, [start]);

  // Ask the server every 2 s; it checks Stripe and records the payment once through.
  useEffect(() => {
    if (!pr) return;
    let stop = false;
    const name = (id: string) => desk.staff.find((s) => s.id === id)?.name ?? "";
    const tick = async () => {
      try {
        const r = await api<{ status: string; error?: string }>(`/api/pay/status?id=${pr.id}`);
        if (stop) return;
        if (r.status === "paid") { await pullTickets(desk.salonId, name, "", ticket.id); return; }
        if (r.status === "failed") { setErr(t("declined", { msg: r.error ?? "" })); setPr(null); return; }
        if (r.status === "canceled") { if (r.error) setErr(r.error); setPr(null); return; }
      } catch { /* weak internet: keep asking */ }
      if (!stop) setTimeout(tick, 2000);
    };
    const first = setTimeout(tick, 1500);
    return () => { stop = true; clearTimeout(first); };
  }, [pr, desk, ticket.id, t]);

  const simulate = async (body: { tipCents?: number; decline?: boolean }) => {
    if (!pr) return;
    setBusy(true);
    try { await api("/api/pay/simulate", { id: pr.id, ...body }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const cancel = async () => {
    const r = pr ? await api<{ status: string }>("/api/pay/cancel", { id: pr.id }).catch(() => null) : null;
    // The client paid just before Cancel: show the paid ticket instead of going back.
    if (r?.status === "paid") { await pullTickets(desk.salonId, (id) => desk.staff.find((s) => s.id === id)?.name ?? "", "", ticket.id); return; }
    onBack();
  };

  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "24px 16px", textAlign: "center" }}>
      <div className="cap">{t("ticket", { n: ticketLabel(ticket) })}{ticket.client?.name ? ` · ${ticket.client.name}` : ""}</div>
      <div className="money" style={{ fontSize: 56, lineHeight: "64px" }}>{$(sum.toPay)}</div>
      {err ? <>
        <Banner tone="bad" className="bn-narrow" data-testid="card-error">{err}</Banner>
        <div style={{ display: "flex", gap: 10 }}><Button variant="primary" onClick={() => void start()}>{t("tryAgain")}</Button><Button onClick={onBack}>{t("back")}</Button></div>
      </> : !pr ? <><div className="spin" /><b>{method === "reader" ? t("startingReader") : t("waitingPay")}</b></>
      : method === "reader" ? <>
        <div className="spin" />
        <b style={{ fontSize: 18 }} data-testid="reader-wait">{t("readerWait")}</b>
        <div className="cap">{reader?.label} · {t("readerFee")}</div>
        {reader?.simulated && <div className="demo" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <Button size="sm" disabled={busy} data-testid="sim-tap" onClick={() => void simulate({})}>{t("testTap")}</Button>
            <Button size="sm" disabled={busy} onClick={() => void simulate({ tipCents: Math.round(sum.due * 0.2) })}>{t("testTip")}</Button>
            <Button size="sm" disabled={busy} onClick={() => void simulate({ decline: true })}>{t("testDecline")}</Button>
          </div>
        </div>}
      </> : <>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR is a data: URL */}
        {qr && <img src={qr} alt={t("qr")} width={240} height={240} style={{ borderRadius: 16, background: "#fff", padding: 8 }} />}
        <b style={{ fontSize: 17 }}>{t("scanToPay")}</b>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(pr.url ?? ""); setCopied(true); }}>{copied ? t("copied") : t("copyLink")}</Button>
          <a className="btn sm ghost" href={pr.url} target="_blank" rel="noreferrer">{pr.url?.replace(/^https?:\/\//, "").slice(0, 34)}…</a>
        </div>
        <div className="cap">{t("qrFee")}</div>
        <div className="demo">{t("testCard")}</div>
        <div className="cap" style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="dot pulse" aria-hidden />{t("waitingPay")}</div>
      </>}
      {pr && <Button variant="ghost" onClick={() => void cancel()}>{t("cancelPay")}</Button>}
    </main>
  );
}

/* ---------- 3. Cash (Cs1 change, Cs2 short) ---------- */
function Cash({ desk, ticket, save, onPart }: { desk: Desk; ticket: Ticket; save: SaveFn; onPart: () => void }) {
  const t = useTranslations("checkout");
  const sum = totals(ticket);
  const staff = staffOn(ticket.lines);
  const [typed, setTyped] = useState("");
  const [tipAll, setTipAll] = useState("");
  const given = parseDollars(typed) ?? 0;
  const diff = changeCents(sum.left, given);
  const short = !typed || diff < 0;
  const quick = useMemo(() => quickCash(sum.left), [sum.left]);

  const key = (k: string) => setTyped((v) => (k === "del" ? v.slice(0, -1) : k === "." && v.includes(".") ? v : /\.\d{2}$/.test(v) ? v : (v + k).replace(/^0+(?=\d)/, "")));
  const setTip = (id: string, cents: number) => save({ tips: { ...ticket.tips, [id]: cents } });
  const received = () => {
    const a = getActing();
    save({ status: "paid", payment: { id: uuid(), method: "cash", givenCents: given, at: new Date().toISOString(), takenBy: a?.membership_id ?? desk.me.membership_id } }, true);
  };

  return (
    <main className="ck-main ck-cash">
      <section className="card ck-left" style={{ padding: "24px 28px", gap: 18 }}>
        <div className="line"><span style={{ fontSize: 17 }}>{t("due")}</span><span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{$(sum.due + sum.gift)}</span></div>
        {sum.giftPaid > 0 && <div className="line"><span>{t("giftCardPaid")}</span><span>−{$(sum.giftPaid)}</span></div>}
        {sum.cashPaid > 0 && <div className="line"><span>{t("cashPartPaid")}</span><span>−{$(sum.cashPaid)}</span></div>}
        {sum.tip > 0 && <div className="line"><span>{t("tips")}</span><span>{$(sum.tip)}</span></div>}
        <div className="line"><span style={{ fontSize: 17, fontWeight: 600 }}>{t("total")}</span><span className="money" style={{ fontSize: 28 }} data-testid="cash-total">{$(sum.left)}</span></div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("clientGave")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {quick.map((v) => <Chip key={v} on={given === v && !!typed} className="num" style={{ height: 48, justifyContent: "center" }} onClick={() => setTyped((v / 100).toFixed(v % 100 ? 2 : 0))}>{$(v).replace(/\.00$/, "")}</Chip>)}
          </div>
        </div>
        <div data-testid="change-box" data-short={short} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderRadius: 16, background: short && typed ? "var(--orange-soft)" : "var(--surface)" }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{short ? t("stillDue") : t("change")}
            {typed && short && <span className="cap" style={{ display: "block", fontWeight: 400 }}>{t("notEnough", { amount: $(given) })}</span>}</span>
          <span className="money fade" style={{ fontSize: 40, color: short && typed ? "var(--orange)" : undefined }} data-testid="change">{$(Math.abs(typed ? diff : sum.left))}</span>
        </div>
        <div className="sep" />
        <div className="ck-tips">
          <div className="eyebrow" style={{ marginBottom: 4 }}>{t("cashTips")}</div>
          <div className="cap" style={{ marginBottom: 10 }}>{t("cashTipsSub")}</div>
          <div className="group" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
            {staff.map((s) => (
              <div className="row" key={s.id}><Avatar name={s.name} /><label className="grow" htmlFor={`tip-${s.id}`}>{s.name}</label>
                <span style={{ width: 120 }}><MoneyInput id={`tip-${s.id}`} cents={ticket.tips[s.id] ?? 0} label={`${t("cashTip")} ${s.name}`} onChange={(c) => setTip(s.id, c)} /></span></div>
            ))}
          </div>
          {staff.length > 1 && <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <input className="inp" style={{ width: 120, height: 40 }} inputMode="decimal" placeholder="$0" aria-label={t("splitTip")} value={tipAll} onChange={(e) => setTipAll(e.target.value.replace(/[^\d.]/g, ""))} />
            <Button size="sm" onClick={() => { const c = parseDollars(tipAll); if (c != null) save({ tips: splitTipByPrice(c, ticket.lines) }); }}>{t("splitTip")}</Button>
          </div>}
        </div>
        <div className="cap ck-offnote">{t("offlineOk")}</div>
      </section>
      <section className="ck-keys">
        <div className="inp num ck-typed" aria-live="polite" style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 26, fontWeight: 600 }} data-testid="typed">{typed ? `$${typed}` : "$0"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
            <button key={k} type="button" className="key" aria-label={k === "del" ? t("del") : k} onClick={() => key(k)}>{k === "del" ? "⌫" : k}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {/* Split payment: less than what's owed → take it as a part; the rest is paid another way. Tips go on the last payment. */}
        {typed && short && given > 0 && <>
          <Button block data-testid="cash-part" disabled={sum.tip > 0} onClick={() => {
            const a = getActing();
            takeCashPart(ticket, given, given, a?.membership_id ?? desk.me.membership_id);
            onPart();
          }}>{t("takePart", { amount: $(given) })}</Button>
          <div className="cap">{sum.tip > 0 ? t("partNoTips") : t("partRest", { amount: $(sum.left - given) })}</div>
        </>}
        <Button variant="primary" block className="ck-pin" data-testid="cash-received" disabled={short} onClick={received}>{t("cashReceived")}</Button>
      </section>
    </main>
  );
}

/* ---------- 4. Paid + receipt ---------- */
function Done({ desk, ticket, say }: { desk: Desk; ticket: Ticket; say: (s: string) => void }) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const sum = totals(ticket);
  const staff = staffOn(ticket.lines);
  const pay = ticket.payment;
  const isCard = !!pay && pay.method !== "cash";
  const giftOnly = !pay && sum.giftPaid > 0;
  const charged = isCard ? pay.amountCents ?? sum.left : giftOnly ? 0 : sum.left;
  const fee = isCard ? pay.feeCents ?? 0 : 0;
  const given = pay?.givenCents ?? sum.left;
  const how = isCard ? (pay.brand ? `${pay.brand[0].toUpperCase()}${pay.brand.slice(1)} ••${pay.last4 ?? ""}` : t("viaLink")) : t("cash").toLowerCase();
  const [refunding, setRefunding] = useState(false);
  const newTicket = () => {
    const id = uuid();
    const a = getActing();
    putTicket({ id, salonId: desk.salonId, status: "open", createdAt: new Date().toISOString(), lines: [], tips: {}, note: "", openedBy: a?.membership_id ?? desk.me.membership_id, deviceId: desk.device?.id });
    router.push(`/checkout/${id}`);
  };

  return (
    <main className="ck-main">
      <section className="card ck-left" style={{ padding: "24px 28px", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="okmark pop" aria-hidden style={ticket.status === "refunded" ? { background: "var(--orange)" } : undefined}>{ticket.status === "refunded" ? "↩" : "✓"}</div>
          <div>
            <div className="money" data-testid="paid-total">{giftOnly ? t("paidGift", { amount: $(sum.total) }) : isCard ? t("paidBy", { amount: $(charged), how }) : t("paidCash", { amount: $(charged) })}</div>
            <div className="cap num">{t("paidLine", { services: $(sum.due), tip: $(sum.tip) })}</div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="num svc">
            <thead><tr><th>{t("staff")}</th><th className="r">{t("service")}</th><th className="r">{isCard ? t("cardTip") : t("cashTip")}</th></tr></thead>
            <tbody>{staff.map((s) => (
              <tr key={s.id}><td><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><Avatar name={s.name} />{s.name} · {ticket.lines.filter((l) => l.staffId === s.id).map((l) => l.name).join(", ")}</span></td>
                <td className="r">{$(s.cents)}</td><td className="r">{$(ticket.tips[s.id] ?? 0)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {(ticket.gifts ?? []).map((g) => (
          <div key={g.id} className="note" data-testid="gift-sold" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <b>{g.kind === "reload" ? t("giftReloaded", { last4: g.last4, amount: $(g.cents) }) : t("giftActive", { last4: g.last4, amount: $(g.cents) })}</b>
            {g.code && <span className="num" data-testid="gift-code-shown" style={{ fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: ".06em" }}>{g.code}</span>}
            {g.kind === "digital" && <span className="cap">{g.to ? t("giftTextQueued", { to: g.to.startsWith("+") ? fmtPhone(g.to) : g.to }) : t("giftWriteDown")}</span>}
          </div>
        ))}
        <div className="cap">{t("tipNote")}</div>
        <div style={{ marginTop: "auto", padding: "16px 18px", borderRadius: 16, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="eyebrow">{t("money")}</div>
          {(ticket.giftPays ?? []).map((g) => <div key={g.id} className="line"><span>{t("giftUsed", { last4: g.last4 })}</span><span>{$(g.cents)}</span></div>)}
          {(ticket.cashParts ?? []).map((c) => <div key={c.id} className="line" data-testid="cash-part-done"><span>{t("cashPartLine")}</span><span>{$(c.cents)}</span></div>)}
          {giftOnly ? null : isCard ? <>
            <div className="line"><span>{t("cardCharged")}</span><span>{$(charged)}</span></div>
            <div className="line"><span>{t("cardFee")} ({pay.method === "card_reader" ? "2.7% + 5¢" : "2.9% + 30¢"})</span><span data-testid="card-fee">−{$(fee)}</span></div>
          </> : <>
            <div className="line"><span>{t("cashTaken")}</span><span>{$(given)}</span></div>
            <div className="line"><span>{t("changeGiven")}</span><span>−{$(given - sum.left)}</span></div>
          </>}
          {sum.gift > 0 && <div className="line"><span>{t("giftOwed")}</span><span>−{$(sum.gift)}</span></div>}
          <div className="line"><span>{t("tipsToStaff")}</span><span>−{$(sum.tip)}</span></div>
          <div className="sep" />
          <div className="line" style={{ fontWeight: 600, fontSize: 16 }}><span>{t("salonKeeps")}</span><span data-testid="salon-keeps">{$(charged + sum.cashPaid - fee - sum.tip - sum.gift + sum.giftPaid)}</span></div>
          {ticket.status === "refunded" && <div className="line" data-testid="refunded" style={{ color: "#b5470a", fontWeight: 600 }}><span>{t("refunded", { amount: $(charged + sum.cashPaid) })}</span><span>−{$(charged + sum.cashPaid)}</span></div>}
        </div>
      </section>
      <section className="ck-keys" style={{ gap: 10 }}>
        <div className="h2">{t("receipt")}</div>
        <ReceiptBox desk={desk} ticket={ticket} say={say} />
        <div className="cap">{t("receiptLang")}</div>
        <div style={{ flex: 1 }} />
        {ticket.status === "paid" && <Button variant="ghost" data-testid="refund" onClick={() => setRefunding(true)}>{t("refund")}</Button>}
        <Button variant="primary" block className="ck-pin" data-testid="new-ticket" onClick={newTicket}>{t("newTicket")}</Button>
      </section>
      <PrintReceipt desk={desk} ticket={ticket} />
      {refunding && <RefundDrawer desk={desk} ticket={ticket} amount={charged + sum.cashPaid} card={isCard} onClose={() => setRefunding(false)} say={say} />}
    </main>
  );
}

/** Refund (whole ticket): owner/manager OK first (PIN on the salon device, or their own login). */
function RefundDrawer({ desk, ticket, amount, card, onClose, say }: { desk: Desk; ticket: Ticket; amount: number; card: boolean; onClose: () => void; say: (s: string) => void }) {
  const t = useTranslations("checkout");
  const [approver, setApprover] = useState<string | null>(null);
  const [ok, setOk] = useState<{ approvalId?: string; name: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const perms = useRolePerms(desk.salonId, desk.mode === "demo");
  const managers = desk.staff.filter((s) => canOk(perms, s.role, "refund"));
  const meIsAdmin = canOk(perms, desk.me.role, "refund");
  const approve = async (pin?: string) => {
    setErr("");
    if (desk.mode === "demo") return setOk({ name: managers[0]?.name ?? "Mai" });
    try {
      // Refund OK is for this ticket only and can be used once.
      const scope = { p_salon: desk.salonId, p_purpose: "refund", p_ticket: ticket.id };
      const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", pin ? { ...scope, p_device: desk.device!.id, p_membership: approver, p_pin: pin } : scope);
      if (!r.ok) return setErr((r.reason as string) === "not_manager" ? t("notManager") : pinMessage(r));
      setOk({ approvalId: r.approval_id, name: r.name ?? "" });
    } catch { setErr(t("pinOffline")); }
  };
  const refund = async () => {
    setBusy(true); setErr("");
    try {
      if (desk.mode === "live") {
        await api("/api/pay/refund", { ticketId: ticket.id, approvalId: ok?.approvalId });
        await pullTickets(desk.salonId, (id) => desk.staff.find((s) => s.id === id)?.name ?? "", "", ticket.id);
      } else putTicket({ ...ticket, status: "refunded" });
      say(t("refunded", { amount: $(amount) }));
      onClose();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <Drawer title={t("refundTitle")} onClose={onClose} footer={<Button variant="primary" block data-testid="do-refund" disabled={!ok || busy} onClick={() => void refund()}>{t("doRefund", { amount: $(amount) })}</Button>}>
      <div className="cap">{t("refundSub", { amount: $(amount), how: card ? t("refundCard") : t("refundCash") })}</div>
      <div className="eyebrow">{t("managerPin")}</div>
      {ok ? <div className="note">{t("approvedBy", { name: ok.name })}</div>
        : desk.mode === "live" && !desk.device ? (meIsAdmin ? <Button onClick={() => void approve()}>OK</Button> : <span className="hint err">{t("notManager")}</span>)
        : desk.mode === "live" && !approver ? <ListGroup>{managers.map((m) => <button key={m.id} type="button" className="opt" onClick={() => setApprover(m.id)}><Avatar name={m.name} />{m.name}<span className="cap">{ROLE_LABEL[m.role]}</span></button>)}</ListGroup>
        : <PinKeypad length={pinLenFor(approver)} error={err} onDone={(p) => void approve(p)} />}
      {err && ok && <span className="hint err">{err}</span>}
      {err && !ok && desk.mode === "live" && !desk.device && <span className="hint err">{err}</span>}
    </Drawer>
  );
}

/** Receipt as plain lines (for Bluetooth thermal printers). Client copy: no card fee (that's the salon's cost). */
function receiptDoc(desk: Desk, ticket: Ticket, t: ReturnType<typeof useTranslations>, when: string, o: PrintSettings["receipt"]): ReceiptDoc {
  const sum = totals(ticket);
  const pay = ticket.payment;
  const given = pay?.givenCents ?? sum.total;
  const rows: ReceiptDoc["rows"] = ticket.lines.map((l) => [`${l.name}${o.staff && l.staffName ? ` - ${l.staffName}` : ""}`, $(l.cents)] as [string, string]);
  if (sum.discount > 0) rows.push([t("discountLine", { reason: ticket.discount?.reason ?? "" }), `-${$(sum.discount)}`]);
  if (o.tips) for (const [id, c] of Object.entries(ticket.tips)) if (c > 0) rows.push([o.staff ? `${t("tip")} - ${ticket.lines.find((l) => l.staffId === id)?.staffName ?? ""}` : t("tip"), $(c)]);
  rows.push("sep", { bold: [t("total"), $(pay && pay.method !== "cash" ? pay.amountCents ?? sum.total : sum.total)] });
  if (pay && pay.method !== "cash") rows.push([pay.brand ? `${pay.brand.toUpperCase()} ${pay.last4 ?? ""}` : t("qr"), $(pay.amountCents ?? sum.total)]);
  else rows.push([t("cash"), $(given)], [t("change"), $(given - sum.total)]);
  if (ticket.status === "refunded") rows.push({ text: t("refunded", { amount: $(pay?.amountCents ?? sum.total) }) });
  return {
    title: desk.salonName,
    sub: [`${t("receiptFor")} ${ticketLabel(ticket)}`, when, ...(o.client && ticket.client?.name ? [ticket.client.name] : [])],
    rows,
    footer: [o.thanks || t("thanks", { name: "" }), ...(o.qr && digitalReceiptUrl(desk, ticket) ? [t("scanReceipt")] : []), "PolishOS"],
    qr: o.qr ? digitalReceiptUrl(desk, ticket) : undefined,
  };
}

/** Link to the client's digital receipt (only once the ticket is saved on the server). */
function digitalReceiptUrl(desk: Desk, ticket: Ticket): string | undefined {
  return desk.mode === "live" && ticket.number && typeof location !== "undefined" ? `${location.origin}/r/${receiptCode(ticket.id)}` : undefined;
}

/** "Print by Bluetooth" (Android Chrome, or Bluefy on iPhone/iPad): pair once, then one tap prints. */
type Sent = { kind: "print" | "text" | "email" | "none"; to?: string; at?: string; out?: ReceiptOutcome };
const maskPhone = (p: string) => maskTo("text", p);
const maskEmail = (e: string) => maskTo("email", e);
const emailOk = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/** Receipt, design C (board "Paid Screen · Receipt", Nov 26): one big Print button for the usual way, then Text · Email ·
 * No receipt. Text and Email say what's on file (••last 4, a masked email) or "+ Add …"; a tap opens a small card in place:
 * on file = the full contact + Send, else type it (a typed email fills the client's empty email, #208; a typed phone is for
 * this receipt only: client details change only in the Edit drawer).
 * "Sent for this ticket" lists what went out; printer settings fold away. */
function ReceiptBox({ desk, ticket, say }: { desk: Desk; ticket: Ticket; say: (s: string) => void }) {
  const t = useTranslations("checkout");
  const f = useFormatter();
  const p = usePrinter();
  const { settings } = usePrintSettings(desk.salonId, desk.mode === "demo");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<"text" | "email" | null>(null);
  const [other, setOther] = useState(false); // typing a contact other than the one on file
  const [typed, setTyped] = useState("");
  const [found, setFound] = useState("");
  const [sending, setSending] = useState(false);
  const [again, setAgain] = useState(false); // this way was already sent: ask before sending it twice
  const [sent, setSent] = useState<Sent[]>(() => {
    const r = ticket.receiptSent;
    if (r) return [{ kind: r.channel, to: r.to, at: r.at, out: { status: r.status, error: r.error } }];
    return ticket.receipt ? [{ kind: ticket.receipt, to: ticket.receiptTo }] : [];
  });
  const phone = ticket.client?.phone ?? "";
  const c = ticket.client;
  const email = c?.email || found; // on the ticket (pulled with the client), else from the profile
  useEffect(() => {
    if (!c || c.email) return;
    let off = false;
    const who: Who = { mode: desk.mode, salonId: desk.salonId, salonName: desk.salonName, role: desk.me.role, name: desk.me.display_name };
    void profileFor(who, c).then((pr) => { if (!off && pr?.email) setFound(pr.email); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per client
  }, [desk.salonId, c?.id, c?.phone]);

  const add = (s: Sent) => setSent((l) => [...l, { ...s, at: new Date().toISOString() }]);
  const printPc = () => { logReceipt(ticket, "print"); add({ kind: "print" }); setTimeout(() => window.print(), 50); say(t("printed")); };
  const printBt = async () => {
    setBusy(true);
    try {
      const doc = receiptDoc(desk, ticket, t, f.dateTime(new Date(ticket.payment?.at ?? ticket.createdAt), { dateStyle: "medium", timeStyle: "short" }), settings.receipt);
      await printBytes(receiptBytes(doc, p.paper), p.paper); // text = fast; accents print plain
      p.refresh();
      logReceipt(ticket, "print");
      add({ kind: "print", to: p.saved?.name });
      say(t("printed"));
    } catch (e) {
      const m = (e as Error).message;
      if (!/cancel/i.test(m)) say(/not found|no devices/i.test(m) ? t("btNone") : m);
    }
    setBusy(false);
  };
  const toggle = (k: "text" | "email") => { setOpen(open === k ? null : k); setOther(false); setTyped(""); setAgain(false); };
  // One send per tap (main's sendReceipt: sends now, or saves on the device when offline) and the result goes in the list.
  const send = async (k: "text" | "email", raw: string) => {
    const to = k === "text" ? e164(raw) : raw.trim();
    const last = [...sent].reverse().find((s) => s.kind === k);
    if (!again && last?.out && (last.out.status === "sent" || last.out.status === "queued")) { setAgain(true); return; }
    setSending(true);
    try {
      const out = await sendReceipt(ticket, k, to);
      add({ kind: k, to, out });
      setOpen(null); setOther(false); setTyped(""); setAgain(false);
    } finally { setSending(false); }
  };
  const onFile = open === "text" ? phone : open === "email" ? email : "";
  const typing = open !== null && (other || !onFile);
  const typedOk = open === "text" ? phoneOk(typed) : emailOk(typed);
  const sentLine = (s: Sent): { text: string; tone: "good" | "watch" | "bad" | "none" } => {
    if (s.kind === "print") return { text: t("rcPrinted"), tone: "good" };
    if (s.kind === "none") return { text: t("noReceipt"), tone: "good" };
    const to = s.to ? maskTo(s.kind, s.to) : "";
    if (!s.out) return { text: t(s.kind === "text" ? "rcTexted" : "rcEmailed", { to }), tone: "good" };
    const l = receiptLine(s.kind, s.out);
    return l.key === "demo" ? { text: t("rcDemo", { to }), tone: "none" } : { text: t(`rcpt.${l.key}`, { to }), tone: l.tone };
  };

  return (
    <div className="rc">
      <button type="button" className="rc-print" data-testid="print-main" disabled={busy} onClick={() => (p.ok ? void printBt() : printPc())}>
        <span className="rc-print-ic" aria-hidden><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z" /></svg></span>
        <span className="rc-print-t"><b>{busy ? t("btPrinting") : t("rcPrint")}</b>
          <span>{p.ok ? (p.saved ? `${p.saved.name} · ${p.saved.paper} mm` : t("btPair")) : t("rcPcPrinter")}</span></span>
        <span className="rc-chev" aria-hidden>›</span>
      </button>
      <div className="rc-pills">
        <button type="button" className={`rc-pill${open === "text" ? " on" : ""}${phone ? "" : " add"}`} data-testid="receipt-text" aria-expanded={open === "text"} onClick={() => toggle("text")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" /></svg>
          <b>{t("text")}</b><small className="num">{phone ? maskPhone(phone) : t("rcAddPhone")}</small>
        </button>
        <button type="button" className={`rc-pill${open === "email" ? " on" : ""}${email ? "" : " add"}`} data-testid="receipt-email" aria-expanded={open === "email"} onClick={() => toggle("email")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
          <b>{t("email")}</b><small>{email ? maskEmail(email) : t("rcAddEmail")}</small>
        </button>
        <button type="button" className="rc-pill quiet" data-testid="receipt-none" onClick={() => { logReceipt(ticket, "none"); add({ kind: "none" }); setOpen(null); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          <b>{t("noReceipt")}</b>
        </button>
      </div>
      {open && (typing ? (
        <form className="rc-card" data-testid="receipt-card" onSubmit={(e) => { e.preventDefault(); if (typedOk && !sending) void send(open, typed); }}>
          <label className="rc-field"><span>{t(open === "text" ? "rcPhoneLbl" : "rcEmailLbl")}</span>
            <input className="inp" autoFocus type={open === "text" ? "tel" : "email"} inputMode={open === "text" ? "tel" : "email"} autoComplete="off"
              placeholder={open === "text" ? "(408) 555-0142" : t("emailPh")} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          <span className="cap">{t(open === "email" && c && !email ? "rcSavesEmail" : "rcOneTime")}</span>
          <Button type="submit" variant="primary" block disabled={!typedOk || sending}>{sending ? t("rcpt.sending") : t(open === "text" ? "rcSendText" : "rcSendEmail")}</Button>
          {onFile && <button type="button" className="rc-ghost" onClick={() => setOther(false)}>{t("rcBack", { to: open === "text" ? maskPhone(onFile) : maskEmail(onFile) })}</button>}
        </form>
      ) : (
        <div className="rc-card" data-testid="receipt-card">
          <span className="rc-card-t">{t(open === "text" ? "rcTextTo" : "rcEmailTo")}</span>
          <b className="rc-to num" data-testid="receipt-to">{open === "text" ? fmtPhone(onFile) : onFile}</b>
          {c?.name && <span className="cap">{t("rcFromProfile", { name: c.name })}</span>}
          {again && <span className="cap" data-testid="receipt-again">{t("rcpt.again", { to: maskTo(open, onFile) })}</span>}
          <Button variant="primary" block data-testid="receipt-send" disabled={sending} onClick={() => void send(open, onFile)}>
            {sending ? t("rcpt.sending") : again ? t("rcpt.sendAgain") : t(open === "text" ? "rcSendText" : "rcSendEmail")}</Button>
          <button type="button" className="rc-ghost" onClick={() => { setOther(true); setTyped(""); }}>{t(open === "text" ? "rcOtherPhone" : "rcOtherEmail")}</button>
        </div>
      ))}
      {sent.length > 0 && <div className="rc-sent" data-testid="receipt-sent">
        <span className="eyebrow">{t("rcSent")}</span>
        {sent.map((s, i) => { const l = sentLine(s); return <div key={i} className="rc-sent-row" data-testid="receipt-result"><StatusIcon tone={l.tone} /><span className="grow">{l.text}</span>
          {s.at && <span className="cap num">{f.dateTime(new Date(s.at), { timeStyle: "short" })}</span>}</div>; })}
      </div>}
      {(p.ok || p.ios) && <details className="rc-prn">
        <summary>{t("rcPrinter")}</summary>
        <PrinterSetup p={p} inline />
        {p.ok && <button type="button" className="rc-ghost" data-testid="receipt-print" onClick={printPc}>{t("printWindow")}</button>}
      </details>}
    </div>
  );
}

/** Receipt for the receipt printer (80 mm): only visible when printing. */
function PrintReceipt({ desk, ticket }: { desk: Desk; ticket: Ticket }) {
  const t = useTranslations("checkout");
  const f = useFormatter();
  const { settings: { receipt: o } } = usePrintSettings(desk.salonId, desk.mode === "demo");
  const [qr, setQr] = useState("");
  const url = o.qr ? digitalReceiptUrl(desk, ticket) : undefined;
  useEffect(() => { if (url) void QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setQr); }, [url]);
  const sum = totals(ticket);
  const given = ticket.payment?.givenCents ?? sum.left;
  return (
    <div className="receipt-print" aria-hidden>
      <div style={{ textAlign: "center", fontWeight: 600, fontSize: 16 }}>{desk.salonName}</div>
      <div style={{ textAlign: "center" }}>{t("receiptFor")} {ticketLabel(ticket)} · {f.dateTime(new Date(ticket.payment?.at ?? ticket.createdAt), { dateStyle: "medium", timeStyle: "short" })}</div>
      <div style={{ textAlign: "center" }}>{o.thanks || t("thanks", { name: o.client && ticket.client?.name ? `, ${ticket.client.name}` : "" })}</div>
      <hr />
      {ticket.lines.map((l) => <div key={l.id} className="rl"><span>{l.name}{o.staff && l.staffName ? ` · ${l.staffName}` : ""}</span><span>{$(l.cents)}</span></div>)}
      {sum.discount > 0 && <div className="rl"><span>{t("discountLine", { reason: ticket.discount?.reason ?? "" })}</span><span>−{$(sum.discount)}</span></div>}
      {(ticket.gifts ?? []).map((g) => <div key={g.id}><div className="rl"><span>{g.kind === "reload" ? t("giftReload", { last4: g.last4 }) : t("giftSold", { last4: g.last4 })}</span><span>{$(g.cents)}</span></div>
        {g.code && <div style={{ fontFamily: "monospace" }}>{g.code}</div>}</div>)}
      {o.tips && Object.entries(ticket.tips).filter(([, c]) => c > 0).map(([id, c]) => <div key={id} className="rl"><span>{t("cashTip")}{o.staff ? ` · ${ticket.lines.find((l) => l.staffId === id)?.staffName ?? ""}` : ""}</span><span>{$(c)}</span></div>)}
      <hr />
      <div className="rl" style={{ fontWeight: 700 }}><span>{t("total")}</span><span>{$(sum.total)}</span></div>
      {(ticket.giftPays ?? []).map((g) => <div key={g.id} className="rl"><span>{t("giftUsed", { last4: g.last4 })}{g.balanceAfter != null ? ` (${t("giftLeft", { amount: $(g.balanceAfter) })})` : ""}</span><span>{$(g.cents)}</span></div>)}
      {!ticket.payment ? null : ticket.payment.method !== "cash"
        ? <div className="rl"><span>{ticket.payment.brand ? `${ticket.payment.brand.toUpperCase()} ••${ticket.payment.last4 ?? ""}` : t("qr")}</span><span>{$(ticket.payment.amountCents ?? sum.total)}</span></div>
        : <><div className="rl"><span>{t("cash")}</span><span>{$(given)}</span></div>
          <div className="rl"><span>{t("change")}</span><span>{$(given - sum.left)}</span></div></>}
      {qr && <div style={{ textAlign: "center", marginTop: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL */}
        <img src={qr} alt="" width={110} height={110} />
        <div>{t("scanReceipt")}</div>
      </div>}
    </div>
  );
}

/* Money box: type dollars, saved as cents on blur. */
function MoneyInput({ cents, onChange, label, id, warn }: { cents: number; onChange: (c: number) => void; label: string; id?: string; warn?: boolean }) {
  const [txt, setTxt] = useState(cents ? (cents / 100).toFixed(cents % 100 ? 2 : 0) : "");
  useEffect(() => setTxt(cents ? (cents / 100).toFixed(cents % 100 ? 2 : 0) : ""), [cents]);
  return <input id={id} className={`ed r num${warn ? " flag" : ""}`} style={{ width: 96 }} inputMode="decimal" aria-label={label} placeholder="$0" value={txt}
    onChange={(e) => setTxt(e.target.value.replace(/[^\d.]/g, ""))}
    onBlur={() => onChange(parseDollars(txt || "0") ?? 0)} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}><div className="card pad" style={{ maxWidth: 420, width: "100%", padding: 28, gap: 12 }}>{children}</div></main>;
}
