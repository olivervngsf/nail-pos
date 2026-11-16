"use client";

// Desktop front desk: one screen for the whole day.
// Calendar (tech columns) in the middle, turn list / waiting / ready to pay on the right.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Keypad, LangToggle, OfflineBar } from "@/components/Shell";
import { SALON, SERVICES, STAFF, serviceById, staffById, techs, type Appointment, type Ticket } from "@/lib/data";
import { fmt, minutesFor, prettyPhone, timeOf } from "@/lib/money";
import { activeTicket, clientByPhone, dueCents, isClockedIn, ticketsFor, useStore } from "@/lib/store";
import { DeskCheckout } from "./DeskCheckout";

const HOUR_PX = 72;
const MIN = 60_000;

type Block =
  | { kind: "appt"; a: Appointment; start: number; end: number }
  | { kind: "ticket"; t: Ticket; start: number; end: number };

type Modal =
  | { kind: "book"; techId: string; start: number }
  | { kind: "block"; b: Block }
  | { kind: "assign"; waitingId: string }
  | { kind: "pin" }
  | null;

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);
  return now;
}

export default function Desk() {
  const { s, t, actions } = useStore();
  const now = useNow();
  const [modal, setModal] = useState<Modal>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const vi = s.lang === "vi";
  const L = (v: string, e: string) => (vi ? v : e);
  const svc = (ids: string[]) => ids.map((id) => serviceById(id)?.[s.lang]).join(" + ");
  const deskUser = staffById(s.deskUserId);

  // ---- blocks on the calendar ----
  const blocks = useMemo(() => {
    const list: (Block & { techId: string })[] = [];
    for (const a of s.appointments) {
      if (a.status === "arrived") continue;
      list.push({ kind: "appt", a, start: a.start, end: a.start + minutesFor(a.serviceIds) * MIN, techId: a.techId });
    }
    for (const tk of s.tickets) {
      const start = tk.startedAt ?? tk.createdAt;
      const end = Math.max(tk.doneAt ?? 0, start + minutesFor(tk.serviceIds) * MIN);
      list.push({ kind: "ticket", t: tk, start, end, techId: tk.techId });
    }
    return list;
  }, [s.appointments, s.tickets]);

  const day0 = new Date(now);
  day0.setHours(0, 0, 0, 0);
  const firstHour = Math.min(9, ...blocks.map((b) => new Date(b.start).getHours()));
  const lastHour = Math.max(19, ...blocks.map((b) => new Date(b.end).getHours() + 1));
  const top = (ms: number) => ((ms - day0.getTime()) / MIN - firstHour * 60) * (HOUR_PX / 60);
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);

  // ---- turn order: facts only, front desk decides ----
  const turnOrder = techs()
    .filter((x) => isClockedIn(s, x.id))
    .map((tech) => {
      const act = activeTicket(s, tech.id);
      const freeAt = act ? (act.startedAt ?? now) + minutesFor(act.serviceIds) * MIN : null;
      return { tech, turns: ticketsFor(s, tech.id).length, act, freeAt };
    })
    .sort((a, b) => Number(!!a.act) - Number(!!b.act) || a.turns - b.turns || (a.freeAt ?? 0) - (b.freeAt ?? 0));

  const ready = s.tickets.filter((x) => x.status === "ready");
  const inChair = s.tickets.filter((x) => x.status === "in_service").length;
  const salesToday = s.tickets.filter((x) => x.status === "paid").reduce((a, x) => a + dueCents(x), 0);
  const tipsToday = s.tickets.filter((x) => x.status === "paid").reduce((a, x) => a + x.tipCents, 0);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 4000);
  };

  // drag an appointment to a new tech / time
  const onDrop = (techId: string, e: React.DragEvent<HTMLDivElement>) => {
    const id = e.dataTransfer.getData("appt");
    const a = s.appointments.find((x) => x.id === id);
    if (!a) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const mins = Math.round(((y / HOUR_PX) * 60) / 15) * 15 + firstHour * 60;
    const start = day0.getTime() + mins * MIN;
    const end = start + minutesFor(a.serviceIds) * MIN;
    actions.moveAppointment(id, techId, start);
    actions.addLog(`${L("Dời lịch", "Moved")} ${clientByPhone(s, a.phone)?.name} → ${staffById(techId)?.name} ${timeOf(start)}`);
    const clash = blocks.find((b) => b.techId === techId && !(b.kind === "appt" && b.a.id === id) && b.start < end && b.end > start && !(b.kind === "ticket" && b.t.status === "paid"));
    if (clash) flash(L("Trùng giờ với khách khác. Không ai bị dời.", "Overlaps another client. Nobody else was moved."));
  };

  const checkoutTicket = s.tickets.find((x) => x.id === checkoutId);

  // Open the calendar scrolled to "now".
  const calRef = useRef<HTMLElement>(null);
  const nowTop = top(now);
  useEffect(() => {
    if (!checkoutId && calRef.current) calRef.current.scrollTop = Math.max(0, nowTop - 160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutId]);

  return (
    <div className="h-screen flex flex-col bg-stone-50 min-w-[1100px]">
      <OfflineBar />
      {/* Top bar */}
      <header className="flex items-center gap-4 px-5 py-3 bg-white border-b border-stone-200">
        <div className="mr-2">
          <div className="font-bold text-rose-700 text-lg leading-tight">{SALON.name}</div>
          <div className="text-sm text-stone-500">
            {L("Quầy", "Front desk")} · {new Date(now).toLocaleDateString(vi ? "vi-VN" : "en-US", { weekday: "short", month: "short", day: "numeric" })}
          </div>
        </div>
        <div className="flex gap-2 mr-auto">
          {[
            { n: fmt(salesToday), l: L(`doanh thu · ${fmt(tipsToday)} tip`, `sales · ${fmt(tipsToday)} tips`) },
            { n: s.waiting.length, l: L("đang chờ", "waiting") },
            { n: inChair, l: L("đang làm", "in chair") },
            { n: ready.length, l: L("chờ tính tiền", "ready to pay") },
          ].map((k, i) => (
            <div key={i} className="rounded-xl bg-stone-100 px-3 py-1.5">
              <span className="font-bold text-lg">{k.n}</span> <span className="text-sm text-stone-600">{k.l}</span>
            </div>
          ))}
        </div>
        <LangToggle />
        <button onClick={() => setModal({ kind: "pin" })} className="rounded-xl border border-stone-300 px-3 py-2 font-semibold">
          {deskUser?.name} · PIN
        </button>
        <Link href="/check-in" className="rounded-xl bg-rose-600 text-white px-4 py-2 font-bold">
          + {L("Khách vào", "Walk-in")}
        </Link>
        <button
          onClick={() => setModal({ kind: "book", techId: techs()[0].id, start: Math.ceil(now / (30 * MIN)) * 30 * MIN })}
          className="rounded-xl bg-stone-900 text-white px-4 py-2 font-bold"
        >
          + {L("Đặt lịch", "Booking")}
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left menu */}
        <nav className="w-44 shrink-0 bg-white border-r border-stone-200 p-3 space-y-1">
          {[
            { l: L("Lịch", "Calendar"), on: !checkoutTicket, go: () => setCheckoutId(null) },
            { l: L("Lượt (máy tính bảng)", "Turn list (tablet)"), href: "/" },
            { l: `${L("Tính tiền", "Checkout")} (${ready.length})`, on: !!checkoutTicket, go: () => ready[0] && setCheckoutId(ready[0].id) },
            { l: L("Khách hàng", "Clients"), soon: true },
            { l: L("Trả lương", "Payouts"), soon: true },
            { l: L("Báo cáo", "Reports"), soon: true },
            { l: L("Cài đặt", "Settings"), soon: true },
          ].map((m, i) =>
            m.href ? (
              <Link key={i} href={m.href} className="block rounded-xl px-3 py-2.5 font-semibold text-stone-600 hover:bg-stone-100">
                {m.l}
              </Link>
            ) : (
              <button
                key={i}
                disabled={m.soon}
                onClick={m.go}
                className={`w-full text-left rounded-xl px-3 py-2.5 font-semibold ${m.on ? "bg-rose-50 text-rose-700" : "text-stone-600 hover:bg-stone-100"} disabled:text-stone-300 disabled:hover:bg-transparent`}
              >
                {m.l}
                {m.soon && <span className="ml-1 text-xs">· {L("sắp có", "soon")}</span>}
              </button>
            ),
          )}
          <div className="pt-4 text-xs text-stone-400">
            {L("Trắng = đặt lịch · Vàng = đang làm · Xanh = chờ tính tiền · Cam = có vấn đề", "White = booked · Yellow = in chair · Green = ready to pay · Peach = problem")}
          </div>
        </nav>

        {checkoutTicket ? (
          <DeskCheckout ticket={checkoutTicket} close={() => setCheckoutId(null)} />
        ) : (
          <>
            {/* Calendar */}
            <main ref={calRef} className="flex-1 min-w-0 overflow-auto">
              
              <div className="flex sticky top-0 z-10 bg-white border-b border-stone-200">
                <div className="w-14 shrink-0" />
                {techs().map((x) => {
                  const on = isClockedIn(s, x.id);
                  const act = activeTicket(s, x.id);
                  const hasLateAppt = s.appointments.some((a) => a.techId === x.id && a.status === "booked" && a.start < now);
                  return (
                    <div key={x.id} className="flex-1 min-w-[150px] px-2 py-2 border-l border-stone-100">
                      <div className="font-bold text-lg">{x.name}</div>
                      <div className={`text-sm font-semibold ${!on ? (hasLateAppt ? "text-orange-600" : "text-stone-400") : act ? "text-amber-700" : "text-emerald-700"}`}>
                        {!on ? L("Chưa vào", "Not in") : act ? L("Đang làm", "Busy") : L("Rảnh", "Free")} · {ticketsFor(s, x.id).length} {t("turns")}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex relative">
                {/* hour labels */}
                <div className="w-14 shrink-0 relative">
                  {hours.map((h, i) => (
                    <div key={h} style={{ top: i * HOUR_PX + 2 }} className="absolute right-2 text-xs text-stone-400">
                      {h % 12 || 12} {h < 12 ? "AM" : "PM"}
                    </div>
                  ))}
                </div>
                {techs().map((x) => (
                  <div
                    key={x.id}
                    className="flex-1 min-w-[150px] relative border-l border-stone-200"
                    style={{ height: hours.length * HOUR_PX }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(x.id, e)}
                    onClick={(e) => {
                      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      const mins = Math.floor(((y / HOUR_PX) * 60) / 15) * 15 + firstHour * 60;
                      setModal({ kind: "book", techId: x.id, start: day0.getTime() + mins * MIN });
                    }}
                  >
                    {hours.map((h) => (
                      <div key={h} style={{ height: HOUR_PX }} className="border-b border-stone-100 hover:bg-rose-50/40" />
                    ))}
                    {layoutLanes(blocks.filter((b) => b.techId === x.id)).map(({ b, lane, lanes }, i) => (
                      <BlockCard
                        key={i}
                        b={b}
                        now={now}
                        top={top(b.start)}
                        height={Math.max(30, top(b.end) - top(b.start) - 2)}
                        left={`calc(${(lane / lanes) * 100}% + 2px)`}
                        width={`calc(${100 / lanes}% - 4px)`}
                        onOpen={() => setModal({ kind: "block", b })}
                      />
                    ))}
                  </div>
                ))}
                {/* now line */}
                {top(now) > 0 && top(now) < hours.length * HOUR_PX && (
                  <div className="absolute left-14 right-0 border-t-2 border-red-500 pointer-events-none" style={{ top: top(now) }}>
                    <span className="absolute -left-12 -top-2.5 text-[10px] font-bold text-red-600 bg-stone-50">{timeOf(now)}</span>
                  </div>
                )}
              </div>
            </main>

            {/* Right panel */}
            <aside className="w-80 shrink-0 bg-white border-l border-stone-200 p-4 overflow-y-auto space-y-6">
              <section>
                <h2 className="font-bold mb-2">{t("turnList")}</h2>
                {turnOrder.length === 0 && <p className="text-stone-500 text-sm">{t("noTechs")}</p>}
                <ol className="space-y-1.5">
                  {turnOrder.map(({ tech, turns, act, freeAt }, i) => (
                    <li key={tech.id} className={`rounded-xl px-3 py-2 ${i === 0 && !act ? "bg-emerald-50 border border-emerald-300" : "bg-stone-50"}`}>
                      <b>
                        {i + 1}. {tech.name}
                      </b>{" "}
                      <span className="text-sm text-stone-600">
                        · {act ? `${t("freeAt")} ${freeAt && timeOf(freeAt)}` : t("free")} · {turns} {t("turns")}
                        {i === 0 && !act && <b className="text-emerald-700"> · {t("next")}</b>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h2 className="font-bold mb-2">
                  {t("waiting")} ({s.waiting.length})
                </h2>
                {s.waiting.length === 0 && <p className="text-stone-500 text-sm">{t("noWaiting")}</p>}
                <ul className="space-y-2">
                  {s.waiting.map((w) => {
                    const c = clientByPhone(s, w.phone);
                    const mins = Math.round((now - w.at) / MIN);
                    return (
                      <li key={w.id} className="rounded-xl border border-stone-200 p-3">
                        <div className="flex justify-between">
                          <b>
                            {c?.name} {c?.notes && <span title={c.notes}>⚠</span>}
                          </b>
                          <span className={`text-sm ${mins >= 15 ? "text-orange-600 font-bold" : "text-stone-500"}`}>{mins} min</span>
                        </div>
                        <div className="text-sm text-stone-600">{svc(w.serviceIds)}</div>
                        {w.requestedTechId && <div className="text-sm text-blue-700">★ {staffById(w.requestedTechId)?.name}</div>}
                        <button onClick={() => setModal({ kind: "assign", waitingId: w.id })} className="mt-2 w-full rounded-lg bg-stone-900 text-white py-1.5 font-semibold">
                          {L("Giao thợ", "Assign")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section>
                <h2 className="font-bold mb-2">{t("readyToPay")}</h2>
                {ready.length === 0 && <p className="text-stone-500 text-sm">{t("noReady")}</p>}
                <ul className="space-y-2">
                  {ready.map((x) => (
                    <li key={x.id}>
                      <button onClick={() => setCheckoutId(x.id)} className="w-full text-left rounded-xl bg-emerald-50 border border-emerald-300 p-3">
                        <div className="flex justify-between font-bold">
                          <span>{clientByPhone(s, x.phone)?.name}</span>
                          <span>{fmt(dueCents(x))}</span>
                        </div>
                        <div className="text-sm text-stone-600">
                          {staffById(x.techId)?.name} · {svc(x.serviceIds)} → {t("checkout")}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="font-bold mb-2">{L("Nhật ký", "Log")}</h2>
                <ul className="text-sm text-stone-600 space-y-1">
                  {s.log.slice(0, 6).map((l, i) => (
                    <li key={i}>
                      {timeOf(l.at)} · {l.text} <span className="text-stone-400">({l.by})</span>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </>
        )}
      </div>

      {notice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-2xl bg-stone-900 text-white font-semibold px-5 py-3 shadow-lg">{notice}</div>
      )}
      {modal?.kind === "book" && <BookModal init={modal} close={() => setModal(null)} onDone={(m) => flash(m)} />}
      {modal?.kind === "block" && <BlockModal b={modal.b} close={() => setModal(null)} checkout={(id) => setCheckoutId(id)} />}
      {modal?.kind === "assign" && <AssignModal waitingId={modal.waitingId} order={turnOrder.map((o) => o.tech.id)} close={() => setModal(null)} />}
      {modal?.kind === "pin" && <PinModal close={() => setModal(null)} />}
    </div>
  );
}

// ---------------- calendar block ----------------

// Overlapping clients on one tech sit side by side, never on top of each other.
function layoutLanes<T extends { start: number; end: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: { b: T; lane: number; lanes: number }[] = [];
  let cluster: { b: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const flush = () => {
    cluster.forEach((c) => (c.lanes = laneEnds.length));
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= b.start);
    if (lane === -1) lane = laneEnds.push(b.end) - 1;
    else laneEnds[lane] = b.end;
    cluster.push({ b, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

function BlockCard({ b, now, top, height, left, width, onOpen }: { b: Block; now: number; top: number; height: number; left: string; width: string; onOpen: () => void }) {
  const { s } = useStore();
  const vi = s.lang === "vi";
  const L = (v: string, e: string) => (vi ? v : e);
  const phone = b.kind === "appt" ? b.a.phone : b.t.phone;
  const ids = b.kind === "appt" ? b.a.serviceIds : b.t.serviceIds;
  const c = clientByPhone(s, phone);
  let cls = "bg-white border-stone-300";
  let tag = "";
  if (b.kind === "appt") {
    const late = b.a.status === "booked" && b.a.start < now;
    if (b.a.status === "no_show") [cls, tag] = ["bg-orange-50 border-orange-300 line-through opacity-70", L("Không đến", "No-show")];
    else if (late) [cls, tag] = ["bg-orange-100 border-orange-400", `${L("Trễ", "Late")} ${Math.round((now - b.a.start) / MIN)} min`];
    else tag = `${b.a.source === "online" ? "Online" : L("Gọi điện", "Called")}${b.a.texted ? " · ✓ text" : ""}`;
  } else {
    const st = b.t.status;
    if (st === "in_service") [cls, tag] = ["bg-amber-100 border-amber-400", L("Đang làm", "In chair")];
    else if (st === "assigned") [cls, tag] = ["bg-amber-50 border-amber-300 border-dashed", L("Kế tiếp", "Next")];
    else if (st === "ready") [cls, tag] = ["bg-emerald-100 border-emerald-400", L("Chờ tính tiền", "Ready for bill")];
    else [cls, tag] = ["bg-stone-100 border-stone-200 text-stone-500", L("Đã trả", "Paid")];
  }
  return (
    <button
      draggable={b.kind === "appt" && b.a.status === "booked"}
      onDragStart={(e) => b.kind === "appt" && e.dataTransfer.setData("appt", b.a.id)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`absolute rounded-lg border-2 px-2 py-1 text-left overflow-hidden text-sm leading-tight shadow-sm ${cls}`}
      style={{ top, height, left, width }}
    >
      <div className="font-bold truncate">
        {b.kind === "appt" && b.a.requested && "★ "}
        {c?.name ?? prettyPhone(phone)} {c?.notes && "⚠"}
      </div>
      <div className="truncate">
        {ids.map((id) => serviceById(id)?.[s.lang]).join(" + ")} · {fmt(ids.reduce((a, id) => a + (serviceById(id)?.priceCents ?? 0), 0))}
      </div>
      <div className="text-xs font-semibold opacity-80 truncate">
        {timeOf(b.start)} · {tag}
        {b.kind === "ticket" && b.t.source && b.t.source !== "walk-in" ? "" : b.kind === "ticket" ? " · Walk-in" : ""}
      </div>
    </button>
  );
}

// ---------------- modals ----------------

function Sheet({ children, close, wide }: { children: React.ReactNode; close: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={close}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} bg-white rounded-3xl p-6 max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Staff quick-add: phone → service → confirm (tech + time already set by the slot)
function BookModal({ init, close, onDone }: { init: { techId: string; start: number }; close: () => void; onDone: (m: string) => void }) {
  const { s, actions } = useStore();
  const vi = s.lang === "vi";
  const L = (v: string, e: string) => (vi ? v : e);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [techId, setTechId] = useState(init.techId);
  const [picked, setPicked] = useState<string[]>([]);
  const c = phone.length === 10 ? clientByPhone(s, phone) : undefined;

  useEffect(() => {
    if (c?.lastServiceId) setPicked([c.lastServiceId]);
  }, [c?.lastServiceId]);

  const ok = phone.length === 10 && (c || name.trim()) && picked.length > 0;
  return (
    <Sheet close={close} wide>
      <h3 className="text-xl font-bold">
        {L("Đặt lịch", "New booking")} · {staffById(techId)?.name} · {timeOf(init.start)}
      </h3>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="text-3xl font-semibold tracking-wide h-10">{prettyPhone(phone) || <span className="text-stone-300">(___) ___-____</span>}</div>
          <Keypad onKey={(d) => setPhone((p) => (p.length < 10 ? p + d : p))} onDelete={() => setPhone((p) => p.slice(0, -1))} />
          <p className="text-xs text-stone-400">Demo: 4155550103 → Mai Tran</p>
        </div>
        <div className="space-y-3">
          {c ? (
            <div className="rounded-xl bg-stone-50 p-3">
              <b className="text-lg">{c.name}</b>
              <div className="text-sm text-stone-600">
                {c.visits} {L("lần", "visits")} · {L("lần trước", "last")}: {serviceById(c.lastServiceId ?? "")?.[s.lang]} · {staffById(c.lastTechId ?? "")?.name}
              </div>
              {c.notes && <div className="text-sm text-amber-800 mt-1">⚠ {c.notes}</div>}
            </div>
          ) : phone.length === 10 ? (
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={L("Tên khách mới", "New client name")} className="w-full rounded-xl border-2 border-stone-200 p-3 text-lg" />
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {SERVICES.map((x) => (
              <button
                key={x.id}
                onClick={() => setPicked((p) => (p.includes(x.id) ? p.filter((y) => y !== x.id) : [...p, x.id]))}
                className={`rounded-lg border-2 px-2 py-1 text-sm font-semibold ${picked.includes(x.id) ? "border-rose-600 bg-rose-50" : "border-stone-200"}`}
              >
                {x[s.lang]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {techs().map((x) => (
              <button key={x.id} onClick={() => setTechId(x.id)} className={`rounded-lg px-3 py-1 font-semibold ${techId === x.id ? "bg-stone-900 text-white" : "bg-stone-100"}`}>
                {x.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="rounded-xl bg-stone-100 py-3 font-bold" onClick={close}>
          {L("Hủy", "Cancel")}
        </button>
        <button
          disabled={!ok}
          className="rounded-xl bg-rose-600 text-white py-3 font-bold disabled:opacity-40"
          onClick={() => {
            if (!c) actions.upsertClient({ phone, name: name.trim(), visits: 0 });
            actions.book({ phone, techId, serviceIds: picked, start: init.start, source: "called", requested: false, texted: true });
            actions.addLog(`${L("Đặt lịch", "Booked")} ${c?.name ?? name} · ${staffById(techId)?.name} ${timeOf(init.start)}`);
            onDone(L("Đã đặt. Đã nhắn tin xác nhận cho khách.", "Booked. Confirmation text sent to the client."));
            close();
          }}
        >
          {L("Xác nhận · nhắn tin cho khách", "Confirm · text client")}
        </button>
      </div>
    </Sheet>
  );
}

function BlockModal({ b, close, checkout }: { b: Block; close: () => void; checkout: (id: string) => void }) {
  const { s, actions } = useStore();
  const vi = s.lang === "vi";
  const L = (v: string, e: string) => (vi ? v : e);
  const phone = b.kind === "appt" ? b.a.phone : b.t.phone;
  const ids = b.kind === "appt" ? b.a.serviceIds : b.t.serviceIds;
  const techId = b.kind === "appt" ? b.a.techId : b.t.techId;
  const c = clientByPhone(s, phone);
  const btn = "rounded-xl py-3 font-bold";
  const act = (fn: () => void, log: string) => {
    fn();
    actions.addLog(log);
    close();
  };
  return (
    <Sheet close={close}>
      <div className="text-sm text-stone-500">
        {timeOf(b.start)}–{timeOf(b.end)} · {staffById(techId)?.name}
      </div>
      <h3 className="text-2xl font-bold">{c?.name}</h3>
      <div className="text-stone-600">{prettyPhone(phone)}</div>
      <div className="mt-2 text-lg">
        {ids.map((id) => serviceById(id)?.[s.lang]).join(" + ")} · <b>{fmt(ids.reduce((a, id) => a + (serviceById(id)?.priceCents ?? 0), 0))}</b>
      </div>
      {c?.notes && <div className="mt-2 rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">⚠ {c.notes}</div>}
      <div className="mt-5 grid gap-2">
        {b.kind === "appt" && b.a.status === "booked" && (
          <>
            <button className={`${btn} bg-rose-600 text-white`} onClick={() => act(() => actions.arrive(b.a.id), `${c?.name} ${L("đã đến", "arrived")}`)}>
              {L("Khách đã đến · bắt đầu", "Client arrived · start")}
            </button>
            <button className={`${btn} bg-stone-100 text-orange-700`} onClick={() => act(() => actions.noShow(b.a.id), `${c?.name}: no-show`)}>
              {L("Không đến (no-show)", "No-show")}
            </button>
            <p className="text-xs text-stone-400">{L("Kéo thẻ để đổi giờ hoặc thợ.", "Drag the card to change time or tech.")}</p>
          </>
        )}
        {b.kind === "ticket" && b.t.status === "assigned" && (
          <button className={`${btn} bg-stone-900 text-white`} onClick={() => act(() => actions.start(b.t.id), `#${b.t.number} ${L("bắt đầu", "started")}`)}>
            {L("Bắt đầu", "Start")}
          </button>
        )}
        {b.kind === "ticket" && b.t.status === "in_service" && (
          <button className={`${btn} bg-emerald-600 text-white`} onClick={() => act(() => actions.finish(b.t.id), `#${b.t.number} ${L("xong", "done")}`)}>
            {L("Xong · chờ tính tiền", "Done · ready to pay")}
          </button>
        )}
        {b.kind === "ticket" && b.t.status === "ready" && (
          <button
            className={`${btn} bg-emerald-600 text-white`}
            onClick={() => {
              checkout(b.t.id);
              close();
            }}
          >
            {L("Tính tiền", "Checkout")} · {fmt(dueCents(b.t))}
          </button>
        )}
        {b.kind === "ticket" && b.t.status === "paid" && (
          <div className="rounded-xl bg-stone-50 p-3 text-sm">
            ✓ {L("Đã trả", "Paid")} {fmt(dueCents(b.t))} + tip {fmt(b.t.tipCents)} ({b.t.tipMethod}) · {L("phí thẻ", "card fee")} {fmt(b.t.cardFeeCents)}
          </div>
        )}
        <button className={`${btn} bg-stone-100`} onClick={close}>
          {L("Đóng", "Close")}
        </button>
      </div>
    </Sheet>
  );
}

// Insight, not autopilot: show the order and facts; optional one-tap reason when skipping.
function AssignModal({ waitingId, order, close }: { waitingId: string; order: string[]; close: () => void }) {
  const { s, t, actions } = useStore();
  const vi = s.lang === "vi";
  const L = (v: string, e: string) => (vi ? v : e);
  const [reason, setReason] = useState<string | null>(null);
  const w = s.waiting.find((x) => x.id === waitingId);
  if (!w) return null;
  const c = clientByPhone(s, w.phone);
  const firstFree = order.find((id) => !activeTicket(s, id));
  const reasons = [L("Khách yêu cầu", "Client asked"), L("Đúng tay nghề", "Skill fit"), L("Thợ đang nghỉ", "Tech on break"), L("Khác", "Other")];
  return (
    <Sheet close={close}>
      <h3 className="text-xl font-bold">
        {t("pickTech")} {c?.name}
      </h3>
      <p className="text-stone-500">{w.serviceIds.map((id) => serviceById(id)?.[s.lang]).join(" + ")}</p>
      <div className="mt-3 text-sm font-semibold text-stone-500">{L("Lý do nếu bỏ lượt (không bắt buộc)", "Reason if skipping (optional)")}</div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {reasons.map((r) => (
          <button key={r} onClick={() => setReason(reason === r ? null : r)} className={`rounded-full px-3 py-1 text-sm font-semibold ${reason === r ? "bg-stone-900 text-white" : "bg-stone-100"}`}>
            {r}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {order.map((id, i) => {
          const tech = staffById(id)!;
          const act = activeTicket(s, id);
          const req = w.requestedTechId === id;
          return (
            <li key={id}>
              <button
                onClick={() => {
                  actions.assign(w.id, id);
                  const skipped = firstFree && firstFree !== id ? staffById(firstFree)?.name : null;
                  actions.addLog(
                    `${c?.name} → ${tech.name}` + (skipped ? ` · ${L("bỏ lượt", "skipped")} ${skipped}${reason ? `: ${reason}` : req ? `: ${L("khách yêu cầu", "client asked")}` : ""}` : ""),
                  );
                  close();
                }}
                className={`w-full flex justify-between rounded-xl border-2 p-3 text-left ${req ? "border-blue-500 bg-blue-50" : id === firstFree ? "border-emerald-400" : "border-stone-200"}`}
              >
                <span>
                  <b>
                    {i + 1}. {tech.name}
                  </b>
                  {req && <span className="text-sm text-blue-700"> ★ {t("requested")}</span>}
                  {id === firstFree && <span className="text-sm text-emerald-700"> · {t("next")}</span>}
                  <span className="block text-sm text-stone-500">
                    {ticketsFor(s, id).length} {t("turns")} · {act ? t("busy") : t("free")}
                  </span>
                </span>
                <span className="text-stone-400 text-xl">›</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="mt-4 w-full rounded-xl bg-stone-100 py-3 font-bold" onClick={close}>
        {t("cancel")}
      </button>
    </Sheet>
  );
}

// Who's using the desk: every action is credited to the PIN user.
function PinModal({ close }: { close: () => void }) {
  const { s, t, actions } = useStore();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setErr(false);
    setPin(next);
    if (next.length === 4) {
      const who = STAFF.find((x) => x.pin === next);
      if (who) {
        actions.setDeskUser(who.id);
        close();
      } else {
        setErr(true);
        setTimeout(() => setPin(""), 150);
      }
    }
  };
  return (
    <Sheet close={close}>
      <h3 className="text-xl font-bold text-center">{t("enterPin")}</h3>
      <p className="text-center text-stone-500 text-sm">
        {s.lang === "vi" ? "Đang dùng" : "Now using"}: {staffById(s.deskUserId)?.name}
      </p>
      <div className="flex justify-center gap-3 my-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`w-4 h-4 rounded-full ${err ? "bg-red-500" : i < pin.length ? "bg-stone-900" : "bg-stone-200"}`} />
        ))}
      </div>
      <Keypad onKey={press} onDelete={() => setPin((p) => p.slice(0, -1))} />
      <p className="text-center text-xs text-stone-400 mt-3">Demo: Thảo 5555 · Kim 9999</p>
    </Sheet>
  );
}
