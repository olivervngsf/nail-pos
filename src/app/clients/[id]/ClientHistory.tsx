"use client";
// Client full history, version D2 (design "Clients · 4 variations", Nov 17): lifetime numbers, filter by year or tech,
// visits grouped by year; tap one → its ticket on the right (lines, tip to the tech, card fee the salon pays, total),
// photos + notes of that visit, resend receipt, book the same again.
// On a phone (D3) the page opens on the client's profile; "Full history" switches to this list.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Chip, LeftMenu, OfflineBanner, SyncPill, Toast, TopBar } from "@/components/kit";
import { NEW_FOR, addNote, getProfile, isDesk, last4, useWho, type Profile, type Visit } from "@/lib/clients";
import { dayKey } from "@/lib/booking/grid";
import { $, EditDrawer, PhotoButton, canEditClient, initials, useDate } from "../ClientParts";
import { ClientProfile } from "../ClientProfile";

function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 900px)");
    const on = () => setWide(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export default function ClientHistory({ id }: { id: string }) {
  const t = useTranslations("clients");
  const router = useRouter();
  const wide = useWide();
  const { who, err } = useWho();
  const [p, setP] = useState<Profile | null>(null);
  const [view, setView] = useState<"profile" | "history">("profile");
  const [edit, setEdit] = useState(false);
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
  const showHistory = wide || view === "history";
  const newTicket = () => {
    try { sessionStorage.setItem(NEW_FOR, JSON.stringify(p?.phone ? { phone: p.phone, name: p.name } : null)); } catch { /* private mode */ }
    router.push("/checkout?new=1");
  };
  const back = !wide && view === "history"
    ? <Button variant="ghost" size="sm" onClick={() => setView("profile")}>‹ {p?.name ?? ""}</Button>
    : <Link className="btn ghost sm" href={desk ? "/clients" : "/t"}>‹ {wide && p ? p.name : t("title")}</Link>;

  return (
    <div className="app cl-app">
      {desk && <LeftMenu active="Clients" salonInitials={initials(who.salonName)} me={who.name[0]} />}
      <div className="col">
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>{back}
          <span className="cl2-wide">{showHistory ? t("history") : ""}{p?.number ? <span className="cap"> · {t("clientNo", { n: p.number })}</span> : null}{p?.phone ? <span className="cap"> · ••{last4(p.phone)}</span> : null}</span>
          {!wide && view === "profile" && <span>{p?.name ?? ""}</span>}{!wide && view === "history" && <span>{t("history")}</span>}</span>}>
          <SyncPill />
          {wide && p && canEditClient(who) && <Button onClick={() => setEdit(true)} data-testid="client-edit">{t("edit")}</Button>}
          {wide && desk && <Button variant="primary" onClick={newTicket}>{t("newTicket")}</Button>}
        </TopBar>
        <OfflineBanner />
        {who.mode === "demo" && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        {loadErr && <p className="hint err" style={{ padding: 24 }}>{loadErr}</p>}
        {p && (showHistory
          ? <History who={who} p={p} reload={() => void load()} say={say} />
          : <main className="cl2-pmain"><ClientProfile who={who} p={p} reload={() => void load()} say={say} onEdit={() => setEdit(true)} onHistory={() => setView("history")} phoneBar /></main>)}
      </div>
      {edit && p && <EditDrawer who={who} p={p} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); say(t("saved")); void load(); }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function History({ who, p, reload, say }: { who: NonNullable<ReturnType<typeof useWho>["who"]>; p: Profile; reload: () => void; say: (s: string) => void }) {
  const t = useTranslations("clients");
  const date = useDate();
  const f = useFormatter();
  const [filt, setFilt] = useState("all");
  const [sel, setSel] = useState(0);
  const [note, setNote] = useState("");
  const staffOf = (v: Visit) => [...new Set((v.services ?? []).map((s) => s.staff).filter(Boolean))] as string[];
  const years = useMemo(() => [...new Set(p.visits.map((v) => (v.at ?? "").slice(0, 4)))].filter(Boolean), [p.visits]);
  const techs = useMemo(() => [...new Set(p.visits.flatMap(staffOf))], [p.visits]);
  const keep = (v: Visit) => filt === "all" || (v.at ?? "").startsWith(filt) || staffOf(v).includes(filt);
  const shown = p.visits.filter(keep);
  const v = p.visits[sel] && keep(p.visits[sel]) ? p.visits[sel] : shown[0];
  const yearTotal = (y: string) => $(p.visits.filter((x) => (x.at ?? "").startsWith(y)).reduce((a, x) => a + Number(x.subtotal) - Number(x.discount), 0));
  const wk = p.stats.gap_days ? Math.max(1, Math.round(p.stats.gap_days / 7)) : null;
  const save = async (ticketId: string) => {
    if (!note.trim()) return;
    try { await addNote(who, p, note, ticketId); setNote(""); say(t("noteSaved")); reload(); } catch (e) { say(navigator.onLine ? (e as Error).message : t("needNet")); }
  };
  const how = (x: Visit) => (x.payments ?? []).map((m) => m.method === "cash" ? t("pCash") : m.method === "gift_card" ? t("pGift", { last4: m.last4 ?? "" })
    : t("pCard", { card: m.brand ? `${m.brand.toUpperCase()} ••${m.last4 ?? ""}` : t("link") })).join(" + ") || "—";

  return (
    <main className="cl2-hmain">
      <section className="cl2-hleft">
        {p.care && <div className="cl2-strip cl2-care" data-testid="client-care"><span className="cl2-strip-t"><b>{t("care")}:</b> {p.care}</span></div>}
        <div className="card" style={{ padding: "12px 8px" }}>
          <div className="stat-grid" style={{ "--n": 5 } as React.CSSProperties}>
            <div><b>{p.stats.visits}</b><span className="cap">{t("sVisits")}</span></div>
            <div><b>{$(Number(p.stats.spent)).replace(/\.00$/, "")}</b><span className="cap">{t("sSpent")}</span></div>
            <div><b>{$(Number(p.stats.tips ?? p.stats.avg_tip * p.stats.visits)).replace(/\.00$/, "")}</b><span className="cap">{t("tipsS")}</span></div>
            <div><b>{wk ? t("weeks", { n: wk }) : "—"}</b><span className="cap">{t("sEvery")}</span></div>
            <div><b>{p.photos.length}</b><span className="cap">{t("photosS")}</span></div>
          </div>
        </div>
        <div className="cl2-chips">
          <Chip on={filt === "all"} onClick={() => setFilt("all")}>{t("allN", { n: p.visits.length })}</Chip>
          {years.length > 1 && years.map((y) => <Chip key={y} on={filt === y} onClick={() => setFilt(y)}>{y}</Chip>)}
          {techs.length > 1 && techs.map((s) => <Chip key={s} on={filt === s} onClick={() => setFilt(s)}>{s}</Chip>)}
        </div>
        <div className="group cl2-vlist" data-testid="visits">
          {shown.map((x, k) => {
            const i = p.visits.indexOf(x);
            const y = (x.at ?? "").slice(0, 4);
            const head = k === 0 || (shown[k - 1].at ?? "").slice(0, 4) !== y;
            const ph = p.photos.find((q) => q.ticket_id === x.ticket_id);
            const pay = x.payments?.[0]?.method;
            return <div key={x.ticket_id}>
              {head && <div className="eyebrow cl2-yr">{t("yearSum", { year: y, amount: yearTotal(y) })}</div>}
              <button type="button" className={`cl2-vrow ${x === v ? "on" : ""}`} onClick={() => setSel(i)} aria-pressed={x === v} data-testid="visit-row">
                <span className="cap num" style={{ width: 52 }}>{date(x.at)}</span>
                <span className="cl2-vname"><span>{(x.services ?? []).map((s) => s.name).join(" + ") || t("giftOnly")}</span><span className="cap"> · {staffOf(x).join(", ")}</span></span>
                {pay && <span className="tag cl2-wide" style={{ height: 20, fontSize: 11 }}>{pay === "cash" ? t("pCash") : pay === "gift_card" ? t("pGift", { last4: x.payments?.[0]?.last4 ?? "" }) : t("pCard", { card: "" }).trim()}</span>}
                {Number(x.tip) > 0 && <span className="cap num cl2-wide">{t("tipShort", { amount: $(Number(x.tip)) })}</span>}
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                {ph?.url ? <img src={ph.url} alt="" className="cl2-th" /> : <span className="cl2-th" aria-hidden="true" />}
                <span className="num" style={{ minWidth: 56, textAlign: "right", fontWeight: 500 }}>{$(Number(x.total))}</span>
              </button>
            </div>;
          })}
          {!shown.length && <div className="cap" style={{ padding: 16 }}>{t("noVisits")}</div>}
        </div>
      </section>
      <aside className="cl2-hright" data-testid="visit-open">
        {!v ? <div className="cap" style={{ padding: 20 }}>{t("pickVisit")}</div> : <>
          <div className="cl2-hrhead">
            <div className="eyebrow">{t("ticketNo", { n: v.number })}{v.status === "refunded" ? ` · ${t("refunded")}` : ""}</div>
            <div className="h2">{date(v.at, true)}</div>
            <div className="cap">{t("timeWith", { time: v.at ? f.dateTime(new Date(v.at), { timeStyle: "short" }) : "", name: staffOf(v).join(", ") })} · {t("paidBy", { how: how(v) })}</div>
          </div>
          <div className="cl2-hrbody">
            <div className="group">
              {(v.services ?? []).map((s, k) => <div key={k} className="row xs"><span className="g">{s.name}</span><span className="num">{$(Number(s.cents))}</span></div>)}
              {Number(v.discount) > 0 && <div className="row xs minus"><span className="g">{t("discount")}</span><span className="num">−{$(Number(v.discount))}</span></div>}
              <div className="row xs"><span className="g cap">{t("tipTo", { name: staffOf(v).join(", ") })}</span><span className="num">{$(Number(v.tip))}</span></div>
              <div className="row xs"><span className="g cap">{t("cardFee")}</span><span className="num cap">{$((v.payments ?? []).reduce((a, m) => a + Number(m.fee ?? 0), 0))}</span></div>
              <div className="row s"><span className="g" style={{ fontWeight: 600 }}>{t("totalPaid")}</span><span className="num" style={{ fontWeight: 600 }}>{$(Number(v.total))}</span></div>
            </div>
            <div className="cl2-vphotos">
              {p.photos.filter((x) => x.ticket_id === v.ticket_id).map((ph) => (
                // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                <img key={ph.id} src={ph.url} alt={t("photoAlt", { date: date(ph.at) })} className="ch-ph" />))}
              <PhotoButton who={who} p={p} ticketId={v.ticket_id} onDone={reload} say={say} />
            </div>
            {p.notes_log.filter((n) => n.ticket_id === v.ticket_id).map((n) => <div key={n.id} style={{ fontSize: 14 }}><b>{t("noteBy", { name: n.by ?? "" })}</b><div>{n.body}</div></div>)}
            <div style={{ display: "flex", gap: 6 }}>
              <input className="inp" placeholder={t("notePh")} aria-label={t("addNote")} value={note} onChange={(e) => setNote(e.target.value)} data-testid="note-input"
                onKeyDown={(e) => e.key === "Enter" && void save(v.ticket_id)} />
              <Button disabled={!note.trim()} onClick={() => void save(v.ticket_id)} data-testid="note-save">{t("addNote")}</Button>
            </div>
          </div>
          {isDesk(who.role) && <div className="drawer-f">
            <Link className="btn" style={{ flex: 1 }} href={`/r/${v.ticket_id}`}>{t("resend")}</Link>
            <Link className="btn" style={{ flex: 1 }} href={`/calendar?view=day&d=${dayKey(new Date())}`}>{t("bookSame")}</Link>
          </div>}
        </>}
      </aside>
    </main>
  );
}
