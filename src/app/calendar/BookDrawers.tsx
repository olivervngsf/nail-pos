"use client";
// Quick-book card (D2: phone first, top services, who is free, time, repeat, reminder texts) and the booking details
// panel (D4 peek / D12 details: confirm, check in → checkout, no-show, cancel, client profile).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip, Drawer } from "@/components/kit";
import { e164, rpc } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { getActing, type Desk } from "@/lib/desk";
import { getTicket, putTicket } from "@/lib/checkout/store";
import { putAppt, type Appt, type ApptService, type ApptSource } from "@/lib/booking/appts";
import { at, fmtMin, isFree, minutesOf, repeatDays } from "@/lib/booking/grid";

export type BookDraft = { day: string; start: number; minutes: number; staffId?: string };

/** What the calendar shows: a checked-in ticket that's paid = done. */
export function statusOf(a: Appt): Appt["status"] {
  if (a.status === "arrived" && a.ticketId && (getTicket(a.ticketId)?.status === "paid" || a.ticketStatus === "paid")) return "done";
  return a.status;
}

type Found = { client_id: string; name: string; notes: string; visits: number; last_services: string | null };

export function BookDrawer({ desk, draft, all, onClose, onBooked }: { desk: Desk; draft: BookDraft; all: Appt[]; onClose: () => void; onBooked: (n: number, name: string) => void }) {
  const t = useTranslations("calendar");
  const [source, setSource] = useState<ApptSource>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [svcs, setSvcs] = useState<ApptService[]>([]);
  const [q, setQ] = useState("");
  const [staffId, setStaffId] = useState<string | undefined>(draft.staffId);
  const [start, setStart] = useState(draft.start);
  const [day, setDay] = useState(draft.day);
  const [rep, setRep] = useState<{ every: number; times: number } | null>(null);
  const [note, setNote] = useState("");
  const minutes = svcs.reduce((a, s) => a + s.minutes, 0) || draft.minutes;

  useEffect(() => {
    if (!phoneOk(phone) || desk.mode !== "live") { setFound(null); return; }
    let off = false;
    void rpc<Found[]>("client_lookup", { p_salon: desk.salonId, p_phone: e164(phone) }).then((r) => {
      if (off) return;
      const c = r[0] ?? null;
      setFound(c);
      if (c?.name && !name) setName(c.name);
    }).catch(() => { /* offline: book anyway */ });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, desk.mode, desk.salonId]);

  const top = useMemo(() => desk.services.slice(0, 6), [desk.services]);
  const matches = q.length >= 2 ? desk.services.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const busyOf = (sid: string) => all
    .filter((a) => a.staffId === sid && a.status !== "canceled" && a.status !== "no_show" && new Date(a.start).toDateString() === new Date(at(day, 0)).toDateString())
    .map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) }));
  const techs = desk.staff.filter((s) => s.role === "tech");
  const who = [...techs].sort((a, b) => Number(isFree(busyOf(b.id), start, start + minutes)) - Number(isFree(busyOf(a.id), start, start + minutes)));
  const ok = (phoneOk(phone) || name.trim()) && svcs.length > 0;

  const add = (s: { id?: string; name: string; minutes: number; cents: number }) => setSvcs((x) => [...x, { serviceId: s.id, name: s.name, minutes: s.minutes, cents: s.cents }]);
  const book = () => {
    const days = rep ? repeatDays(day, rep.every, rep.times) : [day];
    const rule = rep ? { id: crypto.randomUUID(), everyWeeks: rep.every, times: rep.times } : undefined;
    const client = { name: name.trim() || found?.name || "", phone: phoneOk(phone) ? e164(phone) : "" };
    for (const d of days) {
      putAppt({ id: crypto.randomUUID(), salonId: desk.salonId, start: at(d, start), end: at(d, start + minutes), staffId: staffId ?? null,
        client, services: svcs, status: "booked", source, note, repeat: rule, repeatRuleId: rule?.id, updatedAt: "" });
    }
    onBooked(days.length, client.name || fmtPhone(client.phone));
  };

  return (
    <Drawer title={t("newBooking")} onClose={onClose} footer={<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Button variant="primary" block disabled={!ok} onClick={book} data-testid="book-save">{rep ? t("bookTimes", { n: rep.times }) : t("bookIt")}</Button>
      <span className="cap">{t("textNote")}</span>
    </div>}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input className="inp" type="date" aria-label={t("date")} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ width: 160, height: 40 }} />
        <select className="inp" aria-label={t("time")} value={start} onChange={(e) => setStart(Number(e.target.value))} style={{ width: 120, height: 40 }} data-testid="book-time">
          {Array.from({ length: 52 }, (_, i) => 8 * 60 + i * 15).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
        </select>
        <span className="cap">· {t("min", { n: minutes })}</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="cap" style={{ width: 40 }}>{t("from")}</span>
        {(["phone", "walk_in", "text", "desk"] as ApptSource[]).map((s) => <Chip key={s} on={source === s} onClick={() => setSource(s)}>{t(`src_${s}`)}</Chip>)}</div>
      <input className="inp" inputMode="tel" placeholder={t("phoneFirst")} aria-label={t("phone")} value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} data-testid="book-phone" style={{ border: "1.5px solid var(--ink)" }} />
      <input className="inp" placeholder={t("name")} aria-label={t("name")} value={name} onChange={(e) => setName(e.target.value)} data-testid="book-name" />
      {found && <div className="cap fade" style={{ background: "#F5F5F7", borderRadius: 8, padding: "6px 8px" }}>
        {t("usually", { name: found.name, n: found.visits })}{found.last_services ? `: ${found.last_services}` : ""}{found.notes ? ` · ${found.notes}` : ""}</div>}
      <div className="eyebrow">{t("service")}</div>
      {svcs.length > 0 && <div className="group">{svcs.map((s, i) => (
        <div className="row" key={i}><span className="grow">{s.name}</span><span className="cap">{t("min", { n: s.minutes })}</span><b className="num">{formatCents(s.cents)}</b>
          <Button size="sm" variant="ghost" aria-label={`${t("remove")} ${s.name}`} onClick={() => setSvcs(svcs.filter((_, j) => j !== i))}>✕</Button></div>))}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{top.map((s) => <Chip key={s.id} onClick={() => add(s)} data-testid="book-svc">{s.name}</Chip>)}</div>
      <input className="inp" placeholder={t("allServices")} aria-label={t("allServices")} value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 40 }} />
      {matches.length > 0 && <div className="group">{matches.map((s) => <button key={s.id} type="button" className="opt" onClick={() => { add(s); setQ(""); }}><span className="grow">{s.name}</span><span className="cap">{formatCents(s.cents)}</span></button>)}</div>}
      <div className="eyebrow">{t("who")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip on={!staffId} onClick={() => setStaffId(undefined)}>{t("anyone")}</Chip>
        {who.map((s) => { const free = isFree(busyOf(s.id), start, start + minutes); return (
          <Chip key={s.id} on={staffId === s.id} onClick={() => setStaffId(s.id)} data-testid={`book-staff-${s.name}`}>{s.name}{free ? "" : ` · ${t("busy")}`}</Chip>); })}
      </div>
      {staffId && !isFree(busyOf(staffId), start, start + minutes) && <div className="cap" style={{ color: "#B5470A" }}>⚠ {t("overlapWarn")}</div>}
      <div className="eyebrow">{t("repeat")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip on={!rep} onClick={() => setRep(null)}>{t("noRepeat")}</Chip>
        {[2, 3, 4, 6].map((w) => <Chip key={w} on={rep?.every === w} onClick={() => setRep({ every: w, times: rep?.times ?? 6 })}>{t("everyWk", { n: w })}</Chip>)}
      </div>
      {rep && <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="cap">{t("times")}</span>
        {[4, 6, 12].map((n) => <Chip key={n} on={rep.times === n} onClick={() => setRep({ ...rep, times: n })}>{n}×</Chip>)}</div>}
      <input className="inp" placeholder={t("notePh")} aria-label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} style={{ height: 40 }} />
    </Drawer>
  );
}

export function DetailsDrawer({ desk, a, onClose, say }: { desk: Desk; a: Appt; onClose: () => void; say: (s: string, undo?: () => void) => void }) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const st = statusOf(a);
  const staff = desk.staff.find((s) => s.id === a.staffId);
  const set = (status: Appt["status"], msg: string) => { const before = { ...a }; putAppt({ ...a, status }); say(msg, () => putAppt(before)); onClose(); };
  const checkIn = () => {
    const id = a.ticketId && getTicket(a.ticketId) ? a.ticketId : crypto.randomUUID();
    if (!getTicket(id)) {
      const by = getActing()?.membership_id ?? desk.me.membership_id;
      putTicket({ id, salonId: desk.salonId, status: "open", createdAt: new Date().toISOString(), tips: {}, note: a.note, openedBy: by, deviceId: desk.device?.id,
        client: a.client?.phone ? { phone: a.client.phone, name: a.client.name } : undefined,
        lines: a.services.map((s) => ({ id: crypto.randomUUID(), serviceId: s.serviceId, name: s.name, minutes: s.minutes, cents: s.cents,
          staffId: a.staffId ?? undefined, staffName: staff?.name })) }, { now: true });
    }
    putAppt({ ...a, status: "arrived", ticketId: id });
    router.push(`/checkout/${id}`);
  };
  const sm = minutesOf(a.start), em = minutesOf(a.end);
  return (
    <Drawer title={a.client?.name || t("walkIn")} onClose={onClose} footer={<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(st === "booked" || st === "confirmed" || st === "arrived") && <Button variant="primary" block onClick={checkIn} data-testid="check-in">{st === "arrived" ? t("openTicket") : t("checkIn")}</Button>}
      {st === "done" && a.ticketId && <Button block onClick={() => router.push(`/checkout/${a.ticketId}`)}>{t("openTicket")}</Button>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {st === "booked" && <Button onClick={() => set("confirmed", t("confirmedMsg"))} data-testid="confirm">{t("confirm")}</Button>}
        {(st === "booked" || st === "confirmed") && <Button onClick={() => set("no_show", t("noShowMsg"))}>{t("noShow")}</Button>}
        {(st === "booked" || st === "confirmed") && <Button variant="ghost" onClick={() => set("canceled", t("canceledMsg"))} data-testid="cancel-appt">{t("cancel")}</Button>}
        {(st === "canceled" || st === "no_show") && <Button onClick={() => set("booked", t("restoredMsg"))}>{t("restore")}</Button>}
      </div>
    </div>}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className={`tag ${st === "confirmed" || st === "arrived" ? "jade" : ""}`} data-testid="appt-status">{t(`st_${st}`)}</span>
        <span className="tag">{t(`src_${a.source}`)}</span>
        {a.repeatRuleId && <span className="tag">{t("repeats")}</span>}
      </div>
      {a.client?.care && <div className="card cl-care"><b>▲ {t("care")}</b></div>}
      <div className="group">
        <div className="row"><span className="grow cap">{t("when")}</span><b className="num">{new Date(a.start).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {fmtMin(sm)} – {fmtMin(em)}</b></div>
        <div className="row"><span className="grow cap">{t("with")}</span><b>{staff?.name ?? t("anyone")}</b></div>
        <div className="row"><span className="grow cap">{t("phone")}</span><b className="num">{a.client?.phone ? fmtPhone(a.client.phone) : "—"}</b></div>
        {a.services.map((s, i) => <div key={i} className="row"><span className="grow">{s.name}</span><span className="cap">{t("min", { n: s.minutes })}</span><b className="num">{formatCents(s.cents)}</b></div>)}
      </div>
      {a.note && <div className="cap" style={{ background: "#F5F5F7", borderRadius: 8, padding: "6px 8px" }}>{a.note}</div>}
      {a.client?.id && <a className="cap" href={`/clients/${a.client.id}`} style={{ fontWeight: 600 }}>{t("profile")} ›</a>}
      <div className="cap">{t("dragHint")}</div>
      {a.client?.textsOk === false && <div className="cap">{t("noTexts")}</div>}
    </Drawer>
  );
}
