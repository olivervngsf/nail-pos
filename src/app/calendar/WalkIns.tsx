"use client";
// Walk-in waitlist + turn list (M9). Booking board Cal waitlist + Up next (D1, D6): who's waiting and for how long,
// add a walk-in at the desk, seat with a tech (turn order shown as facts — you decide, optional reason when you skip
// the next turn), walked out. Everything saves on the device first and syncs (outbox), so it works offline.
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, Drawer } from "@/components/kit";
import { e164 } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import type { Desk } from "@/lib/desk";
import { putAppt, type Appt } from "@/lib/booking/appts";
import { dayKey, fmtMin } from "@/lib/booking/grid";
import { nextWalkCode, waitedMin, type TurnFact } from "@/lib/booking/turns";
import { skillsNeeded } from "@/lib/booking/skills";
import { GoodFit, SkillTags } from "./SkillTags";
import { ClientFacts } from "./ClientFacts";
import { ticketFor } from "./BookDrawers";
import { printTicketSlip, slipWhen } from "@/lib/print/slip";

const REASONS = ["asked", "skill", "free", "other"] as const;

/** Re-render every 30 s so "waiting 12 min" stays true. */
export function useTick(ms = 30_000) {
  const [n, setN] = useState(0);
  useEffect(() => { const i = setInterval(() => setN((x) => x + 1), ms); return () => clearInterval(i); }, [ms]);
  return n;
}

/** Seat a walk-in with a tech at a time (default now): moves into that column + opens the ticket. */
export function seatAppt(desk: Desk, a: Appt, staffId: string, startIso = new Date().toISOString(), reason: string | null = null): string {
  const mins = a.services.reduce((x, s) => x + s.minutes, 0) || 45;
  const id = ticketFor(desk, a, staffId);
  putAppt({ ...a, status: "arrived", staffId, start: startIso, end: new Date(new Date(startIso).getTime() + mins * 60_000).toISOString(),
    arrivedAt: a.arrivedAt || a.start, ticketId: id, seatReason: reason });
  return id;
}

export function walkOut(a: Appt) {
  const now = Date.now(), came = new Date(a.arrivedAt || a.start).getTime();
  putAppt({ ...a, status: "walked_out", arrivedAt: a.arrivedAt || a.start, end: new Date(Math.max(now, came + 60_000)).toISOString() });
}

/** Booking board Cal left panel: waiting walk-ins (drag onto a staff column, or tap to seat). */
export function Waitlist({ waiting, onSeat, onWalkIn }: { waiting: Appt[]; onSeat: (a: Appt) => void; onWalkIn: () => void }) {
  const t = useTranslations("calendar");
  useTick();
  const sorted = [...waiting].sort((a, b) => (a.arrivedAt || a.start).localeCompare(b.arrivedAt || b.start));
  return (
    <div className="wl" data-testid="waitlist">
      <div className="wl-head"><b style={{ fontSize: 15, flex: 1 }}>{t("waitlist")}</b><span className="tag" data-testid="wait-count">{t("waitingN", { n: waiting.length })}</span></div>
      <div className="cap" style={{ marginTop: -6 }}>{t("waitHint")}</div>
      {sorted.length === 0 && <div className="cap">{t("noneWaiting")}</div>}
      {sorted.map((a) => {
        const min = waitedMin(a);
        return (
          <button key={a.id} type="button" className="wcard" draggable data-testid="wait-card" data-name={a.client?.name ?? ""}
            onDragStart={(e) => { e.dataTransfer.setData("text/walkin", a.id); e.dataTransfer.effectAllowed = "move"; }}
            onClick={() => onSeat(a)} aria-label={`${a.client?.name || t("walkIn")} · ${t("waitingMin", { n: min })}`}>
            <span className="wl-row"><b style={{ flex: 1, minWidth: 0 }}>{a.client?.name || t("walkIn")}</b><span className="cap">{a.note}</span></span>
            <span className={`wl-min ${min >= 15 ? "warn" : ""}`}>{a.services.map((s) => s.name).join(" + ") || t("notSure")} · {t("waitingMin", { n: min })}</span>
          </button>
        );
      })}
      <button type="button" className="wl-add" onClick={onWalkIn} data-testid="walkin-new">{t("addWalkIn")}</button>
    </div>
  );
}

export function WalkInDrawer({ desk, today, all, onClose, say }: { desk: Desk; today: string; all: Appt[]; onClose: () => void; say: (s: string) => void }) {
  const t = useTranslations("calendar");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [svc, setSvc] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const techs = desk.staff.filter((s) => s.role === "tech" && s.clockedIn);
  const top = useMemo(() => desk.services.slice(0, 8), [desk.services]);
  const add = () => {
    const s = desk.services.find((x) => x.id === svc);
    const now = new Date(), mins = s?.minutes ?? 45;
    const code = nextWalkCode(all, today);
    putAppt({ id: crypto.randomUUID(), salonId: desk.salonId, start: now.toISOString(), end: new Date(now.getTime() + mins * 60_000).toISOString(),
      staffId, client: { name: name.trim(), phone: phoneOk(phone) ? e164(phone) : "" }, arrivedAt: now.toISOString(),
      services: s ? [{ serviceId: s.id, name: s.name, minutes: s.minutes, cents: s.cents }] : [], status: "booked", source: "walk_in", note: code, updatedAt: "" });
    say(t("walkInAdded", { name: name.trim(), code }));
    onClose();
  };
  return (
    <Drawer title={t("addWalkIn")} onClose={onClose} footer={<Button variant="primary" block disabled={!name.trim()} onClick={add} data-testid="walkin-save">{t("addToLine")}</Button>}>
      <input className="inp" placeholder={t("name")} aria-label={t("name")} value={name} onChange={(e) => setName(e.target.value)} data-testid="walkin-name" />
      <input className="inp num" inputMode="tel" placeholder={t("phoneOptional")} aria-label={t("phone")} value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} />
      <div className="cap">{t("service")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{top.map((s) => <Chip key={s.id} on={svc === s.id} onClick={() => setSvc(svc === s.id ? null : s.id)} data-testid="walkin-svc">{s.name}</Chip>)}</div>
      {techs.length > 0 && <><div className="cap">{t("wantsSomeone")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip on={staffId === null} onClick={() => setStaffId(null)}>{t("anyone")}</Chip>
          {techs.map((s) => <Chip key={s.id} on={staffId === s.id} onClick={() => setStaffId(s.id)}>{s.name}</Chip>)}
        </div></>}
    </Drawer>
  );
}

export function SeatDrawer({ desk, a, order, onClose, say, onLater }: { desk: Desk; a: Appt; order: TurnFact[]; onClose: () => void; say: (s: string, undo?: () => void) => void; onLater?: () => void }) {
  const t = useTranslations("calendar");
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const next = order.find((f) => f.clockedIn && f.busyUntil === null) ?? null;
  const [pick, setPick] = useState<string | null>(a.staffId ?? next?.id ?? null);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(a.staffId && a.staffId !== next?.id ? "asked" : null);
  const skipped = !!next && !!pick && pick !== next.id;
  const tc = useTranslations("checkout");
  const need = skillsNeeded(a.services.map((x) => ({ name: x.name, cat: desk.services.find((d) => d.id === x.serviceId)?.cat })));
  const skillsOf = (id: string) => desk.staff.find((s) => s.id === id)?.skills;
  /** Free now or free within 15 min: shown first ("Seat now with"). Everyone else below, still pickable. */
  const soon = (f: TurnFact) => f.clockedIn && (f.busyUntil === null || f.busyUntil - nowM <= 15);
  const sorted = [...order.filter(soon), ...order.filter((f) => !soon(f))];
  const seat = (slip = false) => {
    if (!pick) return;
    const before = { ...a };
    const ticketId = seatAppt(desk, a, pick, new Date().toISOString(), skipped && reason ? t(`why_${reason}`) : null);
    // Ticket slip: the client carries it to the tech, who scans it to add services; the desk scans it back to charge.
    if (slip) void printTicketSlip(ticketId, desk.salonName, { ticket: tc("slipTicket"), forTech: tc("slipForTech"), back: tc("slipBack") },
      slipWhen(new Date())).catch((e) => say((e as Error).message));
    const who = order.find((f) => f.id === pick)?.name ?? "";
    say(t("seatedMsg", { name: a.client?.name || t("walkIn"), staff: who }), () => putAppt(before));
    onClose();
  };
  const fact = (f: TurnFact) => [
    !f.clockedIn ? t("notIn") : f.busyUntil !== null ? t("busyUntil", { time: fmtMin(f.busyUntil) }) : f.freeSince ? t("freeSince", { time: fmtMin(f.freeSince), min: nowM - f.freeSince }) : t("freeNowShort"),
    t("turns", { n: f.turns }),
    f.nextAt !== null ? t("nextAt", { time: fmtMin(f.nextAt) }) : null,
  ].filter(Boolean).join(" · ");
  return (
    <Drawer title={t("seatTitle", { name: a.client?.name || t("walkIn") })} onClose={onClose}
      footer={<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {desk.mode === "live" && <Button variant="primary" block disabled={!pick} onClick={() => seat(true)} data-testid="seat-slip">{pick ? t("seatSlip", { name: order.find((f) => f.id === pick)?.name ?? "" }) : t("pickTech")}</Button>}
        <Button variant={desk.mode === "live" ? "default" : "primary"} block disabled={!pick} onClick={() => seat()} data-testid="seat-save">{pick ? t("seatWith", { name: order.find((f) => f.id === pick)?.name ?? "" }) : t("pickTech")}</Button>
        {onLater && <Button block onClick={onLater} data-testid="book-later">{t("bookLater")}</Button>}
        <Button variant="ghost" block data-testid="walked-out" onClick={() => {
          const before = { ...a };
          walkOut(a);
          say(t("walkedOutMsg", { name: a.client?.name || t("walkIn"), min: waitedMin(a) }), () => putAppt(before));
          onClose();
        }}>{t("walkedOut")}</Button></div>}>
      <div className="group" data-testid="wait-facts">
        <div className="row"><span className="grow cap">{t("wants")}</span><b style={{ textAlign: "right" }}>{a.services.map((s) => s.name).join(" + ") || t("notSure")}</b></div>
        {a.services.length > 0 && <div className="row"><span className="grow cap">{t("totalPreTip")}</span><b className="num">{formatCents(a.services.reduce((x, s) => x + s.cents, 0))}</b></div>}
        <div className="row"><span className="grow cap">{t("waitingFor")}</span><span className="tag" style={{ background: "var(--orange-soft)", color: "#B5470A" }}>{t("waitingMin", { n: waitedMin(a) })}</span></div>
      </div>
      <ClientFacts desk={desk} client={a.client} />
      <div className="sec-h" style={{ display: "flex", alignItems: "baseline", gap: 8 }}><b>{t("seatNowWith")}</b><span className="cap" style={{ marginLeft: "auto" }}>{t("seatNowSub")}</span></div>
      <div className="group">
        {sorted.filter(soon).length === 0 && <div className="row cap" data-testid="nobody-free">{t("nobodyFree")}</div>}
        {sorted.map((f, i) => (<span key={f.id} style={{ display: "contents" }}>
          {i > 0 && soon(sorted[i - 1]) && !soon(f) && <div className="row cap" style={{ background: "#F5F5F7" }}>{t("everyoneElse")}</div>}
          <button key={f.id} type="button" className={`opt ${pick === f.id ? "on" : ""}`} onClick={() => setPick(f.id)} data-testid={`seat-${f.name}`} aria-pressed={pick === f.id}
            style={!f.clockedIn ? { opacity: 0.55 } : undefined}>
            <span className={`cal-dot ${f.clockedIn ? "on" : ""}`} />
            <span className="grow" style={{ display: "flex", flexDirection: "column" }}><b>{f.name}{a.staffId === f.id ? ` · ${t("asked")}` : ""} <GoodFit have={skillsOf(f.id)} need={need} /></b><span className="cap">{fact(f)}</span><SkillTags have={skillsOf(f.id)} need={need} /></span>
            {next?.id === f.id && <span className="tag jade">{t("nextTurn")}</span>}
            {pick === f.id && <span aria-hidden>✓</span>}
          </button></span>))}
      </div>
      {skipped && <><div className="cap">{t("whyOptional", { name: next!.name })}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{REASONS.map((r) => <Chip key={r} on={reason === r} onClick={() => setReason(reason === r ? null : r)}>{t(`why_${r}`)}</Chip>)}</div></>}
    </Drawer>
  );
}

/** Today's walk-in facts from the device copy (Today page). */
export function walkFacts(appts: Appt[], today = dayKey(new Date())) {
  const mine = appts.filter((a) => (a.source === "kiosk" || a.source === "walk_in") && dayKey(new Date(a.arrivedAt || a.start)) === today);
  const seated = mine.filter((a) => a.status === "arrived" || a.status === "done");
  const waits = seated.map((a) => Math.max(0, Math.round((new Date(a.start).getTime() - new Date(a.arrivedAt || a.start).getTime()) / 60_000)));
  const waitingNow = mine.filter((a) => (a.status === "booked" || a.status === "confirmed") && !a.ticketId);
  return {
    waiting: waitingNow.length,
    longest: Math.max(0, ...waitingNow.map((a) => waitedMin(a))),
    walkedOut: mine.filter((a) => a.status === "walked_out").length,
    avgWait: waits.length ? Math.round(waits.reduce((x, y) => x + y, 0) / waits.length) : 0,
    inChair: appts.filter((a) => a.status === "arrived" && dayKey(new Date(a.start)) === today && new Date(a.start).getTime() <= Date.now() && new Date(a.end).getTime() > Date.now()).length,
  };
}
