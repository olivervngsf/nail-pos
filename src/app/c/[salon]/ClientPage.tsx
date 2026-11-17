"use client";
// Client page (Loyalty board L10 + Gift cards G13–G16): opened from a receipt link, signed in with a one-time text code
// (no password, no app). Points + progress + history, gift cards on this phone, add a gift card by its code, book again.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PhoneCodeLogin from "@/components/PhoneCodeLogin";
import { Button, ProgressBar } from "@/components/kit";
import { SMS_ON, isSignedIn, rpc, signOut } from "@/lib/auth";
import { formatCents } from "@/lib/money";

type Card = { id: string; last4: string; kind: string; from?: string | null; mine: boolean; balance: number };
type Page = {
  salon: { name: string; slug: string; phone: string | null }; first: string; phoneLast4: string;
  loyalty: { kind: "points" | "visits"; points: number; rewardPoints: number; rewardCents: number; today: number } | null;
  history: { at: string; change: number; reason: string; what: string | null }[];
  cards: Card[];
};
const $ = (c: number) => formatCents(c);

function demoPage(slug: string): Page {
  let extra: Card[] = [];
  try { extra = JSON.parse(localStorage.getItem("nailpos.demoClientCards") || "[]"); } catch { /* */ }
  const d = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  return {
    salon: { name: "Test Nails", slug, phone: "(408) 555-0100" }, first: "Lan", phoneLast4: "0142",
    loyalty: { kind: "points", points: 105, rewardPoints: 100, rewardCents: 1000, today: 52 },
    history: [
      { at: d(0), change: 52, reason: "earn", what: "Gel color manicure + French tip" },
      { at: d(21), change: 45, reason: "earn", what: "Gel color manicure" },
      { at: d(65), change: 83, reason: "earn", what: "Gel manicure + spa pedicure" },
      { at: d(140), change: -100, reason: "redeem", what: null },
    ],
    cards: [{ id: "g1", last4: "2T4F", kind: "digital", from: "Mai", mine: false, balance: 5000 }, ...extra],
  };
}

export default function ClientPage({ slug }: { slug: string }) {
  const t = useTranslations("clientPage");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => { if (!SMS_ON) { setSignedIn(false); return; } void isSignedIn().then(setSignedIn); }, []);
  const load = useCallback(async () => {
    if (!SMS_ON) { setPage(demoPage(slug)); return; }
    try { setPage(await rpc<Page | null>("client_page", { p_slug: slug })); } catch (e) { setErr((e as Error).message); setPage(null); }
  }, [slug]);
  useEffect(() => { if (signedIn) void load(); }, [signedIn, load]);

  if (signedIn === null) return <main className="cp" aria-busy="true" />;
  if (!signedIn) return (
    <main className="cp"><div className="card pad cp-card">
      <PhoneCodeLogin phone={phone} setPhone={setPhone} onDone={() => setSignedIn(true)} title={t("signInTitle")} lead={t("signInLead")} sendLabel={t("send")} />
    </div></main>
  );
  if (page === undefined) return <main className="cp" aria-busy="true" />;
  if (!page) return <main className="cp"><div className="card pad cp-card"><h1 className="h2">{t("notFound")}</h1>{err && <p className="hint err">{err}</p>}</div></main>;
  return <Signed page={page} slug={slug} reload={load} onOut={async () => { await signOut(); setSignedIn(false); setPage(undefined); }} />;
}

function Signed({ page, slug, reload, onOut }: { page: Page; slug: string; reload: () => Promise<void>; onOut: () => void }) {
  const t = useTranslations("clientPage");
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const ly = page.loyalty;
  const left = ly ? Math.max(0, ly.rewardPoints - ly.points) : 0;
  const unit = ly?.kind === "visits" ? t("visits") : t("points");
  const add = async () => {
    setBusy(true); setErr("");
    if (!SMS_ON) {
      const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (norm.length < 12) { setErr(t("e_typo")); setBusy(false); return; }
      const card: Card = { id: crypto.randomUUID(), last4: norm.slice(-4), kind: "plastic", mine: true, balance: 10000 };
      try { const cur = JSON.parse(localStorage.getItem("nailpos.demoClientCards") || "[]"); localStorage.setItem("nailpos.demoClientCards", JSON.stringify([...cur, card])); } catch { /* */ }
      setAdded(card.last4); setAdding(false); setCode(""); setBusy(false); await reload(); return;
    }
    try {
      const r = await rpc<{ ok: boolean; reason?: string; triesLeft?: number; card?: Card }>("client_add_card", { p_slug: slug, p_code: code });
      if (r.ok && r.card) { setAdded(r.card.last4); setAdding(false); setCode(""); await reload(); }
      else setErr(t(`e_${r.reason ?? "other"}` as "e_typo", { salon: page.salon.name, n: r.triesLeft ?? 0 }));
    } catch { setErr(t("e_offline")); }
    setBusy(false);
  };
  return (
    <main className="cp">
      <div className="cp-head"><b>{page.salon.name}</b><span className="cap">{t("signedIn", { last4: page.phoneLast4 })}</span></div>
      {ly ? (
        <section className="card pad cp-card" data-testid="cp-points">
          <p className="cap">{t("hi", { name: page.first || t("there") })}</p>
          <div className="cp-pts"><b className="num">{ly.points}</b> <span>{unit}</span>{ly.today > 0 && <span className="tag jade">+{ly.today} {t("today")}</span>}</div>
          {left > 0 ? <>
            <ProgressBar value={ly.points / ly.rewardPoints} label={t("progress")} />
            <p className="cap">{t("toNext", { n: left, unit, amt: $(ly.rewardCents).replace(/\.00$/, "") })}</p>
          </> : <div className="cp-ready" data-testid="cp-ready"><b>{t("ready", { amt: $(ly.rewardCents).replace(/\.00$/, "") })}</b><span className="cap">{t("readySub")}</span></div>}
        </section>
      ) : <section className="card pad cp-card"><p className="cap">{t("noLoyalty", { salon: page.salon.name })}</p></section>}

      <section className="card pad cp-card" data-testid="cp-cards">
        <div className="cp-row"><b style={{ flex: 1 }}>{t("myCards")}</b>{!adding && <Button size="sm" onClick={() => { setAdding(true); setErr(""); }} data-testid="cp-add">{t("add")}</Button>}</div>
        {page.cards.length === 0 && !adding && <p className="cap">{t("noCards")}</p>}
        {page.cards.map((c) => (
          <div key={c.id} className={`cp-gc ${added === c.last4 ? "new" : ""}`} data-testid="cp-card">
            <span className="cp-gcl">{page.salon.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0 }}><b>•••• {c.last4} · {t(`kind_${c.kind}` as "kind_digital")}</b>
              <span className="cap" style={{ display: "block" }}>{c.from ? t("from", { name: c.from }) : c.mine ? t("linked") : ""}</span></span>
            <b className="num">{$(c.balance)}</b>
          </div>))}
        {adding && <div className="cp-addform">
          <p className="cap">{t("addLead", { salon: page.salon.name })}</p>
          <label className="lbl" htmlFor="gc">{t("code")}</label>
          <input id="gc" className={`inp ${err ? "err" : ""}`} autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => { setErr(""); setCode(e.target.value); }} data-testid="cp-code" />
          {err && <p className="hint err" role="alert">{err}</p>}
          <p className="cap">{t("addWhy")}</p>
          <div className="cp-row"><Button variant="primary" disabled={busy || code.replace(/\W/g, "").length < 8} onClick={() => void add()} data-testid="cp-add-save">{t("addCard")}</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>{t("cancel")}</Button></div>
        </div>}
        {added && <p className="cap" style={{ color: "#1F7A33" }} data-testid="cp-added">{t("added", { last4: added })}</p>}
      </section>

      {page.history.length > 0 && <section className="card pad cp-card">
        <b>{t("history")}</b>
        {page.history.map((h, i) => (
          <div key={i} className="cp-row cp-h"><span style={{ flex: 1, minWidth: 0 }}>{new Date(h.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {h.reason === "redeem" ? t("rewardUsed") : h.reason === "refund" ? t("refund") : h.what || t("visit")}</span>
            <b className={h.change > 0 ? "up" : "down"}>{h.change > 0 ? "+" : ""}{h.change}</b></div>))}
      </section>}

      <Link className="btn primary block" href={`/${slug}`} data-testid="cp-book">{t("book")}</Link>
      <button type="button" className="btn ghost" onClick={onOut}>{t("signOut")}</button>
    </main>
  );
}
