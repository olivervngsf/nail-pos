"use client";
// Owner / manager · Gift cards (Loyalty + Gift Cards board: GiftSetup G1–G2 + G10, GiftList G11–G12 + G18–G19).
// What's owed on cards, every card (last 4 only), find a card, lock + replace a lost one, make + print plastic cards.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Chip, Drawer, Field, LeftMenu, OfflineBanner, SyncPill, Toast, TopBar } from "@/components/kit";
import { rpc } from "@/lib/auth";
import { formatCents, parseDollars } from "@/lib/money";
import { fmtPhone } from "@/lib/onboarding/data";
import { useDesk } from "@/lib/desk";
import { demoGiftList, type GiftRow, type GiftSummary } from "@/lib/checkout/gift";

const $ = formatCents;
const ST: Record<string, string> = {
  in_stock: "background:#EFEFF2;color:#1C1C1E", active: "background:#EAF5EC;color:#1F7A33", used_up: "background:#F5F5F7;color:#5C5C5E",
  locked: "background:#FCEAEA;color:#C92A2A", replaced: "background:#F5F5F7;color:#5C5C5E", voided: "background:#F5F5F7;color:#5C5C5E",
};
const css = (s: string) => Object.fromEntries(s.split(";").map((x) => x.split(":")).map(([k, v]) => [k.replace(/-(\w)/g, (_, c) => c.toUpperCase()), v]));
const FILTERS = ["all", "active", "in_stock", "used_up", "locked"] as const;
type History = { at: string; reason: string; cents: number; ticket: number | null; by: string | null }[];

export default function GiftCards() {
  const t = useTranslations("giftAdmin");
  const tg = useTranslations("gift");
  const f = useFormatter();
  const { desk, err } = useDesk();
  const [rows, setRows] = useState<GiftRow[] | null>(null);
  const [sum, setSum] = useState<GiftSummary | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<GiftRow | null>(null);
  const [make, setMake] = useState(false);
  const [codes, setCodes] = useState<{ title: string; list: string[] } | null>(null);
  const [toast, setToast] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 3500); };
  const demo = desk?.mode === "demo";
  const admin = desk && (demo || desk.me.role === "owner" || desk.me.role === "manager");

  const load = useCallback(async () => {
    if (!desk) return;
    setLoadErr("");
    if (desk.mode === "demo") {
      const c = demoGiftList();
      setRows(c.map((x) => ({ id: x.id, last4: x.last4, kind: x.kind, status: x.status, made_by: "system", balance_cents: x.balanceCents, sold_at: x.soldAt ?? null, buyer: x.buyer ?? null, sent_to: x.sentTo ?? null, replaced_by_last4: x.replacedByLast4 ?? null, last_used: null })));
      setSum({ owed_cents: c.filter((x) => x.status === "active" || x.status === "locked").reduce((a, x) => a + x.balanceCents, 0), active: c.filter((x) => x.status === "active").length,
        in_stock_plastic: c.filter((x) => x.status === "in_stock" && x.kind === "plastic").length, sold_month_cents: 0, used_month_cents: 0,
        settings: { on: true, amounts: [2500, 5000, 10000], min_cents: 1000, max_cents: 50000 }, prefix: "MAIN" });
      return;
    }
    try {
      const [s, l] = await Promise.all([rpc<GiftSummary>("gift_summary", { p_salon: desk.salonId }), rpc<GiftRow[]>("gift_list", { p_salon: desk.salonId })]);
      setSum(s); setRows(l);
    } catch (e) { setLoadErr(navigator.onLine ? (e as Error).message : tg("needNet")); }
  }, [desk, tg]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => (filter === "all" || r.status === filter || (filter === "locked" && r.status === "replaced"))
    && (!q || r.last4.toLowerCase().includes(q.toLowerCase()) || (r.sent_to ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~") || (r.buyer ?? "").toLowerCase().includes(q.toLowerCase()))), [rows, filter, q]);

  if (err) return <main className="pad"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;

  const csv = (list: string[]) => {
    const blob = new Blob(["code\n" + list.join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `gift-cards-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  return (
    <div className="app">
      <LeftMenu active="Today" salonInitials={desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={desk.me.display_name[0]} />
      <div className="col">
        <TopBar back={{ href: "/today", label: t("back") }} title={t("title")}>
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        {demo && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        {!admin ? <main style={{ padding: "20px 24px" }}><p className="hint err">{t("ownerOnly")}</p></main> : (
        <main style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
          {loadErr && <div className="hint err">{loadErr}</div>}
          {sum && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card pad"><div className="cap">{t("owed")}</div><div className="money" data-testid="gift-owed">{$(Number(sum.owed_cents))}</div><div className="cap">{t("onActive", { n: sum.active })}</div></div>
            <div className="card pad"><div className="cap">{t("soldMonth")}</div><div className="money">{$(Number(sum.sold_month_cents))}</div></div>
            <div className="card pad"><div className="cap">{t("usedMonth")}</div><div className="money">{$(Number(sum.used_month_cents))}</div></div>
            <div className="card pad"><div className="cap">{t("inStock")}</div><div className="money">{sum.in_stock_plastic}</div><div className="cap">{t("inStockSub")}</div></div>
          </div>}
          {sum && !demo && <Settings salonId={desk.salonId} s={sum.settings} say={say} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {FILTERS.map((x) => <Chip key={x} on={filter === x} onClick={() => setFilter(x)}>{t(`f_${x}`)}</Chip>)}
            <input className="inp" style={{ maxWidth: 260, height: 40 }} placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
            <span style={{ flex: 1 }} />
            <Button onClick={() => setMake(true)} disabled={demo} data-testid="gift-make">{t("make")}</Button>
          </div>
          <div className="card gl" style={{ overflowX: "auto" }}>
            <table className="dtable num" style={{ width: "100%" }}>
              <thead><tr><th>{t("card")}</th><th>{t("status")}</th><th className="r">{t("balance")}</th><th>{t("sold")}</th><th>{t("toFrom")}</th><th>{t("lastUsed")}</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r)} style={{ cursor: "pointer" }} data-testid="gift-row">
                    <td><span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>•••• {r.last4}</span> <span className="cap">{tg(`kind_${r.kind}` as "kind_digital")}</span></td>
                    <td><span className="tag" style={css(ST[r.status])}>{tg(`st_${r.status}` as "st_active")}</span></td>
                    <td className="r">{$(Number(r.balance_cents))}</td>
                    <td>{r.sold_at ? f.dateTime(new Date(r.sold_at), { month: "short", day: "numeric" }) : "—"}</td>
                    <td>{[r.buyer, r.sent_to && (r.sent_to.startsWith("+") ? fmtPhone(r.sent_to) : r.sent_to), r.replaced_by_last4 && `→ ${r.replaced_by_last4}`].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{r.last_used ? f.dateTime(new Date(r.last_used), { month: "short", day: "numeric" }) : "—"}</td>
                  </tr>
                ))}
                {rows && !shown.length && <tr><td colSpan={6} className="cap">{t("none")}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="cap">{t("hidden")}</div>
        </main>)}
      </div>
      {open && <CardDrawer row={open} demo={demo} onClose={() => setOpen(null)} onChanged={(msg, newCodes) => { setOpen(null); say(msg); if (newCodes) setCodes(newCodes); void load(); }} />}
      {make && desk && <MakeDrawer salonId={desk.salonId} onClose={() => setMake(false)} onMade={(list) => { setMake(false); setCodes({ title: t("madeTitle", { n: list.length }), list }); void load(); }} />}
      {codes && <Drawer title={codes.title} onClose={() => setCodes(null)} footer={<div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" onClick={() => window.print()}>{t("print")}</Button>
        {codes.list.length > 1 && <Button onClick={() => csv(codes.list)}>{t("csv")}</Button>}
      </div>}>
        <div className="cap">{t("codesOnce")}</div>
        <div className="group gift-codes" data-testid="gift-codes">{codes.list.map((c) => <div className="row" key={c} style={{ fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: ".06em" }}>{c}</div>)}</div>
      </Drawer>}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function Settings({ salonId, s, say }: { salonId: string; s: GiftSummary["settings"]; say: (m: string) => void }) {
  const t = useTranslations("giftAdmin");
  const [on, setOn] = useState(s.on);
  const [min, setMin] = useState(String(s.min_cents / 100));
  const [max, setMax] = useState(String(s.max_cents / 100));
  const save = async (next: { on?: boolean } = {}) => {
    try {
      await rpc("gift_settings_save", { p_salon: salonId, p: { on: next.on ?? on, amounts: s.amounts, min_cents: parseDollars(min) ?? 1000, max_cents: parseDollars(max) ?? 50000 } });
      say(t("saved"));
    } catch (e) { say((e as Error).message); }
  };
  return (
    <div className="card pad" style={{ display: "flex", flexDirection: "row", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ display: "flex", gap: 10, alignItems: "center", flex: "1 1 220px" }}>
        <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); void save({ on: e.target.checked }); }} />
        <span><b>{t("sellOn")}</b><div className="cap">{t("sellOnSub")}</div></span>
      </label>
      <div style={{ width: 120 }}><Field id="gmin" label={t("min")} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} onBlur={() => void save()} /></div>
      <div style={{ width: 120 }}><Field id="gmax" label={t("max")} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} onBlur={() => void save()} /></div>
      <div className="cap" style={{ flex: "1 1 220px" }}>{t("rules")}</div>
    </div>
  );
}

function CardDrawer({ row, demo, onClose, onChanged }: { row: GiftRow; demo: boolean; onClose: () => void; onChanged: (msg: string, codes?: { title: string; list: string[] }) => void }) {
  const t = useTranslations("giftAdmin");
  const tg = useTranslations("gift");
  const f = useFormatter();
  const [hist, setHist] = useState<History | null>(null);
  const [plastic, setPlastic] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!demo) void rpc<History>("gift_history", { p_card: row.id }).then(setHist).catch((e) => setErr((e as Error).message)); else setHist([]); }, [row.id, demo]);
  const act = async (fn: () => Promise<void>) => { setBusy(true); setErr(""); try { await fn(); } catch (e) { setErr((e as Error).message); setBusy(false); } };
  const canReplace = !demo && (row.status === "active" || row.status === "locked");
  return (
    <Drawer title={`•••• ${row.last4} · ${tg(`kind_${row.kind}` as "kind_digital")}`} onClose={onClose} footer={!demo && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {row.status === "active" && <Button disabled={busy} onClick={() => void act(async () => { await rpc("gift_lock", { p_card: row.id }); onChanged(t("lockedMsg", { last4: row.last4 })); })}>{t("lock")}</Button>}
      {canReplace && plastic === null && <>
        <Button variant="primary" disabled={busy} data-testid="gift-replace" onClick={() => void act(async () => {
          const r = await rpc<{ last4: string; code: string; moved_cents: number }>("gift_replace", { p_card: row.id });
          onChanged(t("replacedMsg", { last4: r.last4, amount: $(Number(r.moved_cents)) }), { title: t("newCodeTitle"), list: [r.code] });
        })}>{t("replaceDigital", { amount: $(Number(row.balance_cents)) })}</Button>
        <Button disabled={busy} onClick={() => setPlastic("")}>{t("replacePlastic")}</Button>
      </>}
      {canReplace && plastic !== null && <>
        <Field id="rpl" label={tg("scanBlank")} value={plastic} onChange={(e) => setPlastic(e.target.value)} />
        <Button variant="primary" disabled={busy || plastic.replace(/\D/g, "").length < 16} onClick={() => void act(async () => {
          const r = await rpc<{ last4: string; moved_cents: number }>("gift_replace", { p_card: row.id, p_plastic_code: plastic });
          onChanged(t("replacedMsg", { last4: r.last4, amount: $(Number(r.moved_cents)) }));
        })}>{t("moveTo")}</Button>
      </>}
      {row.kind === "plastic" && row.status === "used_up" && Number(row.balance_cents) === 0 &&
        <Button disabled={busy} onClick={() => void act(async () => { await rpc("gift_restock", { p_card: row.id }); onChanged(t("restockedMsg", { last4: row.last4 })); })}>{t("restock")}</Button>}
    </div>}>
      <div className="line"><span>{t("status")}</span><b>{tg(`st_${row.status}` as "st_active")}</b></div>
      <div className="line"><span>{t("balance")}</span><b className="num">{$(Number(row.balance_cents))}</b></div>
      {row.replaced_by_last4 && <div className="note">{t("replacedBy", { last4: row.replaced_by_last4 })}</div>}
      <div className="eyebrow">{t("history")}</div>
      {hist === null ? <div className="spin" /> : hist.length ? <div className="group">{hist.map((h, i) => (
        <div className="row" key={i}><span className="grow">{t(`r_${h.reason}` as "r_sold")}{h.ticket ? ` · #${h.ticket}` : ""}{h.by ? ` · ${h.by}` : ""}<div className="cap">{f.dateTime(new Date(h.at), { dateStyle: "medium", timeStyle: "short" })}</div></span>
          <b className="num">{h.cents > 0 ? "+" : "−"}{$(Math.abs(Number(h.cents)))}</b></div>))}</div> : <div className="cap">{t("noHistory")}</div>}
      {err && <div className="hint err">{err}</div>}
      {canReplace && <div className="cap">{t("replaceNote")}</div>}
    </Drawer>
  );
}

function MakeDrawer({ salonId, onClose, onMade }: { salonId: string; onClose: () => void; onMade: (codes: string[]) => void }) {
  const t = useTranslations("giftAdmin");
  const [n, setN] = useState(50);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Drawer title={t("makeTitle")} onClose={onClose} footer={<Button variant="primary" block disabled={busy} data-testid="gift-make-go" onClick={async () => {
      setBusy(true); setErr("");
      try { onMade(await rpc<string[]>("gift_make_plastic", { p_salon: salonId, p_count: n })); } catch (e) { setErr((e as Error).message); setBusy(false); }
    }}>{t("makeN", { n })}</Button>}>
      <div className="cap">{t("makeSub")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{[10, 50, 100, 200].map((x) => <Chip key={x} on={n === x} onClick={() => setN(x)}>{x}</Chip>)}</div>
      <div className="note">{t("makeNote")}</div>
      {err && <div className="hint err">{err}</div>}
    </Drawer>
  );
}
