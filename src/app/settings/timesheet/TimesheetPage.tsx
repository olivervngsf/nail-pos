"use client";
// Settings → Team + time clock → Timesheet (design board "Settings, Activity log + Timesheet", Nov 25–26).
// Every clock in/out per person: today (pairs, break, hours, how, status) or a week (hours per day, total, flags).
// Fix a time or add a missing clock-out: the old time stays on record with who + why, and shows in the Activity log.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Banner, Button, Chip, Drawer, Segmented } from "@/components/kit";
import { rpc } from "@/lib/auth";
import {
  buildDay, buildDays, dayList, demoTimesheet, fmtMin, timesheetCsv, weekOver, weekStart,
  type Day, type Punch, type TsRow,
} from "@/lib/timesheet";
import SettingsShell, { type Access } from "../SettingsShell";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const REASONS = ["forgot", "device_off", "wrong_person", "other"] as const;
type Reason = (typeof REASONS)[number];
type FixTarget = { row: TsRow; day: string; punch: Punch | null; kind: "in" | "out" };

export default function TimesheetPage() {
  const t = useTranslations("timesheet");
  return <SettingsShell title={t("title")}>{(a) => <Sheet a={a} />}</SettingsShell>;
}

function Sheet({ a }: { a: Access }) {
  const t = useTranslations("timesheet");
  const tr = useTranslations("account");
  const f = useFormatter();
  const today = iso(new Date());
  const [view, setView] = useState<"day" | "week">("day");
  const [day, setDay] = useState(today);
  const [rows, setRows] = useState<TsRow[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<TsRow | null>(null);
  const [fix, setFix] = useState<FixTarget | null>(null);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => { const i = setInterval(() => setNowIso(new Date().toISOString()), 60_000); return () => clearInterval(i); }, []);

  const from = view === "day" ? day : weekStart(day);
  const to = view === "day" ? day : addDays(weekStart(day), 6);
  const days = useMemo(() => dayList(from, to), [from, to]);

  const load = useCallback(() => {
    setErr("");
    if (a.demo) { setRows(demoTimesheet(today)); return; }
    rpc<TsRow[]>("timesheet", { p_salon: a.salonId, p_from: from, p_to: to }).then((r) => setRows(r ?? [])).catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId, from, to, today]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const time = (at: string) => f.dateTime(new Date(at), { hour: "numeric", minute: "2-digit" });
  const role = (r: string) => tr(`role.${r}`);
  if (err) return <p className="hint err">{err}</p>;

  // Facts for the tiles + the "needs a fix" banner (always over the last 7 days, so a forgotten clock-out shows up).
  const dayOf = (r: TsRow, d: string) => buildDay(d, r.events, today, nowIso, r.refused);
  const all = rows ?? [];
  const inNow = all.filter((r) => dayOf(r, today).openNow).length;
  const needFix = all.flatMap((r) => dayList(addDays(today, -7), addDays(today, -1)).map((d) => ({ r, d: dayOf(r, d) })).filter((x) => x.d.missingOut));
  const periodDays = all.map((r) => ({ r, ds: buildDays(r, days, today, nowIso) }));
  const totalMin = periodDays.reduce((s, x) => s + x.ds.reduce((a2, d) => a2 + d.workedMin, 0), 0);
  const mealLate = periodDays.filter((x) => x.ds.some((d) => d.mealLate)).length;
  const overtime = periodDays.filter((x) => x.ds.some((d) => d.over8) || weekOver(x.ds)).length;

  const exportCsv = () => {
    const blob = new Blob([timesheetCsv(all, days, today, nowIso, time)], { type: "text/csv" });
    const el = document.createElement("a");
    el.href = URL.createObjectURL(blob); el.download = `timesheet-${from}-to-${to}.csv`; el.click();
  };
  const step = view === "day" ? 1 : 7;

  return (
    <>
      <div className="act-bar act-noprint">
        <Segmented label={t("view")} value={view} onChange={setView} options={[{ value: "day", label: t("day") }, { value: "week", label: t("week") }]} />
        <Button size="sm" variant="ghost" aria-label={t("earlier")} onClick={() => setDay(addDays(day, -step))}>‹</Button>
        <b style={{ fontSize: 15 }} data-testid="ts-range">
          {view === "day"
            ? (day === today ? t("today") : f.dateTime(new Date(`${day}T12:00:00`), { weekday: "short", month: "short", day: "numeric" }))
            : `${f.dateTime(new Date(`${from}T12:00:00`), { month: "short", day: "numeric" })} – ${f.dateTime(new Date(`${to}T12:00:00`), { month: "short", day: "numeric" })}`}
        </b>
        <Button size="sm" variant="ghost" aria-label={t("later")} disabled={addDays(day, step) > today && day >= today} onClick={() => setDay(addDays(day, step) > today ? today : addDays(day, step))}>›</Button>
        <span className="act-spacer" />
        <Button size="sm" className="act-print" onClick={() => window.print()}>{t("print")}</Button>
        <Button size="sm" onClick={exportCsv} disabled={!all.length} data-testid="ts-csv">{t("csv")}</Button>
      </div>

      {needFix.length > 0 && (
        <Banner tone="warn" title={t("fixTitle", { n: needFix.length })} data-testid="ts-needfix"
          action={<Button size="sm" onClick={() => { const x = needFix[0]; setFix({ row: x.r, day: x.d.day, punch: null, kind: "out" }); }}>{t("fixTime")}</Button>}>
          {t("fixBody", { name: needFix[0].r.name, day: f.dateTime(new Date(`${needFix[0].d.day}T12:00:00`), { weekday: "short", month: "short", day: "numeric" }) })}
        </Banner>
      )}

      <div className="act-tiles">
        <div className="act-tile"><span className="eyebrow">{t("tile.inNow")}</span><b>{rows ? `${inNow}` : "–"}<span className="cap" style={{ fontWeight: 400 }}> / {all.length}</span></b><span className="cap">{t("tile.inNowSub")}</span></div>
        <div className="act-tile"><span className="eyebrow">{t("tile.hours")}</span><b>{rows ? fmtMin(totalMin) : "–"}</b><span className="cap">{view === "day" ? t("tile.hoursDay") : t("tile.hoursWeek")}</span></div>
        <div className="act-tile"><span className="eyebrow">{t("tile.meal")}</span><b className={mealLate ? "warn" : ""}>{rows ? mealLate : "–"}</b><span className="cap">{t("tile.mealSub")}</span></div>
        <div className="act-tile"><span className="eyebrow">{t("tile.ot")}</span><b className={overtime ? "warn" : ""}>{rows ? overtime : "–"}</b><span className="cap">{t("tile.otSub")}</span></div>
      </div>

      {view === "day" ? (
        <div className="group" data-testid="ts-day" aria-busy={!rows}>
          <div className="ts-row head" aria-hidden><span>{t("person")}</span><span>{t("inOut")}</span><span>{t("break")}</span><span>{t("hours")}</span><span>{t("now")}</span></div>
          {all.map((r) => {
            const d = dayOf(r, day);
            return (
              <button key={r.membership_id} type="button" className="ts-row" onClick={() => setOpen(r)} data-testid={`ts-${r.name}`}>
                <span className="ts-who"><b>{r.name}</b><span className="cap">{role(r.role)}</span></span>
                <span className="ts-pairs"><span className="num">{pairsText(d, time, t("now"), t("notIn"))}</span>
                  {d.refused.length > 0 && <span className="cap ts-warn">{t("refusedAt", { time: time(d.refused[0].at) })}</span>}
                  {d.mealLate && <span className="cap ts-warn">{t("mealLate")}</span>}</span>
                <span className="num cap">{d.breakMin ? fmtMin(d.breakMin) : "—"}</span>
                <b className="num">{fmtMin(d.workedMin)}</b>
                <span><StateTag d={d} t={t} /></span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="group set-table" data-testid="ts-week" aria-busy={!rows}>
          <table className="dtable">
            <thead><tr><th>{t("person")}</th>{days.map((d) => <th key={d}>{f.dateTime(new Date(`${d}T12:00:00`), { weekday: "short" })}</th>)}<th>{t("total")}</th><th>{t("flags")}</th></tr></thead>
            <tbody>
              {periodDays.map(({ r, ds }) => {
                const tot = ds.reduce((s, d) => s + d.workedMin, 0);
                const flags = [ds.some((d) => d.missingOut) && t("flag.fix"), (weekOver(ds) || ds.some((d) => d.over8)) && t("flag.ot"), ds.some((d) => d.mealLate) && t("flag.meal")].filter(Boolean) as string[];
                return (
                  <tr key={r.membership_id} onClick={() => setOpen(r)} style={{ cursor: "pointer" }}>
                    <td><b>{r.name}</b></td>
                    {ds.map((d) => <td key={d.day} className={d.missingOut ? "ts-cell-warn" : ""}>{d.workedMin ? fmtMin(d.workedMin) : d.missingOut ? "!" : "—"}</td>)}
                    <td><b>{fmtMin(tot)}</b></td>
                    <td>{flags.length ? flags.map((x) => <span key={x} className="act-tag warn" style={{ marginLeft: 4 }}>{x}</span>) : <span className="act-tag ok">{t("flag.ok")}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="cap">{t("note")}</div>

      {open && !fix && (
        <PersonDrawer row={open} days={view === "day" ? [day] : days} today={today} nowIso={nowIso} time={time}
          onClose={() => setOpen(null)} onFix={(x) => setFix(x)} />
      )}
      {fix && (
        <FixDrawer a={a} target={fix} time={time}
          onClose={() => setFix(null)}
          onSaved={() => { setFix(null); setOpen(null); load(); }}
          onDemoSaved={(eventsAfter) => { setRows((rs) => (rs ?? []).map((r) => r.membership_id === fix.row.membership_id ? { ...r, events: eventsAfter } : r)); setFix(null); setOpen(null); }} />
      )}
    </>
  );
}

function pairsText(d: Day, time: (s: string) => string, now: string, notIn: string) {
  if (!d.pairs.length) return notIn;
  return d.pairs.map((p) => `${p.in ? time(p.in.at) : "?"} → ${p.out ? time(p.out.at) : p.open ? now : "?"}`).join(" · ");
}

function StateTag({ d, t }: { d: Day; t: ReturnType<typeof useTranslations> }) {
  if (d.missingOut) return <span className="act-tag bad">{t("state.fix")}</span>;
  if (d.openNow) return <span className="act-tag ok">{t("state.in")}</span>;
  if (d.refused.length && !d.pairs.length) return <span className="act-tag warn">{t("state.refused")}</span>;
  if (d.pairs.length) return <span className="act-tag">{t("state.out")}</span>;
  return <span className="cap">{t("state.off")}</span>;
}

function PersonDrawer({ row, days, today, nowIso, time, onClose, onFix }: {
  row: TsRow; days: string[]; today: string; nowIso: string; time: (s: string) => string;
  onClose: () => void; onFix: (x: FixTarget) => void;
}) {
  const t = useTranslations("timesheet");
  const f = useFormatter();
  const shown = buildDays(row, days, today, nowIso).filter((d) => d.pairs.length || d.refused.length);
  return (
    <Drawer title={row.name} onClose={onClose}>
      {!shown.length && <p className="cap">{t("noPunches")}</p>}
      {shown.map((d) => (
        <div key={d.day} className="ts-dday">
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <b style={{ flex: 1 }}>{f.dateTime(new Date(`${d.day}T12:00:00`), { weekday: "long", month: "short", day: "numeric" })}</b>
            <span className="num cap">{fmtMin(d.workedMin)}</span>
          </div>
          {d.pairs.flatMap((p, i) => [p.in, p.out].map((x, j) => ({ x, kind: (j ? "out" : "in") as "in" | "out", key: `${i}-${j}`, open: !!p.open && j === 1 })))
            .map(({ x, kind, key, open }) => (
              <div key={key} className="ts-punch">
                <span className="cap" style={{ width: 70 }}>{kind === "in" ? t("in") : t("out")}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {x ? <b className="num">{time(x.at)}</b> : <span className="ts-warn">{open ? t("stillIn") : t("missing")}</span>}
                  {x?.fix && <span className="cap" style={{ display: "block" }}>{x.fix.old_at ? t("wasAt", { time: time(x.fix.old_at), by: x.fix.by }) : t("addedBy", { by: x.fix.by })} · {t(`reason.${x.fix.reason}`)}</span>}
                  {x && !x.fix && <span className="cap" style={{ display: "block" }}>{x.device ?? t(`via.${x.via ?? "device"}`)}</span>}
                </span>
                {x ? <Button size="sm" onClick={() => onFix({ row, day: d.day, punch: x, kind })}>{t("fix")}</Button>
                  : !open && <Button size="sm" variant="primary" onClick={() => onFix({ row, day: d.day, punch: null, kind })} data-testid="ts-add-missing">{t("add")}</Button>}
              </div>
            ))}
          {d.refused.map((r) => <div key={r.at} className="cap ts-warn">{t("refusedAt", { time: time(r.at) })}</div>)}
        </div>
      ))}
      <p className="cap">{t("drawerNote")}</p>
    </Drawer>
  );
}

const TIMES = Array.from({ length: (23 - 5) * 12 + 1 }, (_, i) => {
  const m = 5 * 60 + i * 5;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const twelve = (hm: string) => { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

function FixDrawer({ a, target, time, onClose, onSaved, onDemoSaved }: {
  a: Access; target: FixTarget; time: (s: string) => string; onClose: () => void; onSaved: () => void; onDemoSaved: (events: Punch[]) => void;
}) {
  const t = useTranslations("timesheet");
  const f = useFormatter();
  const startHm = target.punch ? (() => { const d = new Date(target.punch!.at); return `${String(d.getHours()).padStart(2, "0")}:${String(Math.round(d.getMinutes() / 5) * 5 % 60).padStart(2, "0")}`; })() : "18:00";
  const [hm, setHm] = useState(TIMES.includes(startHm) ? startHm : "18:00");
  const [reason, setReason] = useState<Reason>("forgot");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const newAt = new Date(`${target.day}T${hm}:00`);
  const future = newAt.getTime() > Date.now() + 5 * 60_000;

  const save = async () => {
    setBusy(true); setErr("");
    try {
      if (a.demo) {
        const fixInfo = { old_at: target.punch?.at ?? null, reason, note: note || null, by: "Owner (test)", at: new Date().toISOString() };
        const ev = target.row.events;
        const next: Punch[] = target.punch
          ? ev.map((p) => p.id === target.punch!.id ? { ...p, at: newAt.toISOString(), fix: fixInfo } : p)
          : [...ev, { id: Date.now(), kind: target.kind, at: newAt.toISOString(), day: target.day, via: "fix", device: null, fix: fixInfo }];
        onDemoSaved(next); return;
      }
      await rpc("clock_fix", { p_salon: a.salonId, p_membership: target.row.membership_id, p_event: target.punch?.id ?? null, p_kind: target.kind, p_at: newAt.toISOString(), p_reason: reason, p_note: note || null });
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Drawer title={target.punch ? t("fixTitleOne", { name: target.row.name }) : t("addTitle", { name: target.row.name })} onClose={onClose}
      footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" style={{ flex: 1 }} disabled={busy || future} onClick={() => void save()} data-testid="ts-save-fix">{busy ? t("saving") : t("saveFix")}</Button></>}>
      <div className="cap">{f.dateTime(new Date(`${target.day}T12:00:00`), { weekday: "long", month: "short", day: "numeric" })} · {target.kind === "in" ? t("in") : t("out")}</div>
      {target.punch && <div className="ts-ba"><div><span className="cap">{t("now")}</span><b className="num">{time(target.punch.at)}</b></div><span className="cap">→</span><div className="after"><span className="cap">{t("realTime")}</span><b className="num">{twelve(hm)}</b></div></div>}
      <label><span className="lbl">{target.kind === "in" ? t("inTime") : t("outTime")}</span>
        <select className="inp" value={hm} onChange={(e) => setHm(e.target.value)} data-testid="ts-time">{TIMES.map((x) => <option key={x} value={x}>{twelve(x)}</option>)}</select>
      </label>
      {future && <p className="hint err">{t("future")}</p>}
      <div><span className="lbl">{t("why")}</span><div className="set-chips">{REASONS.map((r) => <Chip key={r} on={reason === r} onClick={() => setReason(r)}>{t(`reason.${r}`)}</Chip>)}</div></div>
      <label><span className="lbl">{t("noteLabel")}</span><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} /></label>
      {err && <p className="hint err">{err}</p>}
      <div className="note">{t("fixNote", { name: target.row.name.split(" ")[0] })}</div>
    </Drawer>
  );
}
