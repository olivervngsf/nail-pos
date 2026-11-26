"use client";
// Settings → Activity log (design board "Settings, Activity log + Timesheet", Nov 25–26): one read-only list of what
// happened in the salon. Who, what, when, which device, result. Owner + manager only (server checks it too).
// Nothing here can be edited or deleted; Print and CSV make a record for a dispute, a labor claim or the accountant.
import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button, Chip, Drawer } from "@/components/kit";
import { rpc } from "@/lib/auth";
import {
  KINDS, activityCsv, actionKey, applyFilter, countKinds, demoActivity, facts, kindOf, needsLook, plainAction, toneOf,
  type ActivityRow, type Kind,
} from "@/lib/activity";
import SettingsShell, { type Access } from "../SettingsShell";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };

export default function ActivityLogPage() {
  const t = useTranslations("activity");
  return <SettingsShell title={t("title")}>{(a) => <Log a={a} />}</SettingsShell>;
}

function Log({ a }: { a: Access }) {
  const t = useTranslations("activity");
  const tr = useTranslations("account");
  const f = useFormatter();
  const params = useSearchParams();
  const today = iso(new Date());
  const [day, setDay] = useState(today);
  const [span, setSpan] = useState<1 | 7 | 31>(1);
  const [kind, setKind] = useState<Kind | "all">(() => {
    const k = params.get("kind");
    return k && (KINDS as readonly string[]).includes(k) ? (k as Kind) : "all";
  });
  const [person, setPerson] = useState("");
  const [device, setDevice] = useState("");
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<ActivityRow | null>(null);

  useEffect(() => {
    setRows(null); setErr("");
    const from = new Date(`${addDays(day, 1 - span)}T00:00:00`);
    const to = new Date(`${addDays(day, 1)}T00:00:00`);
    if (a.demo) {
      const all: ActivityRow[] = [];
      for (let i = 0; i < span; i++) all.push(...demoActivity(new Date(`${addDays(day, -i)}T12:00:00`)));
      setRows(all);
      return;
    }
    rpc<ActivityRow[]>("activity_log", { p_salon: a.salonId, p_from: from.toISOString(), p_to: to.toISOString() })
      .then((r) => setRows(r ?? []))
      .catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId, day, span]);

  const what = (action: string) => (t.has(`a.${actionKey(action)}`) ? t(`a.${actionKey(action)}`) : plainAction(action));
  const purpose = (p: unknown) => (typeof p === "string" && t.has(`purpose.${p}`) ? t(`purpose.${p}`) : null);
  const result = (action: string) => t(`tone.${toneOf(action)}`);
  const when = (at: string) => f.dateTime(new Date(at), span === 1 ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const roleWord = (r: string | null) => (r ? tr(`role.${r}`) : "");

  const counts = useMemo(() => countKinds(rows ?? []), [rows]);
  const people = useMemo(() => [...new Set((rows ?? []).flatMap((r) => [r.actor, r.subject]).filter(Boolean) as string[])].sort(), [rows]);
  const devices = useMemo(() => [...new Set((rows ?? []).map((r) => r.device).filter(Boolean) as string[])].sort(), [rows]);
  const shown = useMemo(() => applyFilter(rows ?? [], { kind, person, device }), [rows, kind, person, device]);

  if (err) return <p className="hint err">{err}</p>;

  const sub = (r: ActivityRow) => [purpose(r.detail?.purpose), r.subject ? t("for", { name: r.subject }) : null,
    ...facts(r.detail).filter(([k]) => k === "number" || k.endsWith("_cents")).map(([, v]) => v)].filter(Boolean).join(" · ");

  const exportCsv = () => {
    const blob = new Blob([activityCsv(shown, what, (at) => f.dateTime(new Date(at), { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }))], { type: "text/csv" });
    const el = document.createElement("a");
    el.href = URL.createObjectURL(blob); el.download = `activity-${addDays(day, 1 - span)}-to-${day}.csv`; el.click();
  };

  const pinWrong = (rows ?? []).filter((r) => r.action === "pin.wrong" || r.action === "pin.locked" || r.action === "pin.blocked").length;
  const looks = (rows ?? []).filter((r) => needsLook(r.action)).length;

  return (
    <>
      <div className="act-bar act-noprint">
        <Button size="sm" variant="ghost" aria-label={t("earlier")} onClick={() => setDay(addDays(day, -span))}>‹</Button>
        <input type="date" className="inp" value={day} max={today} aria-label={t("day")} onChange={(e) => e.target.value && setDay(e.target.value)} data-testid="act-day" />
        <Button size="sm" variant="ghost" aria-label={t("later")} disabled={day >= today} onClick={() => setDay(addDays(day, span) > today ? today : addDays(day, span))}>›</Button>
        {([1, 7, 31] as const).map((d) => <Chip key={d} on={span === d} onClick={() => setSpan(d)}>{t(`span${d}`)}</Chip>)}
        <span className="act-spacer" />
        <select className="inp act-sel" value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t("person")} data-testid="act-person">
          <option value="">{t("everyone")}</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="inp act-sel" value={device} onChange={(e) => setDevice(e.target.value)} aria-label={t("device")}>
          <option value="">{t("allDevices")}</option>
          {devices.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <Button size="sm" className="act-print" onClick={() => window.print()}>{t("print")}</Button>
        <Button size="sm" onClick={exportCsv} disabled={!shown.length} data-testid="act-csv">{t("csv")}</Button>
      </div>

      <div className="act-tiles">
        <div className="act-tile"><span className="eyebrow">{t("tile.events")}</span><b>{rows ? rows.length : "–"}</b><span className="cap">{t("tile.people", { n: people.length })}</span></div>
        <div className="act-tile"><span className="eyebrow">{t("tile.wrongPin")}</span><b className={pinWrong ? "warn" : ""}>{rows ? pinWrong : "–"}</b><span className="cap">{t("tile.wrongPinSub")}</span></div>
        <div className="act-tile"><span className="eyebrow">{t("tile.money")}</span><b>{rows ? counts.money : "–"}</b><span className="cap">{t("tile.moneySub")}</span></div>
        <div className="act-tile"><span className="eyebrow">{t("tile.look")}</span><b className={looks ? "warn" : ""}>{rows ? looks : "–"}</b><span className="cap">{t("tile.lookSub")}</span></div>
      </div>

      <div className="set-chips act-kinds act-noprint" role="group" aria-label={t("kinds")}>
        {(["all", ...KINDS] as const).map((k) => (
          <Chip key={k} on={kind === k} onClick={() => setKind(k)} data-testid={`act-kind-${k}`}>
            {t(`kind.${k}`)} <span className="num" style={{ opacity: 0.6 }}>{counts[k] ?? 0}</span>
          </Chip>
        ))}
      </div>

      <div className="group" data-testid="act-log" aria-busy={!rows}>
        <div className="act-row head" aria-hidden><span>{t("time")}</span><span>{t("who")}</span><span>{t("what")}</span><span>{t("device")}</span><span>{t("result")}</span></div>
        {shown.map((r, i) => (
          <button key={`${r.at}-${i}`} type="button" className="act-row" onClick={() => setOpen(r)} data-testid="act-row">
            <span className="act-time num cap" style={{ color: "var(--ink)" }}>{when(r.at)}</span>
            <span className="act-who"><b className="ell">{r.actor ?? t("system")}</b><span className="cap">{roleWord(r.actor_role)}</span></span>
            <span className="act-what"><span className="ell">{what(r.action)}</span>{sub(r) && <span className="cap ell">{sub(r)}</span>}</span>
            <span className="act-dev cap ell">{r.device ?? t("ownLogin")}</span>
            <span className="act-res"><span className={`act-tag ${toneOf(r.action)}`}>{result(r.action)}</span></span>
          </button>
        ))}
        {rows && !shown.length && <div className="row"><span className="cap">{t("none")}</span></div>}
      </div>
      <div className="cap">{t("note")}</div>

      {open && (
        <Drawer title={what(open.action)} onClose={() => setOpen(null)}
          footer={<><Button onClick={() => window.print()}>{t("print")}</Button>{open.actor && <Button onClick={() => { setPerson(open.actor!); setKind("all"); setOpen(null); }}>{t("seeAll", { name: open.actor.split(" ")[0] })}</Button>}</>}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 16 }}>{what(open.action)}</b><span className="cap">{t(`kind.${kindOf(open.action) === "other" ? "all" : kindOf(open.action)}`)}</span></span>
            <span className={`act-tag ${toneOf(open.action)}`}>{result(open.action)}</span>
          </div>
          <dl className="act-kv" data-testid="act-detail">
            <dt>{t("when")}</dt><dd className="num">{f.dateTime(new Date(open.at), { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}</dd>
            <dt>{t("who")}</dt><dd>{open.actor ?? t("system")}{open.actor_role ? ` · ${roleWord(open.actor_role)}` : ""}</dd>
            {open.subject && <><dt>{t("forHead")}</dt><dd>{open.subject}</dd></>}
            <dt>{t("device")}</dt><dd>{open.device ?? t("ownLogin")}</dd>
            {facts(open.detail).map(([k, v]) => (
              <span key={k} style={{ display: "contents" }}><dt>{t.has(`fact.${k}`) ? t(`fact.${k}`) : k}</dt><dd>{k === "purpose" ? purpose(v) ?? v : v}</dd></span>
            ))}
          </dl>
          <p className="cap">{t("drawerNote")}</p>
        </Drawer>
      )}
    </>
  );
}
