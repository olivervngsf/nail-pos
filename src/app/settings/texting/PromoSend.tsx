"use client";
// Promo send with cost check (Text Credits board "All · Cost check before every send"). TEST VERSION: the send is recorded
// and credit is taken, but no text goes out until the salon has its own texting number (A2P 10DLC).
// Shows people × parts × 2¢ and credit before → after; one switch takes the Vietnamese accents off (cheaper).
// Never sends half: not enough credit → blocked with Add credit.
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, Drawer, Switch } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { sendCost, stripAccents, textParts, type Audience, type Credit } from "@/lib/texting/credit";

type Props = {
  credit: Credit;
  loadAudience: () => Promise<Audience | null>;
  send: (p: { id: string; message: string; audience: "all" | "lapsed" }) => Promise<{ people: number; cents: number }>;
  onClose: () => void;
  onAddCredit: () => void;
  onSent: (people: number, cents: number) => void;
};

export default function PromoSend({ credit, loadAudience, send, onClose, onAddCredit, onSent }: Props) {
  const t = useTranslations("promo");
  const [aud, setAud] = useState<Audience | null>(null);
  const [who, setWho] = useState<"all" | "lapsed">("all");
  const [draft, setDraft] = useState("");
  const [plain, setPlain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [id] = useState(() => crypto.randomUUID());   // one id per send: a double tap or retry is applied once
  useEffect(() => { void loadAudience().then(setAud).catch(() => setErr(t("noNet"))); }, [loadAudience, t]);

  const message = plain ? stripAccents(draft) : draft;
  const people = aud ? aud[who] : 0;
  const cost = useMemo(() => sendCost(people, message.trim()), [people, message]);
  const info = textParts(message.trim());
  const accentCost = sendCost(people, stripAccents(draft.trim()));
  const save = !info.plain && cost.cents > accentCost.cents ? cost.cents - accentCost.cents : 0;
  const after = credit.balanceCents - cost.cents;
  const short = after < 0;
  const ready = !!aud && people > 0 && message.trim().length > 0 && message.length <= 480;

  const go = async () => {
    setBusy(true); setErr("");
    try { const r = await send({ id, message: message.trim(), audience: who }); onSent(r.people, r.cents); }
    catch (e) { setErr((e as Error).message || t("failed")); }
    finally { setBusy(false); }
  };

  return (
    <Drawer title={t("title")} onClose={onClose} footer={
      short && ready
        ? <><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" style={{ flex: 1 }} onClick={onAddCredit} data-testid="promo-add-credit">{t("addCredit")}</Button></>
        : <><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" style={{ flex: 1 }} disabled={!ready || busy} onClick={() => void go()} data-testid="promo-send">
            {ready ? t("sendBtn", { n: people, money: formatCents(cost.cents) }) : t("sendIdle")}</Button></>
    }>
      <div className="demo">{t("testNote")}</div>
      <div>
        <span className="lbl">{t("who")}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip on={who === "all"} onClick={() => setWho("all")} data-testid="promo-all">{t("all", { n: aud?.all ?? "…" })}</Chip>
          <Chip on={who === "lapsed"} onClick={() => setWho("lapsed")} data-testid="promo-lapsed">{t("lapsed", { n: aud?.lapsed ?? "…" })}</Chip>
        </div>
        {aud && <p className="hint">{t("saidNo", { n: aud.saidNo })}</p>}
      </div>
      <div>
        <label className="lbl" htmlFor="promo-msg">{t("message")}</label>
        <textarea id="promo-msg" className="inp" rows={4} maxLength={480} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={t("placeholder")} style={{ height: "auto", padding: "10px 12px", resize: "vertical" }} data-testid="promo-msg" />
        <p className="hint" data-testid="promo-parts">{info.letters ? t(info.plain ? "partsPlain" : "partsAccents", { n: info.letters, parts: info.parts }) : t("partsHint")}</p>
      </div>
      {plain && draft && <div className="bubble" style={{ whiteSpace: "pre-line" }}>{message}</div>}
      <div className="group">
        <div className="row s"><span className="g">{t("noAccents")}<span className="cap">{t("noAccentsSub")}</span></span>
          <Switch label={t("noAccents")} on={plain} onChange={setPlain} /></div>
      </div>
      <div className="card pad" style={{ background: "var(--surface)", boxShadow: "none", gap: 8 }} data-testid="promo-cost">
        <div className="eyebrow">{t("costTitle")}</div>
        <div className="line"><span>{t("people")}</span><b>{people.toLocaleString("en-US")}</b></div>
        <div className="line"><span>{t("parts")}</span><b>{cost.parts}</b></div>
        <div className="line"><span>{t("texts")}</span><b>{cost.texts.toLocaleString("en-US")}</b></div>
        <div className="sep" />
        <div className="line" style={{ fontSize: 17 }}><span>{t("thisSend")}</span><b data-testid="promo-total">{formatCents(cost.cents)}</b></div>
        <div className="line"><span>{t("beforeAfter")}</span><b style={{ color: short ? "var(--red)" : undefined }}>{formatCents(credit.balanceCents)} → {formatCents(after)}</b></div>
        {save > 0 && !plain && <div className="cap" style={{ color: "#1F7A33", fontWeight: 600 }}>{t("save", { money: formatCents(save) })}</div>}
        {short && ready && <div className="hint err" role="alert" data-testid="promo-short">{t("short", { money: formatCents(-after) })}</div>}
      </div>
      {err && <p className="hint err" role="alert">{err}</p>}
    </Drawer>
  );
}
