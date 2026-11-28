"use client";
// Quick-book card (D2: phone first, top services, who is free, time, repeat, reminder texts) and the booking details
// panel (D4 peek / D12 details: confirm, check in → checkout, no-show, cancel, client profile).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip, DatePicker, Drawer } from "@/components/kit";
import { e164, rpc } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { getActing, type Desk } from "@/lib/desk";
import { getTicket, putTicket } from "@/lib/checkout/store";
import { isBlocked, putAppt, type Appt, type ApptService, type ApptSource } from "@/lib/booking/appts";
import { at, fmtMin, isFree, minutesOf, repeatDays } from "@/lib/booking/grid";
import { catColor, codeHits, parseTime, withCodes } from "@/lib/booking/serviceCodes";
import { isHere } from "@/lib/booking/turns";
import { skillsNeeded } from "@/lib/booking/skills";
import { GoodFit, SkillTags } from "./SkillTags";
import { CustomService } from "./CustomService";
import { ClientFacts } from "./ClientFacts";
import { last4 } from "@/lib/clients";
import { useLang } from "@/components/AppProviders";
import { canContact, dialFor, isMasked, logContact, reminderBody, seesFullPhone, smsHref, telHref, useContactSettings } from "@/lib/clientContact";

export type BookDraft = { day: string; start: number; minutes: number; staffId?: string;
  /** "Book a later time" from a waiting walk-in: start with their name, phone and services; the walk-in leaves the waitlist once booked. */
  client?: { id?: string; name: string; phone: string }; services?: ApptService[]; replaces?: Appt };

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
      client: a.client?.name || a.client?.phone ? { ...(a.client.id ? { id: a.client.id } : {}), phone: a.client.phone ?? "", name: a.client.name } : undefined,
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

// Section header that stays pinned at the top of the drawer while its section is on screen.
function Pin({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return <div className="bk-pin"><div className="bk-pin-h"><span className="eyebrow">{label}</span>{value && <span className="bk-pin-v">{value}</span>}</div>{children}</div>;
}

export function BookDrawer({ desk, draft, all, onClose, onBooked, onMenuChanged }: { desk: Desk; draft: BookDraft; all: Appt[]; onClose: () => void; onBooked: (n: number, name: string) => void; onMenuChanged?: () => void }) {
  const t = useTranslations("calendar");
  const [source, setSource] = useState<ApptSource>("phone");
  // A client on file the viewer may only see as ••7011 (owner-only phones): keep that as it is, tied to the client id.
  const [phone, setPhone] = useState(draft.client?.phone ? (isMasked(draft.client.phone) ? draft.client.phone : fmtPhone(draft.client.phone)) : "");
  const hidden = isMasked(phone) && !!draft.client?.id;
  const [name, setName] = useState(draft.client?.name ?? "");
  const [found, setFound] = useState<Found | null>(null);
  const [svcs, setSvcs] = useState<ApptService[]>(draft.services ?? []);
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
  const [cx, setCx] = useState(false);
  const minutes = svcs.reduce((a, s) => a + s.minutes, 0) || draft.minutes;
  const totalCents = svcs.reduce((a, s) => a + s.cents, 0);

  useEffect(() => {
    if (!(phoneOk(phone) || hidden) || desk.mode !== "live") { setFound(null); return; }
    let off = false;
    void rpc<Found[]>("client_lookup", { p_salon: desk.salonId, p_phone: hidden ? phone : e164(phone), p_client: hidden ? draft.client!.id : null }).then((r) => {
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
  const need = skillsNeeded(svcs.map((x) => ({ name: x.name, cat: desk.services.find((d) => d.id === x.serviceId)?.cat })));
  const who = [...techs].filter((s) => !tq || s.name.toLowerCase().includes(tq.toLowerCase()))
    .sort((a, b) => Number(isFree(busyOf(b.id), start, start + minutes)) - Number(isFree(busyOf(a.id), start, start + minutes)) || Number(b.clockedIn) - Number(a.clockedIn));
  // A typed start time that can't be read blocks Book (never save at the old time by mistake).
  const typedBad = tText !== null && parseTime(tText) === null;
  const ok = (phoneOk(phone) || hidden || name.trim()) && svcs.length > 0 && !typedBad;

  const add = (s: { id?: string; name: string; minutes: number; cents: number }) => setSvcs((x) => [...x, { serviceId: s.id, name: s.name, minutes: s.minutes, cents: s.cents }]);
  const addCodes = () => { if (!hits.length) return; hits.forEach(add); setQ(""); };
  const commitTime = () => { if (tText === null) return; const m = parseTime(tText); if (m === null) { setTErr(true); return; } setStart(m); setTText(null); setTErr(false); };
  const book = () => {
    const typed: number | null = tText === null ? start : parseTime(tText);
    if (typed === null) { setTErr(true); return; }
    const days = rep ? repeatDays(day, rep.every, rep.times) : [day];
    const rule = rep ? { id: crypto.randomUUID(), everyWeeks: rep.every, times: rep.times } : undefined;
    const client = hidden ? { id: draft.client!.id, name: name.trim() || found?.name || "", phone }
      : { name: name.trim() || found?.name || "", phone: phoneOk(phone) ? e164(phone) : "" };
    for (const d of days) {
      putAppt({ id: crypto.randomUUID(), salonId: desk.salonId, start: at(d, typed), end: at(d, typed + minutes), staffId: staffId ?? null,
        client, services: svcs, status: "booked", source, note, repeat: rule, repeatRuleId: rule?.id, updatedAt: "" });
    }
    const old = draft.replaces ? all.find((x) => x.id === draft.replaces!.id) ?? draft.replaces : undefined;
    if (old) putAppt({ ...old, status: "canceled", note: [old.note, t("rebookedLater")].filter(Boolean).join(" · "), updatedAt: "" });
    onBooked(days.length, client.name || (hidden ? phone : fmtPhone(client.phone)));
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayIn = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dayLbl = (k: string) => new Date(at(k, 0)).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <Drawer title={t("newBooking")} onClose={onClose} footer={<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="bk-sum"><span>{svcs.length ? t("b2_sum", { n: svcs.length, min: minutes }) : t("b2_noSvc")}</span><b className="num">{formatCents(totalCents)}</b></div>
      <Button variant="primary" block disabled={!ok} onClick={book} data-testid="book-save">{rep ? t("bookTimes", { n: rep.times }) : t("bookIt")}</Button>
      <span className="cap">{t("textNote")}</span>
    </div>}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="cap" style={{ width: 40 }}>{t("from")}</span>
        {(["phone", "walk_in", "text", "desk"] as ApptSource[]).map((s) => <Chip key={s} on={source === s} onClick={() => setSource(s)}>{t(`src_${s}`)}</Chip>)}</div>
      <input className="inp" inputMode="tel" placeholder={t("phoneFirst")} aria-label={t("phone")} value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} data-testid="book-phone" style={{ border: "1.5px solid var(--ink)" }} />
      <input className="inp" placeholder={t("name")} aria-label={t("name")} value={name} onChange={(e) => setName(e.target.value)} data-testid="book-name" />
      {found && <div className="cap fade" style={{ background: "#F5F5F7", borderRadius: 8, padding: "6px 8px" }}>
        {t("usually", { name: found.name, n: found.visits })}{found.last_services ? `: ${found.last_services}` : ""}{found.notes ? ` · ${found.notes}` : ""}</div>}

      {/* Each section pins its header + what was picked while you scroll through it; the next section's header takes over. */}
      <section className="bk-sec" data-testid="sec-service">
      <Pin label={t("service")} value={svcs.length ? `${t("b2_sum", { n: svcs.length, min: minutes })} · ${formatCents(totalCents)}` : t("b2_noSvc")}>
        {svcs.length > 0 && <div className="bk-picked">{svcs.map((s, i) => { const c = coded.find((x) => x.id === s.serviceId); const col = catColor(c?.cat ?? "Custom"); return (
          <span className="bk-pick" key={i} style={{ background: col[0] }}><span className="bk-code" style={{ background: "#fff", color: col[1] }}>{c?.code ?? "—"}</span><span className="bk-pick-n">{s.name}</span><b className="num">{formatCents(s.cents).replace(/\.00$/, "")}</b>
            <button type="button" className="bk-pick-x" aria-label={`${t("remove")} ${s.name}`} onClick={() => setSvcs(svcs.filter((_, j) => j !== i))}>✕</button></span>); })}</div>}
      </Pin>
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
      {!cx ? <button type="button" className="bk-cxbtn" onClick={() => setCx(true)} data-testid="cx-open">{t("b2_custom")}</button>
        : <CustomService desk={desk} cats={cats} cat0={cat} onAdd={add} onClose={() => setCx(false)} onMenuChanged={onMenuChanged} />}
      </section>

      <section className="bk-sec" data-testid="sec-when">
      <Pin label={t("b2_when")} value={`${day === dayIn(0) ? t("today") : day === dayIn(1) ? t("b2_tomorrow") : dayLbl(day)} · ${fmtMin(start)} → ${fmtMin(start + minutes)}`} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[0, 1].map((n) => <Chip key={n} on={day === dayIn(n)} onClick={() => setDay(dayIn(n))}>{n === 0 ? t("today") : t("b2_tomorrow")}</Chip>)}
        {[14, 21, 28, 42].map((n) => <Chip key={n} on={day === dayIn(n)} onClick={() => setDay(dayIn(n))}>{t("b2_inWk", { n: n / 7, date: dayLbl(dayIn(n)) })}</Chip>)}
        <DatePicker label={t("date")} value={day} onChange={(v) => v && setDay(v)} data-testid="book-date" />
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
      </section>

      <section className="bk-sec" data-testid="sec-who">
      <Pin label={t("who")} value={staffId ? desk.staff.find((x) => x.id === staffId)?.name ?? t("anyone") : t("anyone")}>
        {need.length > 0 && <span className="cap" data-testid="skill-need">{t("sk_need", { list: need.join(" · ") })}</span>}
      </Pin>
      {techs.length > 5 && <input className="inp" placeholder={t("b2_findTech")} aria-label={t("b2_findTech")} value={tq} onChange={(e) => setTq(e.target.value)} style={{ height: 36 }} />}
      <div className="bk-techs">
        <button type="button" className={`bk-tech ${!staffId ? "on" : ""}`} onClick={() => setStaffId(undefined)}><span className="av" style={{ width: 30, height: 30 }}>★</span><span style={{ flex: 1, minWidth: 0 }}><b>{t("anyone")}</b></span></button>
        {who.map((s) => { const free = isFree(busyOf(s.id), start, start + minutes), till = busyTill(s.id); return (
          <button key={s.id} type="button" className={`bk-tech ${staffId === s.id ? "on" : ""}`} onClick={() => setStaffId(s.id)} data-testid={`book-staff-${s.name}`}>
            <span className="av" style={{ width: 30, height: 30, boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${!s.clockedIn ? "#8E8E93" : free ? "#2F9E44" : "#E8590C"}` }}>{s.name[0]}</span>
            <span style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b> <GoodFit have={s.skills} need={need} /><span className="cap" style={{ display: "block" }}>{t("headSub", { t: s.turns, a: busyOf(s.id).length })}</span><SkillTags have={s.skills} need={need} /></span>
            <span className="cap" style={{ fontWeight: 600, color: free ? "#1F7A33" : "#B5470A" }}>{free ? t("b2_free") : t("b2_busyTill", { time: fmtMin(till ?? start) })}</span>
          </button>); })}
      </div>
      {staffId && !isFree(busyOf(staffId), start, start + minutes) && <div className="cap" style={{ color: "#B5470A" }}>⚠ {t("overlapWarn")}</div>}
      </section>

      <section className="bk-sec" data-testid="sec-repeat">
      <Pin label={t("repeat")} value={rep ? `${t("everyWk", { n: rep.every })} · ${rep.times}×` : t("noRepeat")} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip on={!rep} onClick={() => setRep(null)}>{t("noRepeat")}</Chip>
        {[2, 3, 4, 6].map((w) => <Chip key={w} on={rep?.every === w} onClick={() => setRep({ every: w, times: rep?.times ?? 6 })}>{t("everyWk", { n: w })}</Chip>)}
      </div>
      {rep && <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="cap">{t("times")}</span>
        {[4, 6, 12].map((n) => <Chip key={n} on={rep.times === n} onClick={() => setRep({ ...rep, times: n })}>{n}×</Chip>)}</div>}
      <textarea className="inp bk-note" placeholder={t("notePh")} aria-label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} />
      </section>
    </Drawer>
  );
}

export function DetailsDrawer({ desk, a, onClose, say }: { desk: Desk; a: Appt; onClose: () => void; say: (s: string, undo?: () => void) => void }) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const contact = useContactSettings(desk.salonId, desk.mode === "demo");
  const [reachErr, setReachErr] = useState("");
  const { lang } = useLang();
  const st = statusOf(a);
  const staff = desk.staff.find((s) => s.id === a.staffId);
  const set = (status: Appt["status"], msg: string) => { const before = { ...a }; putAppt({ ...a, status }); say(msg, () => putAppt(before)); onClose(); };
  const checkIn = () => {
    const id = ticketFor(desk, a, a.staffId ?? null);
    putAppt({ ...a, status: "arrived", ticketId: id });
    router.push(`/checkout/${id}`);
  };
  const here = isHere(a);
  const canHere = (st === "booked" || st === "confirmed") && !here && a.source !== "kiosk" && a.source !== "walk_in";
  const markHere = () => { const before = { ...a }; putAppt({ ...a, arrivedAt: new Date().toISOString() }); say(t("hereMsg", { name: a.client?.name || t("walkIn") }), () => putAppt(before)); onClose(); };
  const hereMin = here ? Math.max(0, Math.round((Date.now() - new Date(a.arrivedAt!).getTime()) / 60_000)) : 0;
  const sm = minutesOf(a.start), em = minutesOf(a.end);
  if (isBlocked(a)) return (
    <Drawer title={t("brk")} onClose={onClose} footer={<Button variant="ghost" block onClick={() => set("canceled", t("brkRemoved"))} data-testid="break-remove">{t("brkRemove")}</Button>}>
      <div className="group">
        <div className="row"><span className="grow cap">{t("when")}</span><b className="num">{fmtMin(sm)} – {fmtMin(em)}</b></div>
        <div className="row"><span className="grow cap">{t("with")}</span><b>{staff?.name ?? t("anyone")}</b></div>
      </div>
      <div className="cap">{t("brkWhy")}</div>
    </Drawer>
  );
  const total = a.services.reduce((x, s) => x + s.cents, 0);
  // Only the owner sees a client's full phone; everyone else sees the last 4 (Oliver, Nov 26).
  const acting = getActing();
  const viewer = acting?.role ?? desk.me.role;
  const demo = desk.mode === "demo";
  const phone = a.client?.phone ?? "";
  // This device only has ••7011 (owner-only phones): ask the server for the number at tap time (role checked + logged).
  const reach = (way: "call" | "text", body?: string) => (e: React.MouseEvent) => {
    if (!isMasked(phone)) { logContact({ salonId: desk.salonId, clientId: a.client?.id, apptId: a.id, way, by: acting?.membership_id, demo }); return; }
    e.preventDefault(); setReachErr("");
    void dialFor({ salonId: desk.salonId, clientId: a.client?.id, apptId: a.id, way, by: acting?.membership_id })
      .then((n) => { if (!n) throw new Error("no number"); window.location.href = way === "call" ? telHref(n) : smsHref(n, body ?? ""); })
      .catch(() => setReachErr(navigator.onLine ? t("adReachErr") : t("adReachOffline")));
  };
  const reminder = reminderBody({ first: (a.client?.name ?? "").split(" ")[0], salon: desk.salonName,
    when: `${new Date(a.start).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", { weekday: "short", month: "short", day: "numeric" })} ${lang === "vi" ? "lúc" : "at"} ${fmtMin(sm)}` }, lang === "vi" ? "vi" : "en");
  const len = em - sm;
  const lenTxt = len >= 60 ? `${Math.floor(len / 60)}h${len % 60 ? ` ${t("min", { n: len % 60 })}` : ""}` : t("min", { n: len });
  const STEPS = ["booked", "confirmed", "here", "chair", "paid"] as const;
  const step = st === "done" ? 4 : st === "arrived" ? 3 : here ? 2 : st === "confirmed" ? 1 : st === "booked" ? 0 : -1;
  const pre = st === "booked" || st === "confirmed";
  return (
    <Drawer title={a.client?.name || t("walkIn")} onClose={onClose} footer={<div className="ad-acts">
      {(pre || st === "arrived") && <span className="eyebrow">{t("adNext")}</span>}
      {(pre || st === "arrived") && <div className="ad-two">
        {canHere && <button type="button" className="ad-big primary" onClick={markHere} data-testid="here-btn"><b>{t("hereBtn")}</b><span>{t("hereHint")}</span></button>}
        <button type="button" className={`ad-big${canHere ? "" : " primary"}`} onClick={checkIn} data-testid="check-in">
          <b>{st === "arrived" ? t("openTicket") : t("startService")}</b><span>{st === "arrived" ? t("openHint") : t("startHint")}</span>
        </button>
      </div>}
      {st === "done" && a.ticketId && <Button block onClick={() => router.push(`/checkout/${a.ticketId}`)}>{t("openTicket")}</Button>}
      {pre && <div className="ad-row">
        {st === "booked" && <button type="button" className="ad-tile" onClick={() => set("confirmed", t("confirmedMsg"))} data-testid="confirm">
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ stroke: "var(--jade)" }}><polyline points="20 6 9 17 4 12" /></svg>{t("confirm")}</button>}
        <button type="button" className="ad-tile" onClick={() => set("no_show", t("noShowMsg"))}>
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ stroke: "var(--orange)" }}><circle cx="12" cy="12" r="9" /><line x1="6" y1="6" x2="18" y2="18" /></svg>{t("noShow")}</button>
        <button type="button" className="ad-tile ad-cancel" onClick={() => set("canceled", t("canceledMsg"))} data-testid="cancel-appt">
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ stroke: "var(--red)" }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>{t("cancel")}</button>
      </div>}
      {(st === "canceled" || st === "no_show") && <Button block onClick={() => set("booked", t("restoredMsg"))}>{t("restore")}</Button>}
      {st !== "done" && <span className="ad-note">{t("actsNote")}</span>}
    </div>}>
      <div className="ad-hero">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`tag ${st === "confirmed" || st === "arrived" || here ? "jade" : st === "booked" ? "warn" : ""}`} data-testid="appt-status">{here ? t("hereTag", { min: hereMin }) : t(`st_${st}`)}</span>
          <span className="cap">{t(`src_${a.source}`)}</span>
          {a.repeatRuleId && <span className="tag">{t("repeats")}</span>}
        </div>
        <div className="ad-time num">{fmtMin(sm)}</div>
        <div className="cap ad-sub">{t("adUntil", { date: new Date(a.start).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }), len: lenTxt, end: fmtMin(em) })} · {staff?.name ?? t("anyone")}</div>
        {step >= 0 && <ol className="ad-steps" aria-label={t(`st_${st}`)}>
          {STEPS.map((k, i) => <li key={k} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}><i />{t(`adStep_${k}`)}</li>)}
        </ol>}
        <div className="ad-who">
          {phone ? seesFullPhone(viewer) && !isMasked(phone)
            ? <span className="num" data-testid="appt-phone">{fmtPhone(phone)} <span className="tag">{t("adOwnerOnly")}</span></span>
            : <span className="num cap" data-testid="appt-phone">{t("adPhone", { last4: last4(phone) })}</span>
            : <span className="cap">—</span>}
          {a.client?.id && <a href={`/clients/${a.client.id}`} className="ad-link">{t("profile")} ›</a>}
        </div>
        {phone && (canContact(contact, viewer, "call") || canContact(contact, viewer, "text")) && <div className="ad-reach">
          {/* Reach the client without seeing the number (only the owner sees it); every tap is logged. */}
          {canContact(contact, viewer, "call") && <a className="ad-reach-btn" href={isMasked(phone) ? "#" : telHref(phone)} data-testid="appt-call" onClick={reach("call")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>{t("adCall")}</a>}
          {canContact(contact, viewer, "text") && <a className="ad-reach-btn" data-testid="appt-text"
            href={isMasked(phone) ? "#" : smsHref(phone, reminder)} onClick={reach("text", reminder)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z" /></svg>{t("adText")}</a>}
        </div>}
        {reachErr && <div className="hint err" data-testid="appt-reach-err">{reachErr}</div>}
      </div>
      {a.client?.care && <div className="card cl-care"><b>▲ {t("care")}</b></div>}
      {a.services.length > 0 && <>
        <div className="eyebrow">{t("adServices", { n: a.services.length })}</div>
        <div className="group">
          {a.services.map((s, i) => <div key={i} className="row ad-svc"><span className="grow"><b>{s.name}</b><span className="cap">{t("min", { n: s.minutes })}</span></span><b className="num">{formatCents(s.cents)}</b></div>)}
          <div className="row ad-total"><b className="grow">{t("totalPreTip")}</b><b className="num" data-testid="appt-total">{formatCents(total)}</b></div>
        </div>
      </>}
      <ClientFacts desk={desk} client={a.client} line />
      {a.note && <div className="cap" style={{ background: "#F5F5F7", borderRadius: 8, padding: "6px 8px" }}>{a.note}</div>}
      <div className="cap">{t("dragHint")}</div>
      {a.client?.textsOk === false && <div className="cap">{t("noTexts")}</div>}
    </Drawer>
  );
}
