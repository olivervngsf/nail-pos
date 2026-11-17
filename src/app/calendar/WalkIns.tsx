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
import { ticketFor } from "./BookDrawers";

const REASONS = ["asked", "skill", "free", "other"] as const;

/** Re-render every 30 s so "waiting 12 min" stays true. */
export function useTick(ms = 30_000) {
  const [n, setN] = useState(0);
  useEffect(() => { const i = setInterval(() => setN((x) => x + 1), ms); return () => clearInterval(i); }, [ms]);
  return n;
}

export function Waitlist({ desk, waiting, onSeat, onWalkIn, say }: { desk: Desk; waiting: Appt[]; onSeat: (a: Appt) => void; onWalkIn: () => void; say: (s: string, undo?: () => void) => void }) {
  const t = useTranslations("calendar");
  useTick();
  const sorted = [...waiting].sort((a, b) => (a.arrivedAt || a.start).localeCompare(b.arrivedAt || b.start));
  const walkOut = (a: Appt) => {
    const before = { ...a };
    const now = Date.now(), came = new Date(a.arrivedAt || a.start).getTime();
    putAppt({ ...a, status: "walked_out", arrivedAt: a.arrivedAt || a.start, end: new Date(Math.max(now, came + 60_000)).toISOString() });
    say(t("walkedOutMsg", { name: a.client?.name || t("walkIn"), min: waitedMin(a) }), () => putAppt(before));
  };
  return (
    <div className="wl" data-testid="waitlist">
      <div className="wl-head"><b>{t("waitlist")}</b><span className="tag" data-testid="wait-count">{t("waitingN", { n: waiting.length })}</span>
        <span style={{ flex: 1 }} /><Button size="sm" onClick={onWalkIn} data-testid="walkin-new">{t("addWalkIn")}</Button></div>
      {sorted.length === 0 ? <div className="cap">{t("noneWaiting")}</div> : sorted.map((a) => {
        const min = waitedMin(a);
        const asked = desk.staff.find((s) => s.id === a.staffId)?.name;
        return (
          <div key={a.id} className={`wl-card ${min >= 20 ? "long" : ""}`} data-testid="wait-card" data-name={a.client?.name ?? ""}>
            <div className="wl-row"><b className="grow">{a.client?.name || t("walkIn")}</b>{a.note && <span className="tag">{a.note}</span>}</div>
            <div className="cap">{a.services.map((s) => s.name).join(" + ") || t("notSure")}{asked ? ` · ${t("asksFor", { name: asked })}` : ""}</div>
            <div className={`cap wl-min ${min >= 20 ? "warn" : ""}`}>{t("waitingMin", { n: min })} · {t(`src_${a.source}`)}</div>
            <div className="wl-row">
              <Button size="sm" variant="primary" onClick={() => onSeat(a)} data-testid="seat">{t("seat")}</Button>
              <Button size="sm" variant="ghost" onClick={() => walkOut(a)} data-testid="walked-out">{t("walkedOut")}</Button>
            </div>
          </div>
        );
      })}
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

export function SeatDrawer({ desk, a, order, onClose, say }: { desk: Desk; a: Appt; order: TurnFact[]; onClose: () => void; say: (s: string, undo?: () => void) => void }) {
  const t = useTranslations("calendar");
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const next = order.find((f) => f.clockedIn && f.busyUntil === null) ?? null;
  const [pick, setPick] = useState<string | null>(a.staffId ?? next?.id ?? null);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(a.staffId && a.staffId !== next?.id ? "asked" : null);
  const skipped = !!next && !!pick && pick !== next.id;
  const mins = a.services.reduce((x, s) => x + s.minutes, 0) || 45;
  const seat = () => {
    if (!pick) return;
    const before = { ...a };
    const now = new Date();
    const id = ticketFor(desk, a, pick);
    putAppt({ ...a, status: "arrived", staffId: pick, start: now.toISOString(), end: new Date(now.getTime() + mins * 60_000).toISOString(),
      arrivedAt: a.arrivedAt || a.start, ticketId: id, seatReason: skipped && reason ? t(`why_${reason}`) : null });
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
      footer={<Button variant="primary" block disabled={!pick} onClick={seat} data-testid="seat-save">{pick ? t("seatWith", { name: order.find((f) => f.id === pick)?.name ?? "" }) : t("pickTech")}</Button>}>
      <div className="cap">{a.services.map((s) => `${s.name} · ${formatCents(s.cents)}`).join(" + ") || t("notSure")} · {t("waitingMin", { n: waitedMin(a) })}</div>
      <div className="cap">{t("turnFacts")}</div>
      <div className="group">
        {order.map((f) => (
          <button key={f.id} type="button" className={`opt ${pick === f.id ? "on" : ""}`} onClick={() => setPick(f.id)} data-testid={`seat-${f.name}`} aria-pressed={pick === f.id}
            style={!f.clockedIn ? { opacity: 0.55 } : undefined}>
            <span className={`cal-dot ${f.clockedIn ? "on" : ""}`} />
            <span className="grow" style={{ display: "flex", flexDirection: "column" }}><b>{f.name}{a.staffId === f.id ? ` · ${t("asked")}` : ""}</b><span className="cap">{fact(f)}</span></span>
            {next?.id === f.id && <span className="tag jade">{t("nextTurn")}</span>}
            {pick === f.id && <span aria-hidden>✓</span>}
          </button>))}
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
