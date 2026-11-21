"use client";
// Clients, version C (design "Clients · 4 variations" → C · Table + profile drawer, Nov 17). TEST ROUTE for user
// testing next to version D (/clients-ver-d = /clients). Desk: one wide table (search, Regulars / Lost / New chips,
// sort), tap a row → profile drawer on the right (stats, care note, usual staff, shape, colors, gift card, photos,
// last 3 visits, Full history, Text · Book · New ticket). Same rules as D: phone = ••last 4 + client #, edits need
// an owner/manager (Edit drawer). Phone / tech: tap a row → /clients/[id].
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, LeftMenu, Segmented, OfflineBanner, SyncPill, Toast, TopBar } from "@/components/kit";
import { NEW_FOR, dueBack, everyWeeks, getProfile, isDesk, last4, listClients, useWho, type ClientFilter, type ClientList, type ClientRow, type Profile } from "@/lib/clients";
import { dayKey } from "@/lib/booking/grid";
import { $, EditDrawer, TagChip, canEditClient, initials, useDate } from "../clients/ClientParts";

const FILTERS: { f: ClientFilter; key: "f_all" | "f_regular" | "tag_lost" | "tag_new" }[] = [
  { f: "all", key: "f_all" }, { f: "regular", key: "f_regular" }, { f: "lost", key: "tag_lost" }, { f: "new", key: "tag_new" },
];
type Sort = "last" | "spent" | "name";
const money = (c: number) => $(Number(c)).replace(/\.00$/, "");

export default function ClientsTable() {
  const t = useTranslations("clients");
  const router = useRouter();
  const date = useDate();
  const { who, err } = useWho();
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [sort, setSort] = useState<Sort>("last");
  const [q, setQ] = useState("");
  const [list, setList] = useState<ClientList | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [p, setP] = useState<Profile | null>(null);
  const [edit, setEdit] = useState<"new" | "edit" | null>(null);
  const [toast, setToast] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    if (!who) return;
    try { setList(await listClients(who, filter, q)); setLoadErr(""); } catch (e) { setLoadErr(navigator.onLine ? (e as Error).message : t("needNet")); }
  }, [who, filter, q, t]);
  useEffect(() => { const h = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(h); }, [load, q]);
  const openOne = useCallback(async (id: string) => {
    if (!who) return;
    try { setP(await getProfile(who, id)); } catch (e) { say((e as Error).message); }
  }, [who]);
  useEffect(() => { if (sel) void openOne(sel); else setP(null); }, [sel, openOne]);
  useEffect(() => {
    if (!sel) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sel]);

  const rows = useMemo(() => {
    const r = [...(list?.rows ?? [])];
    if (sort === "spent") r.sort((a, b) => Number(b.spent ?? 0) - Number(a.spent ?? 0));
    if (sort === "name") r.sort((a, b) => (a.name || "~").localeCompare(b.name || "~"));
    return r;
  }, [list, sort]);
  const dupes = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of list?.rows ?? []) if (r.name) n.set(r.name.toLowerCase(), (n.get(r.name.toLowerCase()) ?? 0) + 1);
    return n;
  }, [list]);

  if (err) return <main style={{ padding: 24 }}><p className="hint err">{err === "offline" ? t("needNet") : err}</p></main>;
  if (!who) return <div className="app" aria-busy="true" />;
  const desk = isDesk(who.role);

  /** Last visit: "Today" or the short date. Due back: in N days / today / N days late (orange when late). */
  const lastText = (r: ClientRow) => (!r.last_visit ? "—" : dayKey(new Date(r.last_visit)) === dayKey(new Date()) ? t("today") : date(r.last_visit));
  const dueText = (r: ClientRow): { text: string; late: boolean } => {
    const d = dueBack(r.gap_days, r.last_visit);
    if (!d) return { text: "—", late: false };
    if (d.inDays > 0) return { text: d.inDays <= 14 ? t("dueCol", { n: d.inDays }) : date(d.on.toISOString()), late: false };
    if (d.inDays === 0) return { text: t("dueColToday"), late: false };
    return { text: t("late", { n: -d.inDays }), late: true };
  };
  const open = (id: string) => {
    if (desk && window.matchMedia("(min-width: 900px)").matches) setSel(sel === id ? null : id);
    else router.push(`/clients/${id}`);
  };

  return (
    <div className="app cl-app">
      {desk && <LeftMenu active="Clients" salonInitials={initials(who.salonName)} me={who.name[0]} />}
      <div className="col" style={{ position: "relative" }}>
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}>{!desk && <Link className="btn ghost sm" href="/t">‹ {t("back")}</Link>}{t("title")}{list ? <span className="cap"> · {list.counts.all}</span> : ""}</span>}>
          <SyncPill />
          {desk && <Button onClick={() => setEdit("new")} data-testid="client-new">{t("newClient")}</Button>}
        </TopBar>
        <OfflineBanner />
        <div className="demo" style={{ margin: "12px 24px 0" }} data-testid="ver-c-note">{t("verC")}{who.mode === "demo" ? ` ${t("demo")}` : ""}</div>
        <div className="cc-tools">
          <input className="inp cc-search" type="search" aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="client-search" />
          {desk && FILTERS.map(({ f, key }) => (
            <button key={f} type="button" className={`chip ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}>
              {t("chipN", { label: t(key), n: list ? list.counts[f] : "–" })}
            </button>))}
          <div style={{ flex: 1 }} />
          <span className="cap cc-hide">{t("sort")}</span>
          <span className="cc-hide">
            <Segmented label={t("sort")} value={sort} onChange={setSort}
              options={[{ value: "last", label: t("sortLast") }, { value: "spent", label: t("sortSpent") }, { value: "name", label: t("sortName") }]} />
          </span>
        </div>
        {loadErr && <div className="hint err" style={{ padding: "0 24px" }}>{loadErr}</div>}
        <div className="cc-wrap">
          <div className="group cc-group">
            <table className="dtable cc-table">
              <thead><tr>
                <th>{t("colClient")}</th><th className="cc-hide" style={{ textAlign: "left" }}>{t("colUsual")}</th><th>{t("colVisits")}</th>
                <th className="cc-hide">{t("colSpent")}</th><th className="cc-hide">{t("colLast")}</th><th>{t("colDue")}</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const due = dueText(r);
                  const same = !!r.name && (dupes.get(r.name.toLowerCase()) ?? 0) > 1;
                  return (
                    <tr key={r.id} className={`cc-row ${sel === r.id ? "sel" : ""}`} data-testid="client-row" tabIndex={0}
                      onClick={() => open(r.id)} onKeyDown={(e) => { if (e.key === "Enter") open(r.id); }}>
                      <td>
                        <span className="cc-who">
                          <span className="av cc-av">{initials(r.name)}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="cc-name">{r.name || `••${last4(r.phone)}`}</span>{" "}
                            <TagChip tag={r.tag} />
                            {same && <span className="tag cl2-same" data-testid="same-name">{t("sameName")}</span>}
                            <span className="cap num cc-sub">{[r.number ? t("clientNo", { n: r.number }) : "", r.phone ? `••${last4(r.phone)}` : ""].filter(Boolean).join(" · ")}</span>
                          </span>
                        </span>
                      </td>
                      <td className="cc-hide" style={{ textAlign: "left" }}>{r.usual_staff || "—"}</td>
                      <td>{r.visits}</td>
                      <td className="cc-hide">{money(r.spent ?? 0)}</td>
                      <td className="cc-hide">{lastText(r)}</td>
                      <td><span className={due.late ? "cc-late" : ""}>{due.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list && !rows.length && <div className="cap" style={{ padding: 16 }}>{q ? t("noneFound") : t("none")}</div>}
          </div>
        </div>
        {desk && sel && p && p.id === sel && <ProfileDrawer p={p} onClose={() => setSel(null)} onEdit={canEditClient(who) ? () => setEdit("edit") : undefined} />}
      </div>
      {edit && <EditDrawer who={who} p={edit === "edit" ? p : null} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); say(t("saved")); void load(); setSel(id); void openOne(id); }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

/** Version C drawer: one quick look at the client, actions at the bottom. Not modal: the table stays usable. */
function ProfileDrawer({ p, onClose, onEdit }: { p: Profile; onClose: () => void; onEdit?: () => void }) {
  const t = useTranslations("clients");
  const date = useDate();
  const router = useRouter();
  const wk = everyWeeks(p.stats.gap_days);
  const gift = p.gift_cards.find((g) => Number(g.balance_cents) > 0);
  const due = dueBack(p.stats.gap_days, p.stats.last_visit);
  const line = [
    p.number ? t("clientNo", { n: p.number }) : "", p.phone ? `••${last4(p.phone)}` : "", t("since", { date: date(p.since, true) }),
    p.texts_ok ? t("textsYes") : "", p.birthday ? t("bday", { date: date(p.birthday) }) : "",
  ].filter(Boolean).join(" · ");
  const newTicket = () => {
    try { sessionStorage.setItem(NEW_FOR, JSON.stringify({ id: p.id, phone: p.phone ?? "", name: p.name })); } catch { /* private mode */ }
    router.push("/checkout?new=1");
  };
  const facts: [string, string][] = [
    [t("usualStaff"), p.usual_staff || "—"], [t("shape"), p.shape || "—"], [t("colors"), p.colors || "—"],
    ...(gift ? [[t("giftCard", { last4: gift.last4 }), $(Number(gift.balance_cents))] as [string, string]] : []),
  ];
  return (
    <aside className="drawer cc-drawer" aria-label={p.name} data-testid="client-drawer">
      <div className="drawer-h">
        <span className="av">{initials(p.name)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{p.name || `••${last4(p.phone)}`}</span>
        {onEdit && <Button variant="ghost" size="sm" onClick={onEdit} data-testid="client-edit">{t("edit")}</Button>}
        <Button variant="ghost" size="sm" aria-label={t("close")} onClick={onClose} data-testid="drawer-close">✕</Button>
      </div>
      <div className="drawer-b">
        <div className="cap num">{line}</div>
        <div className="stat-grid" style={{ ["--n" as string]: 4 }} data-testid="client-stats">
          <div><b>{p.stats.visits}</b><span className="cap">{t("sVisits")}</span></div>
          <div><b>{money(p.stats.spent)}</b><span className="cap">{t("sSpent")}</span></div>
          <div><b>{wk ? t("weeks", { n: wk }) : "—"}</b><span className="cap">{t("sEvery")}</span></div>
          <div><b>{money(p.stats.avg_tip)}</b><span className="cap">{t("sTip")}</span></div>
        </div>
        {p.care
          ? <div className="cc-care" data-testid="client-care"><b>{t("care")}:</b> {p.care}</div>
          : <div className="cap">{t("noCare")}</div>}
        <div className="group">
          {facts.map(([k, v]) => <div key={k} className="row xs"><span className="g cap">{k}</span><b className="num">{v}</b></div>)}
        </div>
        {p.photos.length > 0 && <div className="cl-photos">
          {p.photos.slice(0, 4).map((ph) => ph.url
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
            ? <img key={ph.id} className="cl-photo" src={ph.url} alt={t("photoAlt", { date: date(ph.at) })} />
            : <span key={ph.id} className="cl-photo" style={{ background: "#F2F2F7" }} />)}
        </div>}
        {p.visits.length > 0 && <div className="group">
          {p.visits.slice(0, 3).map((v) => (
            <div key={v.ticket_id} className="row xs">
              <span className="cap num" style={{ width: 52, flex: "none" }}>{date(v.at)}</span>
              <span className="g" style={{ flex: 1, minWidth: 0 }}>{(v.services ?? []).map((s) => s.name).join(" + ") || "—"}{v.services?.[0]?.staff ? ` · ${v.services[0].staff}` : ""}</span>
              <b className="num">{money(v.total)}</b>
            </div>))}
        </div>}
        <Link className="btn ghost" href={`/clients/${p.id}`} style={{ alignSelf: "flex-start" }} data-testid="open-history">{t("history")} →</Link>
      </div>
      <div className="drawer-f">
        <Button style={{ flex: 1 }} disabled title={t("textsLater")}>{t("text")}</Button>
        <Link className="btn" style={{ flex: 1 }} href={`/calendar?view=day&d=${dayKey(due && due.inDays > 0 ? due.on : new Date())}`}>{t("book")}</Link>
        <Button variant="primary" style={{ flex: 1.4 }} onClick={newTicket} data-testid="new-ticket">{t("newTicket")}</Button>
      </div>
    </aside>
  );
}
