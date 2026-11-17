"use client";
// Settings → PIN activity (board 5.2): every PIN try, lock, device + team change. Server-written; nobody can edit it.
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Chip, DataTable } from "@/components/kit";
import { rpc, type Role } from "@/lib/auth";
import SettingsShell, { type Access } from "../SettingsShell";

type Ev = { at: string; action: string; purpose: string | null; person: string | null; role: Role | null; device: string | null };
const BAD = new Set(["pin.wrong", "pin.locked", "pin.blocked"]);

function demoLog(): Ev[] {
  const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  return [
    { at: at(14, 16), action: "pin.ok", purpose: "unlock", person: "Lan Phan", role: "front_desk", device: "Front desk" },
    { at: at(14, 14), action: "desk.locked", purpose: null, person: "Hanh Le", role: "front_desk", device: "Front desk" },
    { at: at(12, 10), action: "pin.ok", purpose: "approve_discount", person: "Bao Tran", role: "manager", device: "Front desk" },
    { at: at(11, 42), action: "pin.ok", purpose: "earnings", person: "Vy Hoang", role: "tech", device: "Time clock" },
    { at: at(11, 5), action: "pin.wrong", purpose: "unlock", person: "Tuan Do", role: "tech", device: "Time clock" },
    { at: at(9, 30), action: "pin.ok", purpose: "clock_in", person: "Kim Vo", role: "tech", device: "Time clock" },
    { at: at(9, 0), action: "pin.ok", purpose: "unlock", person: "Hanh Le", role: "front_desk", device: "Front desk" },
  ];
}

export default function PinActivityPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.pinActivity")}>{(a) => <Log a={a} />}</SettingsShell>;
}

function Log({ a }: { a: Access }) {
  const t = useTranslations("settings.log");
  const f = useFormatter();
  const [days, setDays] = useState<1 | 7 | 31>(1);
  const [problems, setProblems] = useState(false);
  const [rows, setRows] = useState<Ev[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setRows(null);
    if (a.demo) { setRows(demoLog()); return; }
    void rpc<Ev[]>("pin_activity", { p_salon: a.salonId, p_days: days }).then(setRows).catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId, days]);
  if (err) return <p className="hint err">{err}</p>;
  if (!rows) return <div aria-busy="true" />;

  const pins = rows.filter((r) => r.action.startsWith("pin."));
  const shown = problems ? rows.filter((r) => BAD.has(r.action)) : rows;
  const what = (r: Ev) => (r.purpose ? t(`purpose.${r.purpose}`) : t(`action.${r.action.replace(".", "_")}`));
  const result = (r: Ev) => <span className={`tag${BAD.has(r.action) ? " set-warn" : r.action === "pin.ok" ? " jade" : ""}`}>{t(`result.${r.action.replace(".", "_")}`)}</span>;

  return (
    <>
      <div className="card stat-grid" style={{ ["--n" as string]: 4, padding: "14px 10px" }}>
        <div><b>{pins.length}</b><span className="cap">{t("uses")}</span></div>
        <div><b>{new Set(pins.map((r) => r.person)).size}</b><span className="cap">{t("people")}</span></div>
        <div><b>{rows.filter((r) => r.purpose?.startsWith("approve_")).length}</b><span className="cap">{t("approvals")}</span></div>
        <div><b style={{ color: "var(--orange)" }}>{rows.filter((r) => BAD.has(r.action)).length}</b><span className="cap">{t("wrong")}</span></div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {([1, 7, 31] as const).map((d) => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{t(`days${d}`)}</Chip>)}
        <Chip on={problems} onClick={() => setProblems((p) => !p)}>{t("onlyProblems")}</Chip>
      </div>
      <div className="group set-table" data-testid="pin-log">
        <DataTable head={[t("time"), t("person"), t("device"), t("what"), t("result.head")]}
          rows={shown.map((r) => [f.dateTime(new Date(r.at), days === 1 ? { hour: "numeric", minute: "2-digit" } : { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }),
            r.person ?? "—", r.device ?? "—", what(r), result(r)])} />
        {!shown.length && <div className="row"><span className="cap">{t("none")}</span></div>}
      </div>
      <div className="cap">{t("note")}</div>
    </>
  );
}
