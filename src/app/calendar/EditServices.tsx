"use client";
// Edit services on a booking (booking details drawer): remove a service, add one from the menu (search by name
// or code), Save. Same start; the end follows the new length. Works offline (saved through the outbox).
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import { formatCents } from "@/lib/money";
import type { Desk } from "@/lib/desk";
import { putAppt, type Appt, type ApptService } from "@/lib/booking/appts";
import { codeHits, withCodes } from "@/lib/booking/serviceCodes";
import { totalCents, totalMinutes, withServices } from "@/lib/booking/editServices";

export function EditServices({ desk, a, onDone, say }: { desk: Desk; a: Appt; onDone: () => void; say: (s: string, undo?: () => void) => void }) {
  const t = useTranslations("calendar");
  const [svcs, setSvcs] = useState<ApptService[]>(a.services);
  const [q, setQ] = useState("");
  const coded = useMemo(() => withCodes(desk.services), [desk.services]);
  const ql = q.trim().toLowerCase();
  const hits = codeHits(q, coded);
  const found = ql ? (hits.length ? hits : coded.filter((s) => s.name.toLowerCase().includes(ql))).slice(0, 6) : [];
  const changed = JSON.stringify(svcs) !== JSON.stringify(a.services);
  const save = () => {
    const before = { ...a };
    putAppt(withServices(a, svcs));
    say(t("svcSaved", { n: svcs.length, min: totalMinutes(svcs) }), () => putAppt(before));
    onDone();
  };
  return (
    <div className="ad-edit" data-testid="svc-edit">
      <div className="group">
        {svcs.map((s, i) => <div key={i} className="row ad-svc">
          <span className="grow"><b>{s.name}</b><span className="cap">{t("min", { n: s.minutes })}</span></span>
          <b className="num">{formatCents(s.cents)}</b>
          <button type="button" className="ad-x" aria-label={t("svcRemove", { name: s.name })} data-testid="svc-remove"
            disabled={svcs.length === 1} onClick={() => setSvcs((x) => x.filter((_, j) => j !== i))}>×</button>
        </div>)}
        <div className="row ad-total"><b className="grow">{t("totalPreTip")}</b><b className="num">{formatCents(totalCents(svcs))}</b></div>
      </div>
      <input className="inp" data-testid="svc-add-q" aria-label={t("svcAdd")} placeholder={t("svcAdd")} autoComplete="off"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {found.length > 0 && <div className="group">
        {found.map((s) => <button type="button" key={s.id} className="row ad-svc ad-pick" data-testid="svc-add"
          onClick={() => { setSvcs((x) => [...x, { serviceId: s.id, name: s.name, minutes: s.minutes, cents: s.cents }]); setQ(""); }}>
          <span className="grow"><b>{s.name}</b><span className="cap">{s.code} · {t("min", { n: s.minutes })}</span></span>
          <b className="num">+{formatCents(s.cents)}</b>
        </button>)}
      </div>}
      <div className="cap">{t("svcEndNote", { min: totalMinutes(svcs) })}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="ghost" onClick={onDone}>{t("cancelEdit")}</Button>
        <Button variant="primary" disabled={!changed || !svcs.length} data-testid="svc-save" onClick={save}>{t("svcSave")}</Button>
      </div>
    </div>
  );
}
