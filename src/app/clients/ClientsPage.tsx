"use client";
// Clients, version D (design "Clients · 4 variations", Nov 17). Desk + owner: list on the left (search, 3 counts,
// last 4 phone digits, "Same name" tag, dot = needs attention), profile with next steps on the right.
// Phone (tech or small screen): list only, tap → /clients/[id].
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, LeftMenu, OfflineBanner, SyncPill, Toast, TopBar } from "@/components/kit";
import { daysSince, dueBack, getProfile, isDesk, last4, listClients, useWho, type ClientFilter, type ClientList, type ClientRow, type Profile } from "@/lib/clients";
import { EditDrawer, initials, useDate } from "./ClientParts";
import { ClientProfile } from "./ClientProfile";

const COUNTS: { f: ClientFilter; key: "f_all" | "lostShort" | "bdaysShort" }[] = [{ f: "all", key: "f_all" }, { f: "lost", key: "lostShort" }, { f: "bday", key: "bdaysShort" }];

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
  // Two clients with the same name: tell them apart by the last 4 digits (and the "Same name" tag).
  const dupes = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of list?.rows ?? []) if (r.name) n.set(r.name.toLowerCase(), (n.get(r.name.toLowerCase()) ?? 0) + 1);
    return n;
  }, [list]);

  if (err) return <main style={{ padding: 24 }}><p className="hint err">{err === "offline" ? t("needNet") : err}</p></main>;
  if (!who) return <div className="app" aria-busy="true" />;
  const desk = isDesk(who.role);
  const lost = list?.counts.lost ?? 0;

  /** The grey line under a name: what matters now (here today, due back, lost, new), else usual service · staff. */
  const sub = (r: ClientRow): { text: string; dot: "" | "warn" | "ok" } => {
    const ago = daysSince(r.last_visit);
    const due = dueBack(r.gap_days, r.last_visit);
    if (ago === 0) return { text: [t("hereToday"), r.usual_staff].filter(Boolean).join(" · "), dot: "ok" };
    if (r.tag === "lost") return { text: t("lostDays", { n: ago ?? 0 }), dot: "warn" };
    if (due && due.inDays >= 0 && due.inDays <= 7) return { text: [due.inDays ? t("dueIn", { n: due.inDays }) : t("dueToday"), r.usual_staff].filter(Boolean).join(" · "), dot: "warn" };
    if (r.tag === "new" && r.last_visit) return { text: t("newOn", { date: date(r.last_visit) }), dot: "" };
    return { text: [r.usual_service, r.usual_staff].filter(Boolean).join(" · ") || (r.visits ? "" : t("noVisits")), dot: "" };
  };

  return (
    <div className="app cl-app">
      {desk && <LeftMenu active="Clients" salonInitials={initials(who.salonName)} me={who.name[0]} />}
      <div className="col">
        <TopBar title={t("title")} fact={list ? list.counts.all : undefined} back={desk ? undefined : { href: "/t", label: t("back") }}
          action={desk ? <Button variant="primary" onClick={() => setEdit("new")} data-testid="client-new">{t("newClient")}</Button> : undefined}>
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        {who.mode === "demo" && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        <main className="cl-main">
          <section className="cl-list cl2-list">
            <div className="cl2-listh">
              <input className="inp" type="search" aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="client-search" />
              {desk && <div className="cl2-counts">
                {COUNTS.map(({ f, key }) => (
                  <button key={f} type="button" className={`stat ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}>
                    <span className={`v num ${f === "lost" && lost ? "cl2-warn" : ""}`}>{list ? list.counts[f] : "–"}</span><span className="cap">{t(key)}</span>
                  </button>))}
              </div>}
            </div>
            {desk && filter === "lost" && lost > 0 && <div className="cl-lostbar fade"><span style={{ flex: 1 }}>{t("lostBanner", { n: lost })}</span>
              <Button size="sm" disabled title={t("textsLater")}>{t("missYou")}</Button></div>}
            {loadErr && <div className="hint err" style={{ padding: "0 14px" }}>{loadErr}</div>}
            <div className="cl-rows">
              {list?.rows.map((r) => {
                const s = sub(r);
                const same = !!r.name && (dupes.get(r.name.toLowerCase()) ?? 0) > 1;
                return (
                  <button key={r.id} type="button" className={`cl-row ${sel === r.id ? "on" : ""}`} data-testid="client-row"
                    onClick={() => (wide && desk ? setSel(r.id) : router.push(`/clients/${r.id}`))}>
                    <span className="av">{initials(r.name)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="cl2-rname">{r.name || `••${last4(r.phone)}`}</span>
                      {same && <span className="tag cl2-same" data-testid="same-name">{t("sameName")}</span>}
                      <span className="cap cl2-rsub">{s.text}</span>
                    </span>
                    <span className="cap num cl2-rid">{r.number ? <span>{t("clientNo", { n: r.number })}</span> : null}{r.phone ? <span>••{last4(r.phone)}</span> : null}</span>
                    <span className={`cl2-dot ${s.dot}`} aria-hidden="true" />
                  </button>
                );
              })}
              {list && !list.rows.length && <div className="cap" style={{ padding: 16 }}>{q ? t("noneFound") : t("none")}</div>}
            </div>
          </section>
          {desk && <section className="cl-panel">
            {p ? <ClientProfile key={p.id} who={who} p={p} reload={() => void openOne(p.id)} say={say} onEdit={() => setEdit("edit")} /> : <div className="cap">{t("pick")}</div>}
          </section>}
        </main>
      </div>
      {edit && <EditDrawer who={who} p={edit === "edit" ? p : null} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); say(t("saved")); void load(); setSel(id); void openOne(id); }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
