"use client";
// Client profile, version D (design "Clients · 4 variations", Nov 17): header (masked phone, Show for owner/manager,
// Edit on hover), 3 next-step cards, care note (whole salon) + private note (owner/manager), last visits, nail photos.
// Desk: right side of /clients. Phone: /clients/[id] (D3) with a fixed bottom bar.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer } from "@/components/kit";
import { NEW_FOR, birthdayIn, dueBack, isDesk, last4, phoneViewed, setCare, setPrivate, type Profile, type Who } from "@/lib/clients";
import { dayKey } from "@/lib/booking/grid";
import { $, PhotoButton, TagChip, canEditClient, initials, phone, useDate } from "./ClientParts";

type Props = { who: Who; p: Profile; reload: () => void; say: (s: string) => void; onEdit: () => void; onHistory?: () => void; phoneBar?: boolean };

export function ClientProfile({ who, p, reload, say, onEdit, onHistory, phoneBar }: Props) {
  const t = useTranslations("clients");
  const date = useDate();
  const router = useRouter();
  const [showPh, setShowPh] = useState(false);
  const [note, setNote] = useState<"care" | "private" | null>(null);
  const desk = isDesk(who.role);
  /** A ticket is tied to its client by phone: no phone on file → no "for this client" ticket (would open as a walk-in). */
  const canTicket = desk && !!p.phone;
  const canEdit = canEditClient(who);
  const due = dueBack(p.stats.gap_days, p.stats.last_visit);
  const bday = birthdayIn(p.birthday);
  const gift = p.gift_cards.find((g) => Number(g.balance_cents) > 0);
  const staff = p.usual_staff;
  const bookHref = `/calendar?view=day&d=${dayKey(due && due.inDays > 0 ? due.on : new Date())}`;
  const newTicket = () => {
    try { sessionStorage.setItem(NEW_FOR, JSON.stringify(p.phone ? { phone: p.phone, name: p.name } : null)); } catch { /* private mode */ }
    router.push("/checkout?new=1");
  };
  const toggleShow = async () => {
    if (!showPh) { try { await phoneViewed(who, p); } catch (e) { return say((e as Error).message); } }
    setShowPh(!showPh);
  };
  const wk = p.stats.gap_days ? Math.max(1, Math.round(p.stats.gap_days / 7)) : null;
  const historyLink = onHistory
    ? <Button variant="ghost" size="sm" onClick={onHistory} data-testid="open-history">{t("history")}</Button>
    : <Link className="btn ghost sm" href={`/clients/${p.id}`} data-testid="open-history">{t("history")}</Link>;

  // Next steps: due back (book), birthday (text), gift card / points (use at checkout). Only the ones that apply.
  const cards: { tag: string; tone: "warn" | "jade" | ""; title: string; cap: string; btn: React.ReactNode }[] = [];
  if (due && wk && p.stats.last_visit) cards.push({
    tag: due.inDays > 0 ? t("dueIn", { n: due.inDays }) : due.inDays === 0 ? t("dueToday") : t("late", { n: -due.inDays }),
    tone: due.inDays <= 7 ? "warn" : "", title: t("everyLast", { n: wk, date: date(p.stats.last_visit) }), cap: staff ? t("usuallyWith", { name: staff }) : "",
    btn: desk ? <Link className="btn" href={bookHref} data-testid="next-book">{staff ? t("bookWith", { name: staff }) : t("book")}</Link> : null,
  });
  if (bday !== null && bday <= 30) cards.push({
    tag: t("bdayTag", { date: date(p.birthday) }), tone: "", title: t("bdayIn", { n: bday }), cap: p.texts_ok ? t("saidYes") : t("saidNo"),
    btn: desk ? <Button disabled title={t("textsLater")}>{t("sendBday")}</Button> : null,
  });
  if (gift) cards.push({
    tag: t("giftTag", { amount: $(Number(gift.balance_cents)) }), tone: "jade", title: t("giftLine", { last4: gift.last4 }), cap: p.points ? t("pointsLine", { n: p.points }) : "",
    btn: canTicket ? <Button onClick={newTicket}>{t("useAtCheckout")}</Button> : null,
  });
  else if (p.points) cards.push({ tag: t("pointsTag", { n: p.points }), tone: "jade", title: t("pointsLine", { n: p.points }), cap: "", btn: canTicket ? <Button onClick={newTicket}>{t("useAtCheckout")}</Button> : null });

  const photos = p.photos;
  const likes = [staff, p.shape, p.colors].filter(Boolean).join(" · ");
  return (
    <div className={`cl2 fade ${phoneBar ? "cl2-phone" : ""}`} data-testid="client-panel">
      <div className="card cl2-head">
        <span className="av lg">{initials(p.name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cl2-name"><span className="h1">{p.name || `••${last4(p.phone)}`}</span><TagChip tag={p.tag} /></div>
          <div className="cap num cl2-sub">
            {p.number ? <span className="cl2-no" data-testid="client-number">{t("clientNo", { n: p.number })}</span> : null}
            <span data-testid="client-phone">{showPh ? phone(p.phone) : p.phone ? t("phoneMasked", { last4: last4(p.phone) }) : ""}</span>
            {p.can_edit && p.phone && <button type="button" className="cl2-lock" onClick={() => void toggleShow()} title={t("lockShow")} data-testid="phone-show">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
              {showPh ? t("hide") : t("show")}</button>}
            <span><span className="cl2-sep">· </span>{t("since", { date: String(new Date(p.since).getFullYear()) })}{p.texts_ok ? ` · ${t("textsYes")}` : ""}</span>
          </div>
        </div>
        <div className="cl2-kpis">
          <div><b className="num">{$(Number(p.stats.spent)).replace(/\.00$/, "")}</b><span className="cap">{t("spentVisits", { n: p.stats.visits })}</span></div>
          <div><b className="num">{wk ? t("weeks", { n: wk }) : "—"}</b><span className="cap">{p.tag === "lost" ? t("sCameEvery") : t("sEvery")}</span></div>
        </div>
        {canEdit && <Button className="cl2-edit" onClick={onEdit} data-testid="client-edit" aria-label={t("edit")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
          <span className="cl2-wide">{t("edit")}</span></Button>}
        {desk && <Button variant="primary" className="cl2-wide" onClick={newTicket} disabled={!canTicket} title={canTicket ? undefined : t("needPhone")} data-testid="client-ticket">{t("newTicket")}</Button>}
      </div>

      {cards.length > 0 && <>
        <div className="eyebrow">{t("nextSteps")}</div>
        <div className="cl2-acts" data-testid="next-steps">
          {cards.map((c) => (
            <div key={c.tag} className="cl2-act">
              <span className={`tag ${c.tone === "jade" ? "jade" : ""} ${c.tone === "warn" ? "cl-lost" : ""}`}>{c.tag}</span>
              <b className="cl2-act-t">{c.title}</b>
              <span className="cap cl2-act-c">{c.cap}</span>
              {c.btn}
            </div>
          ))}
        </div>
      </>}

      <div className={`cl2-strip ${p.care ? "cl2-care" : "cl2-nocare"}`} data-testid="client-care">
        {p.care ? <span className="cl2-strip-t"><b>{t("care")}:</b> {p.care}{p.care_by ? <span className="cap"> · {t("careBy", { name: p.care_by, date: date(p.care_at ?? null) })}</span> : null}</span>
          : <span className="cl2-strip-t cap">{t("noCare")}</span>}
        {likes && <span className="cap cl2-wide">{t("likes")}: {likes}</span>}
        <Button variant="ghost" size="sm" onClick={() => setNote("care")} data-testid="care-note">{t("plusNote")}</Button>
      </div>
      {p.can_edit && <div className="cl2-strip cl2-priv" data-testid="client-private">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", color: "var(--ink-soft)" }}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
        {p.private_note ? <span className="cl2-strip-t"><b>{t("privateLabel")}:</b> {p.private_note.body}<span className="cap"> · {t("careBy", { name: p.private_note.by ?? "", date: date(p.private_note.at) })}</span></span>
          : <span className="cl2-strip-t cap">{t("noPrivate")}</span>}
        <span className="tag cl2-wide" style={{ background: "var(--paper)" }}>{t("ownerOnly")}</span>
        <Button variant="ghost" size="sm" onClick={() => setNote("private")} data-testid="private-note">{t("plusNote")}</Button>
      </div>}
      {p.notes && <div className="cap" style={{ fontSize: 13 }}><b style={{ color: "var(--ink)" }}>{t("notes")}</b> · {p.notes}</div>}

      <div className="cl2-grid">
        <div className="card cl-box">
          <div className="cl2-card-h"><b>{t("lastVisits")}</b>{historyLink}</div>
          {p.visits.slice(0, 4).map((v) => {
            const who2 = [...new Set((v.services ?? []).map((s) => s.staff).filter(Boolean))].join(", ");
            return <div key={v.ticket_id} className="cl-visit"><span className="cap num" style={{ width: 52 }}>{date(v.at)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{(v.services ?? []).map((s) => s.name).join(" + ") || t("giftOnly")}{who2 && <span className="cap"> · {who2}</span>}</span>
              {Number(v.tip) > 0 && <span className="cap num">{t("tipShort", { amount: $(Number(v.tip)) })}</span>}
              <span className="num" style={{ minWidth: 56, textAlign: "right", fontWeight: 500 }}>{$(Number(v.total))}</span></div>;
          })}
          {!p.visits.length && <div className="cap">{t("noVisits")}</div>}
        </div>
        <div className="card cl-box">
          <div className="cl2-card-h"><b>{t("photos")} <span className="cap">· {photos.length}</span></b><PhotoButton who={who} p={p} ticketId={null} onDone={reload} say={say} /></div>
          {photos.length ? <div className="cl2-photos">
            {photos.slice(0, photos.length > 4 ? 3 : 4).map((ph) => (
              // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
              <img key={ph.id} src={ph.url} alt={t("photoAlt", { date: date(ph.at) })} className="cl2-photo" />))}
            {photos.length > 4 && <Link className="cl2-photo cl2-more" href={`/clients/${p.id}?view=history#photos`} data-testid="more-photos">{t("moreN", { n: photos.length - 3 })}</Link>}
          </div> : <div className="cap">{t("noPhotos")}</div>}
        </div>
      </div>

      {phoneBar && desk && <div className="cl2-pbar">
        <Button disabled title={t("textsLater")}>{t("text")}</Button>
        <Link className="btn" href={bookHref}>{t("book")}</Link>
        <Button variant="primary" onClick={newTicket} disabled={!canTicket} title={canTicket ? undefined : t("needPhone")}>{t("newTicket")}</Button>
      </div>}

      {note && <NoteDrawer kind={note} who={who} p={p} onClose={() => setNote(null)} onSaved={() => { setNote(null); say(t("saved")); reload(); }} />}
    </div>
  );
}

/** Care note (any staff) or private note (owner / manager). One text box, one job. */
function NoteDrawer({ kind, who, p, onClose, onSaved }: { kind: "care" | "private"; who: Who; p: Profile; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("clients");
  const [v, setV] = useState(kind === "care" ? p.care : (p.private_note?.body ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setBusy(true); setErr("");
    try { await (kind === "care" ? setCare(who, p, v) : setPrivate(who, p, v)); onSaved(); }
    catch (e) { setErr(navigator.onLine ? (e as Error).message : t("needNet")); setBusy(false); }
  };
  return (
    <Drawer title={kind === "care" ? t("careTitle") : t("privateTitle")} onClose={onClose}
      footer={<Button variant="primary" block disabled={busy} onClick={() => void save()} data-testid="note-drawer-save">{t("save")}</Button>}>
      <div className="cap">{kind === "care" ? t("careWho") : t("privateWho")}</div>
      <textarea className="inp" rows={4} style={{ height: "auto", padding: 12 }} aria-label={kind === "care" ? t("careTitle") : t("privateTitle")}
        placeholder={kind === "care" ? t("carePh") : ""} value={v} onChange={(e) => setV(e.target.value)} maxLength={kind === "care" ? 500 : 1000} data-testid="note-drawer-input" />
      {err && <div className="hint err">{err}</div>}
    </Drawer>
  );
}
