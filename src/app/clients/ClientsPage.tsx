"use client";
// Clients (Main Screens · Clients C1 list, C2 lost regulars). Desk + owner: list with filters, profile on the right.
// Phone (tech or small screen): list only, tap → full history.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, LeftMenu, OfflineBanner, SyncPill, Toast, TopBar } from "@/components/kit";
import { getProfile, isDesk, listClients, useWho, type ClientFilter, type ClientList, type Profile } from "@/lib/clients";
import { $, CareBox, EditDrawer, PhotoButton, Stats, TagChip, initials, phone, useDate } from "./ClientParts";

const FILTERS: ClientFilter[] = ["all", "regular", "lost", "new", "bday", "gift"];

export default function ClientsPage() {
  const t = useTranslations("clients");
  const router = useRouter();
  const date = useDate();
  const { who, err } = useWho();
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [q, setQ] = useState("");
  const [list, setList] = useState<ClientList | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [p, setP] = useState<Profile | null>(null);
  const [edit, setEdit] = useState<"new" | "edit" | null>(null);
  const [toast, setToast] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 3000); };
  const wide = typeof window === "undefined" || window.matchMedia("(min-width: 900px)").matches;

  const load = useCallback(async () => {
    if (!who) return;
    try { setList(await listClients(who, filter, q)); setLoadErr(""); } catch (e) { setLoadErr(navigator.onLine ? (e as Error).message : t("needNet")); }
  }, [who, filter, q, t]);
  useEffect(() => { const h = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(h); }, [load, q]);
  useEffect(() => { if (list && wide && !sel) setSel(list.rows[0]?.id ?? null); }, [list, sel, wide]);
  const openOne = useCallback(async (id: string) => {
    if (!who) return;
    try { setP(await getProfile(who, id)); } catch (e) { say((e as Error).message); }
  }, [who]);
  useEffect(() => { if (sel) void openOne(sel); else setP(null); }, [sel, openOne]);

  if (err) return <main style={{ padding: 24 }}><p className="hint err">{err === "offline" ? t("needNet") : err}</p></main>;
  if (!who) return <div className="app" aria-busy="true" />;
  const desk = isDesk(who.role);
  const lost = list?.counts.lost ?? 0;

  return (
    <div className="app cl-app">
      {desk && <LeftMenu active="Clients" salonInitials={initials(who.salonName)} me={who.name[0]} />}
      <div className="col">
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}>{!desk && <Link className="btn ghost sm" href="/t">‹ {t("back")}</Link>}{t("title")}{list ? ` · ${list.counts.all}` : ""}</span>}>
          <SyncPill />
          {desk && <Button variant="primary" size="sm" onClick={() => setEdit("new")} data-testid="client-new">{t("newClient")}</Button>}
        </TopBar>
        <OfflineBanner />
        {who.mode === "demo" && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        <main className="cl-main">
          <section className="cl-list">
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <input className="inp" type="search" aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="client-search" />
              {desk && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FILTERS.map((f) => <button key={f} type="button" className={`cl-fch ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}>
                  {t(`f_${f}`)} {list ? list.counts[f] : ""}</button>)}
              </div>}
            </div>
            {desk && filter === "lost" && lost > 0 && <div className="cl-lostbar fade"><span style={{ flex: 1 }}>{t("lostBanner", { n: lost })}</span>
              <Button size="sm" disabled title={t("textsLater")}>{t("missYou")}</Button></div>}
            {loadErr && <div className="hint err" style={{ padding: "0 14px" }}>{loadErr}</div>}
            <div className="cl-rows">
              {list?.rows.map((r) => (
                <button key={r.id} type="button" className={`cl-row ${sel === r.id ? "on" : ""}`} data-testid="client-row"
                  onClick={() => (wide && desk ? setSel(r.id) : router.push(`/clients/${r.id}`))}>
                  <span className="av">{initials(r.name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{r.name || phone(r.phone)}</b> <TagChip tag={r.tag} />{r.care && <span className="cl-carechip" title={t("care")}>▲</span>}
                    <span className="cap" style={{ display: "block", fontSize: 12 }}>
                      {r.tag === "lost" && r.last_visit ? t("lostSub", { days: Math.round((Date.now() - new Date(r.last_visit).getTime()) / 86400000), wk: Math.max(1, Math.round((r.gap_days ?? 28) / 7)) })
                        : [r.usual_service, r.usual_staff, r.gap_days ? t("everyWk", { n: Math.max(1, Math.round(r.gap_days / 7)) }) : null].filter(Boolean).join(" · ") || phone(r.phone)}
                    </span>
                  </span>
                  <span className="cap num" style={{ fontSize: 12, textAlign: "right" }}>{r.last_visit ? date(r.last_visit) : t("noVisits")}</span>
                </button>
              ))}
              {list && !list.rows.length && <div className="cap" style={{ padding: 16 }}>{q ? t("noneFound") : t("none")}</div>}
            </div>
          </section>
          {desk && <section className="cl-panel">
            {p ? <Panel p={p} onEdit={() => setEdit("edit")} onPhoto={() => void openOne(p.id)} say={say} who={who} date={date} /> : <div className="cap">{t("pick")}</div>}
          </section>}
        </main>
      </div>
      {edit && <EditDrawer who={who} p={edit === "edit" ? p : null} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); say(t("saved")); void load(); setSel(id); void openOne(id); }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function Panel({ p, who, onEdit, onPhoto, say, date }: { p: Profile; who: NonNullable<ReturnType<typeof useWho>["who"]>; onEdit: () => void; onPhoto: () => void; say: (s: string) => void; date: ReturnType<typeof useDate> }) {
  const t = useTranslations("clients");
  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="client-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span className="av lg">{initials(p.name)}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="h1" style={{ fontSize: 26 }}>{p.name || phone(p.phone)} <TagChip tag={p.tag} /></div>
          <div className="cap num">{[phone(p.phone), t("since", { date: date(p.since, true) }), p.texts_ok ? t("textsYes") : null, p.birthday ? t("bday", { date: date(p.birthday) }) : null].filter(Boolean).join(" · ")}</div>
        </div>
        <Button disabled title={t("textsLater")}>{t("text")}</Button>
        <Button disabled title={t("bookLater")}>{t("book")}</Button>
        <Link className="btn primary" href={`/clients/${p.id}`} data-testid="open-history">{t("history")}</Link>
      </div>
      <Stats p={p} />
      <div className="cl-grid2">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <CareBox care={p.care} />
          <div className="card cl-box">
            <div style={{ display: "flex", alignItems: "center" }}><b style={{ flex: 1 }}>{t("likes")}</b><Button size="sm" variant="ghost" onClick={onEdit} data-testid="client-edit">{t("edit")}</Button></div>
            <div className="line"><span>{t("usualStaff")}</span><b>{p.usual_staff ?? "—"}</b></div>
            <div className="line"><span>{t("shape")}</span><b>{p.shape || "—"}</b></div>
            <div className="line"><span>{t("colors")}</span><b>{p.colors || "—"}</b></div>
          </div>
          {p.notes && <div className="card cl-box"><b>{t("notes")}</b><div className="cap" style={{ fontSize: 13 }}>{p.notes}</div></div>}
          {p.gift_cards.map((g) => (
            <div key={g.last4} className="card cl-box" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1 }}><b>{t("giftCard", { last4: g.last4 })}</b><span className="cap" style={{ display: "block" }}>{t("giftSub", { date: date(g.sold_at) })}</span></span>
              <b className="num">{$(Number(g.balance_cents))}</b>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="card cl-box">
            <div style={{ display: "flex", alignItems: "center" }}><b style={{ flex: 1 }}>{t("photos")}</b><PhotoButton who={who} p={p} ticketId={null} onDone={onPhoto} say={say} /></div>
            {p.photos.length ? <div className="cl-photos">{p.photos.slice(0, 4).map((ph) => (
              // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
              <img key={ph.id} src={ph.url} alt={t("photoAlt", { date: date(ph.at) })} className="cl-photo" />))}</div> : <div className="cap">{t("noPhotos")}</div>}
          </div>
          <div className="card cl-box">
            <b>{t("visits")}</b>
            {p.visits.slice(0, 5).map((v) => (
              <div key={v.ticket_id} className="cl-visit"><span className="cap num" style={{ width: 56 }}>{date(v.at)}</span>
                <span style={{ flex: 1 }}>{(v.services ?? []).map((s) => s.name).join(" + ") || t("giftOnly")} <span className="cap">· {[...new Set((v.services ?? []).map((s) => s.staff).filter(Boolean))].join(", ")}</span></span>
                <b className="num">{$(Number(v.total))}</b></div>
            ))}
            {!p.visits.length && <div className="cap">{t("noVisits")}</div>}
            <div className="cap" style={{ marginTop: 6 }}>{t("next")}: <b style={{ color: "var(--ink)" }}>{t("nextNone")}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}
