"use client";
// Checkout · gift cards (Loyalty + Gift Cards board: GiftSell G3–G5 + G17, GiftUse G7–G9; Checkout Tk6).
// Sell: new digital (code made by the server), new plastic (scan a blank card), or add money to a card.
// Use: scan / type a code or find by the client's phone → checks → use part or all of it.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, Drawer, Field } from "@/components/kit";
import { e164 } from "@/lib/auth";
import { formatCents, parseDollars } from "@/lib/money";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { getActing, type Desk } from "@/lib/desk";
import { giftFind, giftLookup, giftPrepareDigital, giftUse, type GiftCard, type GiftResult } from "@/lib/checkout/gift";
import { totals, type GiftSale, type Ticket } from "@/lib/checkout/ticket";

const $ = formatCents;
const AMOUNTS = [2500, 5000, 10000];

/** Dark card face: last 4, balance, who bought it. */
export function CardFace({ card }: { card: GiftCard }) {
  const t = useTranslations("gift");
  return (
    <div className="gcard fade" data-testid="gift-card">
      <div style={{ display: "flex", justifyContent: "space-between" }}><span className="cap" style={{ color: "#D1D1D6" }}>{t(`kind_${card.kind}`)}</span><span className="num">•••• {card.last4}</span></div>
      <div><div className="cap" style={{ color: "#D1D1D6" }}>{t("balance")}</div><div className="money" style={{ color: "#fff" }} data-testid="gift-balance">{$(card.balanceCents)}</div></div>
      <div className="cap" style={{ color: "#D1D1D6" }}>{[card.buyer && t("boughtBy", { name: card.buyer }), card.sentTo && t("sentTo", { to: card.sentTo.startsWith("+") ? fmtPhone(card.sentTo) : card.sentTo }), t("noExpiry")].filter(Boolean).join(" · ")}</div>
    </div>
  );
}

/** Plain words for a refused card. */
function Refused({ r }: { r: GiftResult }) {
  const t = useTranslations("gift");
  const key = r.reason ?? "not_found";
  return (
    <div className="banner" role="alert" data-testid="gift-refused" style={{ background: "var(--orange-soft)", color: "#8a3a0a", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <b>{t(`no_${key}` as "no_not_found")}</b>
      <span style={{ fontSize: 14 }}>{t(`noWhy_${key}` as "noWhy_not_found", { last4: r.card?.replacedByLast4 ?? "" })}</span>
    </div>
  );
}

/** Code box + Find by phone. Calls back with what was found. */
function FindCard({ desk, ticket, onFound, want }: { desk: Desk; ticket: Ticket; want: "use" | "plastic" | "reload"; onFound: (r: GiftResult | null) => void }) {
  const t = useTranslations("gift");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState(ticket.client?.phone ? fmtPhone(ticket.client.phone) : "");
  const [list, setList] = useState<GiftResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const look = async () => {
    setBusy(true); setErr(""); setList(null);
    try { onFound(await giftLookup(desk, code)); } catch (e) { setErr(navigator.onLine ? (e as Error).message : t("needNet")); }
    setBusy(false);
  };
  const byPhone = async () => {
    setBusy(true); setErr(""); onFound(null);
    try { setList(await giftFind(desk, e164(phone))); } catch (e) { setErr(navigator.onLine ? (e as Error).message : t("needNet")); }
    setBusy(false);
  };
  return <>
    <div className="eyebrow">{want === "plastic" ? t("scanBlank") : t("scanOrType")}</div>
    <div style={{ display: "flex", gap: 8 }}>
      <input className="inp" data-testid="gift-code" aria-label={t("code")} placeholder={want === "plastic" ? "6012 3456 7890 0147" : "MAIN-7K3Q-9XPA-2T4F"} autoCapitalize="characters" autoComplete="off"
        value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && code.trim() && void look()} />
      <Button data-testid="gift-look" style={{ whiteSpace: "nowrap" }} disabled={busy || code.replace(/\W/g, "").length < 8} onClick={() => void look()}>{t("lookUp")}</Button>
    </div>
    {want !== "plastic" && <>
      <div className="eyebrow">{t("orPhone")}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="inp" inputMode="tel" aria-label={t("phone")} placeholder="(408) 555-0199" value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} />
        <Button disabled={busy || !phoneOk(phone)} data-testid="gift-phone" onClick={() => void byPhone()}>{t("find")}</Button>
      </div>
      {list && (list.length ? <div className="group">{list.map((r) => (
        <button key={r.card!.id} type="button" className="opt" onClick={() => { setList(null); onFound(r); }}>
          <span className="num">•••• {r.card!.last4}</span><span className="grow cap">{t(`st_${r.card!.status}`)}</span><b className="num">{$(r.card!.balanceCents)}</b>
        </button>))}</div> : <div className="cap">{t("noneForPhone")}</div>)}
    </>}
    {err && <div className="hint err">{err}</div>}
  </>;
}

/* ---------- Sell a gift card / add money ---------- */
export function GiftSellDrawer({ desk, ticket, onAdd, onClose }: { desk: Desk; ticket: Ticket; onAdd: (g: GiftSale) => void; onClose: () => void }) {
  const t = useTranslations("gift");
  const [kind, setKind] = useState<GiftSale["kind"]>("digital");
  const [amt, setAmt] = useState(5000);
  const [custom, setCustom] = useState("");
  const [to, setTo] = useState("");
  const [from, setFrom] = useState(ticket.client?.name ?? "");
  const [msg, setMsg] = useState("");
  const [found, setFound] = useState<GiftResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const cents = custom ? parseDollars(custom) ?? 0 : amt;
  const cardOk = kind === "digital" || (kind === "plastic" ? found?.reason === "not_sold" : !!found?.card && ["active", "used_up"].includes(found.card.status));
  const ready = cents >= 100 && cardOk && !ticket.gifts?.some((g) => g.cardId === found?.card?.id);

  const add = async () => {
    setBusy(true); setErr("");
    try {
      if (kind === "digital") {
        const toNorm = phoneOk(to) ? e164(to) : to.trim();
        const r = await giftPrepareDigital(desk, toNorm, from, msg);
        onAdd({ id: crypto.randomUUID(), cardId: r.id, last4: r.last4, kind, cents, to: toNorm || undefined, from: from || undefined, message: msg || undefined, code: r.code });
      } else {
        onAdd({ id: crypto.randomUUID(), cardId: found!.card!.id, last4: found!.card!.last4, kind, cents });
      }
    } catch (e) { setErr(navigator.onLine ? (e as Error).message : t("needNet")); setBusy(false); }
  };

  return (
    <Drawer title={t("sellTitle")} onClose={onClose} footer={<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Button variant="primary" block data-testid="gift-add" disabled={!ready || busy} onClick={() => void add()}>{kind === "reload" ? t("addMoney", { amount: $(cents) }) : t("addCard", { amount: $(cents) })}</Button>
      <span className="cap">{t("activeWhenPaid")}</span>
    </div>}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["digital", "plastic", "reload"] as const).map((k) => <Chip key={k} on={kind === k} data-testid={`gift-kind-${k}`} onClick={() => { setKind(k); setFound(null); }}>{t(`sell_${k}`)}</Chip>)}
      </div>
      <div className="eyebrow">{t("amount")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {AMOUNTS.map((a) => <Chip key={a} on={!custom && amt === a} className="num" onClick={() => { setAmt(a); setCustom(""); }}>{$(a).replace(/\.00$/, "")}</Chip>)}
        <input className="inp num" style={{ width: 110, height: 40 }} inputMode="decimal" placeholder={t("custom")} aria-label={t("custom")} value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} />
      </div>
      {kind === "digital" && <>
        <Field label={t("sendTo")} id="gto" placeholder={t("sendToPh")} value={to} onChange={(e) => setTo(/^[\d(]/.test(e.target.value) ? fmtPhone(e.target.value) : e.target.value)} />
        <Field label={t("from")} id="gfrom" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field label={t("message")} id="gmsg" maxLength={120} placeholder={t("messagePh")} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="cap">{t("digitalNote")}</div>
      </>}
      {kind !== "digital" && <FindCard desk={desk} ticket={ticket} want={kind} onFound={setFound} />}
      {found?.card && (kind === "plastic"
        ? (found.reason === "not_sold" ? <div className="note" data-testid="gift-blank">{t("blankOk", { last4: found.card.last4 })}</div> : <Refused r={{ ...found, reason: found.reason ?? "already_sold" }} />)
        : ["active", "used_up"].includes(found.card.status) ? <><CardFace card={found.card} /><div className="cap num">{t("afterAdd", { amount: $(found.card.balanceCents + cents) })}</div></> : <Refused r={found} />)}
      {found && !found.card && <Refused r={found} />}
      {err && <div className="hint err">{err}</div>}
      <div className="cap">{t("saleRules")}</div>
    </Drawer>
  );
}

/* ---------- Pay with a gift card ---------- */
export function GiftUseDrawer({ desk, ticket, onClose, say }: { desk: Desk; ticket: Ticket; onClose: () => void; say: (s: string) => void }) {
  const t = useTranslations("gift");
  const sum = totals(ticket);
  const [found, setFound] = useState<GiftResult | null>(null);
  const [use, setUse] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const card = found?.ok ? found.card! : null;
  const max = card ? Math.min(card.balanceCents, sum.left) : 0;
  const pick = (r: GiftResult | null) => { setFound(r); setErr(""); if (r?.ok && r.card) setUse(Math.min(r.card.balanceCents, sum.left)); };
  const step = (d: number) => setUse((u) => Math.max(100, Math.min(max, u + d)));

  const apply = async () => {
    if (!card) return;
    setBusy(true); setErr("");
    try {
      const a = getActing();
      const why = await giftUse(desk, ticket, card, use, a?.membership_id ?? desk.me.membership_id);
      if (why) { setFound({ ok: false, reason: why, card }); setBusy(false); return; }
      say(t("used", { amount: $(use), last4: card.last4 }));
      onClose();
    } catch (e) { setErr(navigator.onLine ? (e as Error).message : t("needNet")); setBusy(false); }
  };

  return (
    <Drawer title={t("useTitle")} onClose={onClose} footer={card ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Button variant="primary" block data-testid="gift-use" disabled={busy || use <= 0} onClick={() => void apply()}>{t("useAmount", { amount: $(use) })}</Button>
      <span className="cap num">{t("leftToPay", { amount: $(sum.left - use) })}</span>
    </div> : undefined}>
      <FindCard desk={desk} ticket={ticket} want="use" onFound={pick} />
      {found && !found.ok && <Refused r={found} />}
      {card && <>
        <CardFace card={card} />
        <div className="eyebrow">{t("useOnTicket")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button aria-label="−$5" onClick={() => step(-500)}>−</Button>
          <span className="money num" style={{ minWidth: 120, textAlign: "center" }} data-testid="gift-use-amt">{$(use)}</span>
          <Button aria-label="+$5" onClick={() => step(500)}>+</Button>
        </div>
        <div className="cap num">{t("leftOnCard", { amount: $(card.balanceCents - use) })}</div>
      </>}
      {err && <div className="hint err">{err}</div>}
      <div className="cap">{t("useRules")}</div>
    </Drawer>
  );
}
