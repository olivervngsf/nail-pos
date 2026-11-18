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
import { catColor, codeHits, parseTime, withCodes } from "@/lib/booking/serviceCodes";

export type BookDraft = { day: string; start: number; minutes: number; staffId?: string };

/** Open (or reuse) the checkout ticket for a booking: client + services with the tech. Saved on the device, synced later. */
export function ticketFor(desk: Desk, a: Appt, staffId: string | null): string {
  const id = a.ticketId && getTicket(a.ticketId) ? a.ticketId : crypto.randomUUID();
  if (!getTicket(id)) {
    const by = getActing()?.membership_id ?? desk.me.membership_id;
    const staffName = desk.staff.find((s) => s.id === staffId)?.name;
    // Walk-in with no phone: keep the name on the ticket (and in its note, which the server keeps).
    const noPhoneName = !a.client?.phone && a.client?.name ? a.client.name : "";
    putTicket({ id, salonId: desk.salonId, status: "open", createdAt: new Date().toISOString(), tips: {}, openedBy: by, deviceId: desk.device?.id,
      note: [noPhoneName, a.note].filter(Boolean).join(" · "),
      client: a.client?.name || a.client?.phone ? { phone: a.client.phone ?? "", name: a.client.name } : undefined,
      lines: a.services.map((s) => ({ id: crypto.randomUUID(), serviceId: s.serviceId, name: s.name, minutes: s.minutes, cents: s.cents,
        staffId: staffId ?? undefined, staffName })) }, { now: true });
  }
  return id;
}

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
  const [cat, setCat] = useState("");
  const [staffId, setStaffId] = useState<string | undefined>(draft.staffId);
  const [tq, setTq] = useState("");
  const [start, setStart] = useState(draft.start);
  const [tText, setTText] = useState<string | null>(null);
  const [tErr, setTErr] = useState(false);
  const [day, setDay] = useState(draft.day);
  const [rep, setRep] = useState<{ every: number; times: number } | null>(null);
  const [note, setNote] = useState("");
  const [cx, setCx] = useState<{ name: string; price: string; min: string } | null>(null);
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

  const coded = useMemo(() => withCodes(desk.services), [desk.services]);
  const cats = useMemo(() => [...new Set(coded.map((s) => s.cat))], [coded]);
  const hits = codeHits(q, coded);
  const ql = q.trim().toLowerCase();
  const shownSvcs = coded.filter((s) => ql ? (hits.length ? hits.includes(s) : s.name.toLowerCase().includes(ql) || s.code.toLowerCase().startsWith(ql)) : !cat || s.cat === cat);
  const groups = cats.map((c) => ({ cat: c, items: shownSvcs.filter((s) => s.cat === c) })).filter((g) => g.items.length);
  const busyOf = (sid: string) => all
    .filter((a) => a.staffId === sid && a.status !== "canceled" && a.status !== "no_show" && new Date(a.start).toDateString() === new Date(at(day, 0)).toDateString())
    .map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) }));
  const busyTill = (sid: string) => { const b = busyOf(sid).filter((x) => x.start < start + minutes && start < x.end).sort((x, y) => y.end - x.end)[0]; return b?.end; };
  const techs = desk.staff.filter((s) => s.role === "tech");
  const who = [...techs].filter((s) => !tq || s.name.toLowerCase().includes(tq.toLowerCase()))
    .sort((a, b) => Number(isFree(busyOf(b.id), start, start + minutes)) - Number(isFree(busyOf(a.id), start, start + minutes)) || Number(b.clockedIn) - Number(a.clockedIn));
  const ok = (phoneOk(phone) || name.trim()) && svcs.length > 0;

  const add = (s: { id?: string; name: string; minutes: number; cents: number }) => setSvcs((x) => [...x, { serviceId: s.id, name: s.name, minutes: s.minutes, cents: s.cents }]);
  const addCodes = () => { if (!hits.length) return; hits.forEach(add); setQ(""); };
  const commitTime = () => { if (tText === null) return; const m = parseTime(tText); if (m === null) { setTErr(true); return; } setStart(m); setTText(null); setTErr(false); };
  const addCustom = () => {
    if (!cx) return;
    const cents = Math.round(parseFloat(cx.price.replace(/[^0-9.]/g, "")) * 100);
    if (!cx.name.trim() || !Number.isFinite(cents)) return;
    add({ name: cx.name.trim(), minutes: Math.max(5, parseInt(cx.min, 10) || 30), cents });
    setCx(null);
  };
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
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayIn = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dayLbl = (k: string) => new Date(at(k, 0)).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <Drawer title={t("newBooking")} onClose={onClose} footer={<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="bk-sum"><span>{svcs.length ? t("b2_sum", { n: svcs.length, min: minutes }) : t("b2_noSvc")}</span><b className="num">{formatCents(svcs.reduce((a, s) => a + s.cents, 0))}</b></div>
      <Button variant="primary" block disabled={!ok} onClick={book} data-testid="book-save">{rep ? t("bookTimes", { n: rep.times }) : t("bookIt")}</Button>
      <span className="cap">{t("textNote")}</span>
    </div>}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="cap" style={{ width: 40 }}>{t("from")}</span>
        {(["phone", "walk_in", "text", "desk"] as ApptSource[]).map((s) => <Chip key={s} on={source === s} onClick={() => setSource(s)}>{t(`src_${s}`)}</Chip>)}</div>
      <input className="inp" inputMode="tel" placeholder={t("phoneFirst")} aria-label={t("phone")} value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} data-testid="book-phone" style={{ border: "1.5px solid var(--ink)" }} />
      <input className="inp" placeholder={t("name")} aria-label={t("name")} value={name} onChange={(e) => setName(e.target.value)} data-testid="book-name" />
      {found && <div className="cap fade" style={{ background: "#F5F5F7", borderRadius: 8, padding: "6px 8px" }}>
        {t("usually", { name: found.name, n: found.visits })}{found.last_services ? `: ${found.last_services}` : ""}{found.notes ? ` · ${found.notes}` : ""}</div>}

      <div className="eyebrow">{t("service")}</div>
      {svcs.length > 0 && <div className="group">{svcs.map((s, i) => { const c = coded.find((x) => x.id === s.serviceId); const col = catColor(c?.cat ?? "Custom"); return (
        <div className="row" key={i}><span className="bk-code" style={{ background: col[0], color: col[1] }}>{c?.code ?? "—"}</span><span className="grow">{s.name}</span><span className="cap">{t("min", { n: s.minutes })}</span><b className="num">{formatCents(s.cents)}</b>
          <Button size="sm" variant="ghost" aria-label={`${t("remove")} ${s.name}`} onClick={() => setSvcs(svcs.filter((_, j) => j !== i))}>✕</Button></div>); })}</div>}
      <input className="inp" placeholder={t("b2_codesPh")} aria-label={t("allServices")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="book-q"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCodes(); } }} style={{ height: 40 }} />
      {hits.length > 0 && <Button variant="primary" onClick={addCodes} data-testid="book-codes">↵ {t("b2_addCodes", { list: hits.map((s) => `${s.code} ${s.name}`).join(" + ") })}</Button>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip on={!cat && !q} onClick={() => { setCat(""); setQ(""); }}>{t("b2_all")}</Chip>
        {cats.map((c) => <Chip key={c} on={cat === c && !q} onClick={() => { setCat(c); setQ(""); }}><i className="bk-dot" style={{ background: catColor(c)[1] }} />{c}</Chip>)}
      </div>
      <div className="bk-groups">{groups.map((g) => { const col = catColor(g.cat); return (
        <div key={g.cat} className="bk-grp" style={{ background: col[0] }}>
          <div className="bk-gh" style={{ color: col[1] }}>{g.cat}<span>{g.items.length}</span></div>
          <div className="bk-grid">{g.items.map((s) => { const n = svcs.filter((x) => x.serviceId === s.id).length; return (
            <button key={s.id} type="button" className={`bk-svc ${n ? "on" : ""}`} style={n ? { boxShadow: `0 0 0 2px ${col[1]}` } : undefined} onClick={() => add(s)} data-testid="book-svc">
              <b><span className="bk-code" style={{ background: col[0], color: col[1] }}>{s.code}</span>{s.name}</b>
              <span>{t("min", { n: s.minutes })} · {formatCents(s.cents).replace(/\.00$/, "")}{s.priceFrom ? "+" : ""}{n > 1 ? ` · ×${n}` : ""}</span></button>); })}</div>
        </div>); })}</div>
      {!cx ? <button type="button" className="bk-cxbtn" onClick={() => setCx({ name: "", price: "", min: "" })}>{t("b2_custom")}</button>
        : <div className="bk-cx">
          <b style={{ fontSize: 13 }}>{t("b2_customTitle")}</b>
          <input className="inp" placeholder={t("b2_customName")} aria-label={t("b2_customName")} value={cx.name} onChange={(e) => setCx({ ...cx, name: e.target.value })} style={{ height: 40 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="inp" inputMode="decimal" placeholder={t("b2_customPrice")} aria-label={t("b2_customPrice")} value={cx.price} onChange={(e) => setCx({ ...cx, price: e.target.value })} style={{ height: 40 }} />
            <input className="inp" inputMode="numeric" placeholder={t("b2_customMin")} aria-label={t("b2_customMin")} value={cx.min} onChange={(e) => setCx({ ...cx, min: e.target.value })} style={{ height: 40 }} />
          </div>
          <span className="cap">{t("b2_customNote")}</span>
          <div style={{ display: "flex", gap: 8 }}><Button onClick={() => setCx(null)}>{t("b2_cancel")}</Button><Button variant="primary" onClick={addCustom} disabled={!cx.name.trim() || !cx.price.trim()}>{t("b2_customAdd")}</Button></div>
        </div>}

      <div className="eyebrow">{t("b2_when")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[0, 1].map((n) => <Chip key={n} on={day === dayIn(n)} onClick={() => setDay(dayIn(n))}>{n === 0 ? t("today") : t("b2_tomorrow")}</Chip>)}
        {[14, 21, 28, 42].map((n) => <Chip key={n} on={day === dayIn(n)} onClick={() => setDay(dayIn(n))}>{t("b2_inWk", { n: n / 7, date: dayLbl(dayIn(n)) })}</Chip>)}
        <input className="inp" type="date" aria-label={t("date")} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ width: 150, height: 32 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label className="bk-tbx"><span className="cap">{t("b2_start")}</span>
          <input value={tText ?? fmtMin(start)} onChange={(e) => { setTText(e.target.value); setTErr(false); }} onBlur={commitTime}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTime(); } }} aria-label={t("time")} data-testid="book-time" /></label>
        <span aria-hidden>→</span>
        <div className="bk-tbx"><span className="cap">{t("b2_end")}</span><b>{fmtMin(start + minutes)}</b><span className="cap">{t("min", { n: minutes })}</span></div>
      </div>
      {tErr && <div className="hint err">{t("b2_timeErr")}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <Chip onClick={() => { setStart(Math.max(8 * 60, start - 15)); setTText(null); }}>−15</Chip>
        <Chip onClick={() => { setStart(Math.min(21 * 60, start + 15)); setTText(null); }}>+15</Chip>
      </div>

      <div className="eyebrow">{t("who")}</div>
      {techs.length > 5 && <input className="inp" placeholder={t("b2_findTech")} aria-label={t("b2_findTech")} value={tq} onChange={(e) => setTq(e.target.value)} style={{ height: 36 }} />}
      <div className="bk-techs">
        <button type="button" className={`bk-tech ${!staffId ? "on" : ""}`} onClick={() => setStaffId(undefined)}><span className="av" style={{ width: 30, height: 30 }}>★</span><span style={{ flex: 1, minWidth: 0 }}><b>{t("anyone")}</b></span></button>
        {who.map((s) => { const free = isFree(busyOf(s.id), start, start + minutes), till = busyTill(s.id); return (
          <button key={s.id} type="button" className={`bk-tech ${staffId === s.id ? "on" : ""}`} onClick={() => setStaffId(s.id)} data-testid={`book-staff-${s.name}`}>
            <span className="av" style={{ width: 30, height: 30, boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${!s.clockedIn ? "#8E8E93" : free ? "#2F9E44" : "#E8590C"}` }}>{s.name[0]}</span>
            <span style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b><span className="cap" style={{ display: "block" }}>{t("headSub", { t: s.turns, a: busyOf(s.id).length })}</span></span>
            <span className="cap" style={{ fontWeight: 600, color: free ? "#1F7A33" : "#B5470A" }}>{free ? t("b2_free") : t("b2_busyTill", { time: fmtMin(till ?? start) })}</span>
          </button>); })}
      </div>
      {staffId && !isFree(busyOf(staffId), start, start + minutes) && <div className="cap" style={{ color: "#B5470A" }}>⚠ {t("overlapWarn")}</div>}
      <div className="eyebrow">{t("repeat")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip on={!rep} onClick={() => setRep(null)}>{t("noRepeat")}</Chip>
        {[2, 3, 4, 6].map((w) => <Chip key={w} on={rep?.every === w} onClick={() => setRep({ every: w, times: rep?.times ?? 6 })}>{t("everyWk", { n: w })}</Chip>)}
      </div>
      {rep && <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="cap">{t("times")}</span>
        {[4, 6, 12].map((n) => <Chip key={n} on={rep.times === n} onClick={() => setRep({ ...rep, times: n })}>{n}×</Chip>)}</div>}
      <textarea className="inp bk-note" placeholder={t("notePh")} aria-label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} />
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
    const id = ticketFor(desk, a, a.staffId ?? null);
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
