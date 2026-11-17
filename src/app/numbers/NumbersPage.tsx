"use client";
// Owner Numbers (Main Screens · Numbers, Owner Numbers board K1–K2): Today / This week / This month, top 5 KPIs vs the period
// before (by now), chart this vs last + one plain fact, more numbers, per-staff table, CSV export. Owner + manager only.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, LeftMenu, OfflineBanner, StatTile, SyncPill, TopBar } from "@/components/kit";
import { useDesk, type Desk } from "@/lib/desk";
import { formatCents } from "@/lib/money";
import { buckets, kpis, more, periods, series, soFar, staffCsv, staffTable, trend, type Facts, type KpiKey, type Period } from "@/lib/numbers/kpis";
import { useNumbers } from "@/lib/numbers/load";

export default function NumbersPage() {
  const { desk, err } = useDesk();
  if (err) return <main className="pad"><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;
  return <Numbers desk={desk} />;
}

const $0 = (c: number) => formatCents(Math.round(c / 100) * 100).replace(/\.00$/, "");
const KEYS: KpiKey[] = ["sales", "ticket", "return", "perhour", "wait"];

function Numbers({ desk }: { desk: Desk }) {
  const t = useTranslations("numbers");
  const admin = desk.mode === "demo" || desk.me.role === "owner" || desk.me.role === "manager";
  const [per, setPer] = useState<Period>("week");
  const [k, setK] = useState<KpiKey>("sales");
  const { facts, now, savedAt, err } = useNumbers(desk.salonId, desk.mode === "live" && admin, per);
  const initials = desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="app nm-app">
      <LeftMenu active="Today" salonInitials={initials} me={desk.me.display_name[0]} />
      <div className="col">
        <TopBar title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Link className="btn ghost sm" href="/today">‹ {t("back")}</Link>{t("title")}</span>}>
          {admin && <span className="seg">{(["day", "week", "month"] as Period[]).map((p) => (
            <button key={p} type="button" className={per === p ? "on" : ""} aria-pressed={per === p} onClick={() => setPer(p)} data-testid={`per-${p}`}
              style={{ border: 0, background: "transparent", font: "inherit", cursor: "pointer" }}>{t(p)}</button>))}</span>}
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        {desk.mode === "demo" && <div className="demo" style={{ margin: "12px 24px 0" }}>{t("demo")}</div>}
        {!admin ? <main style={{ padding: 24 }}><p className="hint err">{t("ownerOnly")}</p></main>
          : !facts ? <main style={{ padding: 24 }} aria-busy="true">{err && <p className="hint err">{err}</p>}</main>
          : <Board facts={facts} now={now} per={per} k={k} setK={setK} savedAt={savedAt} salon={desk.salonName} />}
      </div>
    </div>
  );
}

export function useKpiView(facts: Facts, now: Date, per: Period) {
  return useMemo(() => {
    const p = periods(per, now);
    const cur = soFar(p.cur, p.cur, now), cmp = soFar(p.cmp, p.cur, now);
    return { p, cur, cmp, a: kpis(facts, cur), b: kpis(facts, cmp) };
  }, [facts, now, per]);
}

/** The 5 tiles: value + change vs before (word + arrow, never colour alone). */
export function KpiTiles({ facts, now, per, k, setK, lostN }: { facts: Facts; now: Date; per: Period; k: KpiKey; setK: (k: KpiKey) => void; lostN: number }) {
  const t = useTranslations("numbers");
  const { a, b } = useKpiView(facts, now, per);
  const tile = (key: KpiKey) => {
    const v = { sales: [a.sales, b.sales, "up"], ticket: [a.avgTicket, b.avgTicket, "up"], return: [a.cameBack, b.cameBack, "up"], perhour: [a.perHour, b.perHour, "up"], wait: [a.waitAvg, b.waitAvg, "down"] }[key] as [number | null, number | null, "up" | "down"];
    const tr = trend(v[0], v[1], v[2]);
    if (key === "sales" && tr.pct === 0) tr.dir = "same";
    const shown = v[0] === null ? "—" : key === "return" ? `${v[0]}%` : key === "wait" ? t("min", { n: v[0] }) : $0(v[0]);
    const delta = tr.delta === null ? "" : key === "sales" ? `${Math.abs(tr.pct ?? 0)}%` : key === "return" ? `${Math.abs(tr.delta)} pts` : key === "wait" ? t("min", { n: Math.abs(tr.delta) }) : $0(Math.abs(tr.delta));
    const extra = key === "return" ? t("lostN", { n: lostN }) : key === "wait" ? t("walkOutsN", { n: a.walkOuts }) : null;
    const text = extra ?? (tr.dir === "same" ? t("same") : t(tr.dir, { v: delta }).replace(/^[▲▼] /, ""));
    const good = key === "return" ? lostN === 0 : key === "wait" ? a.walkOuts === 0 : tr.good !== false;
    return <StatTile key={key} label={t(`k_${key}`)} value={<span data-testid={`kpi-${key}`}>{shown}</span>} on={k === key} onClick={() => setK(key)}
      trend={extra || tr.dir !== "same" ? { text, up: good } : undefined} />;
  };
  return <div className="nm-kpis">{KEYS.map(tile)}</div>;
}

/** Chart this vs last for the picked KPI + one plain fact. */
export function KpiChart({ facts, now, per, k }: { facts: Facts; now: Date; per: Period; k: KpiKey }) {
  const t = useTranslations("numbers");
  const { p, cur, a } = useKpiView(facts, now, per);
  const bsA = buckets(per, p.cur), bsB = buckets(per, p.cmp);
  const sa = series(facts, k, bsA), sb = series(facts, k, bsB);
  const max = Math.max(1, ...sa.map((x) => x ?? 0), ...sb.map((x) => x ?? 0));
  const unit = t(per === "day" ? "u_hour" : "u_day");
  const pl = t(`p_${per === "day" ? "day" : per}`);
  const weekday = p.cmp.from.toLocaleDateString(undefined, { weekday: "long" });
  const fmtV = (v: number) => (k === "return" ? `${v}%` : k === "wait" ? t("min", { n: v }) : $0(v));
  let fact = "";
  if (k === "sales") {
    const idx = sa.map((v, i) => [v ?? 0, i] as const).sort((x, y) => y[0] - x[0]);
    if (per === "day") fact = t("f_salesDay", { hour: `${bsA[idx[0][1]].label}–${bsA[Math.min(idx[0][1] + 1, bsA.length - 1)].label}`, amt: $0(idx[0][0]), day: weekday, cmp: $0(kpis(facts, soFar(p.cmp, p.cur, now)).sales) });
    else {
      const ended = idx.filter(([, i]) => bsA[i].to <= now);
      const worst = ended[ended.length - 1];
      fact = t("f_salesSpan", { best: bsA[idx[0][1]].label, pct: a.sales ? Math.round((idx[0][0] / a.sales) * 100) : 0, p: pl, worst: worst ? bsA[worst[1]].label : "—", amt: worst ? $0(worst[0]) : "—" });
    }
  } else if (k === "ticket") {
    const mine = facts.tickets.filter((x) => new Date(x.paidAt) >= cur.from && new Date(x.paidAt) < cur.to);
    fact = t("f_ticket", { n: mine.length, max: $0(Math.max(0, ...mine.map((x) => x.sales))), rebook: `${more(facts, cur, per).rebookedPct ?? 0}%` });
  } else if (k === "return") {
    fact = facts.lost.length ? t("f_return", { n: facts.lost.length, names: facts.lost.slice(0, 3).map((x) => x.name).join(", ") + (facts.lost.length > 3 ? "…" : "") }) : t("f_returnNone");
  } else if (k === "perhour") {
    fact = staffTable(facts, cur).filter((r) => r.perHour !== null).map((r) => `${r.name}: ${$0(r.perHour!)}/hr`).join(" · ") || t("noStaff");
  } else {
    const w = facts.walkins.filter((x) => new Date(x.came) >= cur.from && new Date(x.came) < cur.to);
    const waits = w.filter((x) => x.seatedAt).map((x) => Math.round((new Date(x.seatedAt!).getTime() - new Date(x.came).getTime()) / 60_000));
    fact = t("f_wait", { out: a.walkOuts, max: Math.max(0, ...waits), n: w.length });
  }
  return (
    <div className="card nm-chart" data-testid="nm-chart">
      <div className="nm-ch-head"><b>{t(`c_${k}`, { unit })}</b><span style={{ flex: 1 }} />
        <span className="cap"><i className="nm-sw" /> {t("thisP", { p: pl })} · <i className="nm-sw last" /> {t("lastP", { p: pl })}</span></div>
      <div className="minibars nm-bars" role="img" aria-label={t(`c_${k}`, { unit })}>
        {bsA.map((bk, i) => (
          <div className="b" key={i}>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: "100%", width: "100%" }}>
              <i style={{ height: `${((sa[i] ?? 0) / max) * 100}%` }} title={sa[i] === null ? "" : fmtV(sa[i]!)} />
              <i className="last" style={{ height: `${((sb[i] ?? 0) / max) * 100}%` }} title={sb[i] === null ? "" : fmtV(sb[i]!)} />
            </div>
            <span>{bk.label}</span>
          </div>))}
      </div>
      <div className="cap nm-fact" data-testid="nm-fact">{fact}</div>
    </div>
  );
}

function Board({ facts, now, per, k, setK, savedAt, salon }: { facts: Facts; now: Date; per: Period; k: KpiKey; setK: (k: KpiKey) => void; savedAt: string | null; salon: string }) {
  const t = useTranslations("numbers");
  const { cur } = useKpiView(facts, now, per);
  const m = more(facts, cur, per);
  const rows = staffTable(facts, cur);
  const pl = t(per);
  const csv = () => {
    const blob = new Blob([staffCsv(rows, `${cur.from.toISOString().slice(0, 10)}..${new Date(cur.to.getTime() - 1).toISOString().slice(0, 10)}`)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${salon.replace(/\W+/g, "-").toLowerCase()}-numbers-${per}.csv`; a.click();
  };
  const busiest = m.busiest ? (per === "day" ? m.busiest.from.toLocaleTimeString(undefined, { hour: "numeric" }) : `${m.busiest.from.toLocaleDateString(undefined, { weekday: "short" })} ${m.busiest.from.toLocaleTimeString(undefined, { hour: "numeric" })}`) : "—";
  const moreRows: [string, string, string][] = [
    [t("m_rebooked"), m.rebookedPct === null ? "—" : `${m.rebookedPct}%`, ""],
    [t("m_noShows"), String(m.noShows), m.noShowCents ? t("m_lost", { amt: $0(m.noShowCents) }) : ""],
    [t("m_new"), String(m.newClients), m.topSource ? t("m_from", { n: facts.tickets.filter((x) => x.newClient && x.source === m.topSource && new Date(x.paidAt) >= cur.from && new Date(x.paidAt) < cur.to).length, src: m.topSource }) : ""],
    [t("m_tips"), $0(m.tips), m.tipPct === null ? "" : t("m_tipPct", { n: m.tipPct })],
    [t("m_fees"), $0(m.fees), ""],
    [t("m_gift"), `${$0(m.giftSold)} / ${$0(m.giftUsed)}`, ""],
    [t("m_busiest"), busiest, ""],
  ];
  return (
    <main className="nm">
      <div className="nm-row"><span className="cap">{t(`vs_${periods(per, now).vs}`, { day: periods(per, now).cmp.from.toLocaleDateString(undefined, { weekday: "long" }) })}</span><span style={{ flex: 1 }} />
        <Button size="sm" onClick={csv} data-testid="nm-export">{t("export")}</Button></div>
      <KpiTiles facts={facts} now={now} per={per} k={k} setK={setK} lostN={facts.lost.length} />
      <div className="nm-mid">
        <KpiChart facts={facts} now={now} per={per} k={k} />
        <div className="group nm-more">
          <div className="eyebrow" style={{ padding: "12px 16px 6px" }}>{t("more", { p: pl.toLowerCase() })}</div>
          {moreRows.map(([n, v, s]) => <div key={n} className="row xs"><span style={{ flex: 1 }}>{n}</span><b>{v}</b><span className="cap" style={{ width: 92, textAlign: "right" }}>{s}</span></div>)}
        </div>
      </div>
      <div className="group nm-staff">
        <table className="dtable" data-testid="nm-staff">
          <thead><tr><th>{t("staffHead", { p: pl.toLowerCase() })}</th><th>{t("s_sales")}</th><th>{t("s_hours")}</th><th>{t("s_perhour")}</th><th>{t("s_ticket")}</th><th>{t("s_rebook")}</th><th>{t("s_tips")}</th><th>{t("s_turns")}</th></tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colSpan={8} className="cap">{t("noStaff")}</td></tr> : rows.map((r) => (
            <tr key={r.id}><td><b>{r.name}</b></td><td>{$0(r.sales)}</td><td>{r.hours}</td><td>{r.perHour === null ? "—" : $0(r.perHour)}</td><td>{$0(r.avgTicket)}</td>
              <td>{r.rebookedPct === null ? "—" : `${r.rebookedPct}%`}</td><td>{$0(r.tips)}</td><td>{r.turns}</td></tr>))}</tbody>
        </table>
      </div>
      <p className="cap">{t("factsOnly", { time: savedAt ? new Date(savedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—" })}</p>
    </main>
  );
}
