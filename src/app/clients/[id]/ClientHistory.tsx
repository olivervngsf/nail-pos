"use client";
// Client history (Client History board H1 profile + history, H2 another visit opened).
// Same page on the desk and on a tech's phone. Anyone on staff adds a note or a nail photo to a visit.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Chip, LeftMenu, OfflineBanner, SyncPill, Toast, TopBar } from "@/components/kit";
import { addNote, getProfile, isDesk, useWho, type Profile } from "@/lib/clients";
import { $, CareBox, EditDrawer, PaidWords, PhotoButton, Stats, TagChip, initials, phone, useDate } from "../ClientParts";

type F = "all" | "photos" | "notes" | "payments";

export default function ClientHistory({ id }: { id: string }) {
  const t = useTranslations("clients");
  const date = useDate();
  const { who, err } = useWho();
  const [p, setP] = useState<Profile | null>(null);
  const [open, setOpen] = useState(0);
  const [f, setF] = useState<F>("all");
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 3000); };
  const load = useCallback(async () => {
    if (!who) return;
    try { setP(await getProfile(who, id)); setLoadErr(""); } catch (e) { setLoadErr(navigator.onLine ? (e as Error).message : t("needNet")); }
  }, [who, id, t]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <main style={{ padding: 24 }}><p className="hint err">{err === "offline" ? t("needNet") : err}</p></main>;
  if (!who) return <div className="app" aria-busy="true" />;
  const desk = isDesk(who.role);
  const visits = (p?.visits ?? []).filter((v) => f === "all" || f === "payments"
    || (f === "photos" && p!.photos.some((x) => x.ticket_id === v.ticket_id)) || (f === "notes" && p!.notes_log.some((n) => n.ticket_id === v.ticket_id)));
  const save = async (ticketId: string | null) => {
    if (!p || !note.trim()) return;
    try { await addNote(who, p, note, ticketId); setNote(""); say(t("noteSaved")); void load(); } catch (e) { say(navigator.onLine ? (e as Error).message : t("needNet")); }
  };

  return (
    <div className="app cl-app">
      {desk && <LeftMenu active="Clients" salonInitials={initials(who.salonName)} me={who.name[0]} />}
      <div className="col">
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Link className="btn ghost sm" href="/clients">‹ {t("title")}</Link>{p?.name ?? ""}</span>}>
          <SyncPill />
          {desk && <span className="cl-wideonly"><Button size="sm" disabled title={t("bookLater")}>{t("bookAgain")}</Button></span>}
        </TopBar>
        <OfflineBanner />
        {who.mode === "demo" && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        {loadErr && <p className="hint err" style={{ padding: 24 }}>{loadErr}</p>}
        {p && <main className="ch-main">
          <section className="ch-left">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="av lg">{initials(p.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="h2">{p.name || phone(p.phone)}</div>
                <div className="cap num">{[phone(p.phone), p.email].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <TagChip tag={p.tag} />{p.usual_service && <span className="tag">{p.usual_service}</span>}{p.usual_staff && <span className="tag">{t("usually", { name: p.usual_staff })}</span>}
              <span className="tag">{t("since", { date: date(p.since, true) })}</span>
            </div>
            <div className="cap">{t("textsLang", { texts: p.texts_ok ? t("yes") : t("no"), lang: p.language === "vi" ? "Tiếng Việt" : "English" })}</div>
            <Stats p={p} />
            <CareBox care={p.care} />
            <div className="card cl-box">
              <div style={{ display: "flex", alignItems: "center" }}><b style={{ flex: 1 }}>{t("notesStaff")}</b>{desk && <Button size="sm" variant="ghost" onClick={() => setEdit(true)} data-testid="client-edit">{t("edit")}</Button>}</div>
              <div style={{ fontSize: 14 }}>{[p.notes, p.shape && `${t("shape")}: ${p.shape}`, p.colors && `${t("colors")}: ${p.colors}`].filter(Boolean).join(" · ") || <span className="cap">{t("noNotes")}</span>}</div>
            </div>
            {p.gift_cards.map((g) => <div key={g.last4} className="card cl-box" style={{ flexDirection: "row", alignItems: "center" }}><b style={{ flex: 1 }}>{t("giftCard", { last4: g.last4 })}</b><b className="num">{$(Number(g.balance_cents))}</b></div>)}
            <div className="card cl-box"><b>{t("next")}</b><span className="cap">{t("nextNone")}</span></div>
          </section>
          <section className="ch-right">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["all", "photos", "notes", "payments"] as F[]).map((x) => <Chip key={x} on={f === x} onClick={() => setF(x)}>{t(`h_${x}`)}</Chip>)}
            </div>
            <div className="cap">{t("visitsCount", { n: p.visits.length })}</div>
            <div className="group" data-testid="visits">
              {visits.map((v, i) => {
                const photos = p.photos.filter((x) => x.ticket_id === v.ticket_id);
                const notes = p.notes_log.filter((n) => n.ticket_id === v.ticket_id);
                const staff = [...new Set((v.services ?? []).map((s) => s.staff).filter(Boolean))].join(", ");
                const mins = (v.services ?? []).reduce((a, s) => a + (s.minutes ?? 0), 0);
                return (
                  <div key={v.ticket_id}>
                    <button type="button" className="ch-vr" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)} data-testid="visit-row">
                      <span className="ch-d">{date(v.at)}</span>
                      <span className="av">{staff ? initials(staff) : "?"}</span>
                      <span className="ch-g"><b>{(v.services ?? []).map((s) => s.name).join(" + ") || t("giftOnly")}</b>
                        <span className="cap">{[staff, mins ? t("min", { n: mins }) : null, photos.length ? t("nPhotos", { n: photos.length }) : null, v.status === "refunded" ? t("refunded") : null].filter(Boolean).join(" · ")}</span></span>
                      <span className="ch-m">{$(Number(v.total))}<span className="cap" style={{ display: "block", fontWeight: 400 }}>{Number(v.tip) ? t("tipShort", { amount: $(Number(v.tip)) }) : ""}</span></span>
                    </button>
                    {open === i && <div className="ch-vx fade" data-testid="visit-open">
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {photos.map((ph) => (
                          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                          <img key={ph.id} src={ph.url} alt={t("photoAlt", { date: date(ph.at) })} className="ch-ph" />))}
                        <PhotoButton who={who} p={p} ticketId={v.ticket_id} onDone={() => void load()} say={say} />
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                        {notes.map((n) => <div key={n.id}><b>{t("noteBy", { name: n.by ?? "" })}</b><div style={{ fontSize: 14 }}>{n.body}</div></div>)}
                        <div style={{ display: "flex", gap: 6 }}>
                          <input className="inp" style={{ height: 40 }} placeholder={t("notePh")} aria-label={t("addNote")} value={note} onChange={(e) => setNote(e.target.value)} data-testid="note-input"
                            onKeyDown={(e) => e.key === "Enter" && void save(v.ticket_id)} />
                          <Button size="sm" disabled={!note.trim()} onClick={() => void save(v.ticket_id)} data-testid="note-save">{t("addNote")}</Button>
                        </div>
                        <div className="cap"><b>{t("paid")}</b> · {(v.services ?? []).map((s) => `${s.name} ${$(Number(s.cents))}`).join(" + ")} · <PaidWords v={v} /></div>
                      </div>
                    </div>}
                  </div>
                );
              })}
              {!visits.length && <div className="cap" style={{ padding: 16 }}>{t("noVisits")}</div>}
            </div>
            {p.notes_log.filter((n) => !n.ticket_id).map((n) => <div key={n.id} className="card cl-box"><b>{t("noteBy", { name: n.by ?? "" })} · {date(n.at)}</b><div style={{ fontSize: 14 }}>{n.body}</div></div>)}
          </section>
        </main>}
      </div>
      {edit && p && <EditDrawer who={who} p={p} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); say(t("saved")); void load(); }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
