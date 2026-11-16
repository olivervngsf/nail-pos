"use client";

import { useState } from "react";
import { Header, Keypad, primary, secondary } from "@/components/Shell";
import { SERVICES, STAFF, serviceById, type Staff } from "@/lib/data";
import { fmt, minutesFor, timeOf } from "@/lib/money";
import { activeTicket, clientByPhone, clockedInAt, isClockedIn, ticketsFor, useStore } from "@/lib/store";

type View = "home" | "client" | "earnings";

export default function PinPage() {
  const { t } = useStore();
  const [pin, setPin] = useState("");
  const [tries, setTries] = useState(0);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<Staff | null>(null);
  const [view, setView] = useState<View>("home");
  const locked = tries >= 3;

  const press = (d: string) => {
    if (locked) return;
    const next = (pin + d).slice(0, 4);
    setError(false);
    setPin(next);
    if (next.length === 4) {
      const who = STAFF.find((x) => x.pin === next);
      if (who) {
        setMe(who);
        setView("home");
        setTries(0);
      } else {
        setError(true);
        setTries((n) => n + 1);
      }
      setTimeout(() => setPin(""), 150);
    }
  };

  const exit = () => {
    setMe(null);
    setPin("");
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md p-4">
        {!me ? (
          <div className="space-y-6 pt-4">
            <h1 className="text-2xl font-bold text-center">{t("enterPin")}</h1>
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`w-5 h-5 rounded-full ${i < pin.length ? "bg-stone-900" : "bg-stone-200"} ${error ? "bg-red-500" : ""}`} />
              ))}
            </div>
            <p className={`text-center h-6 font-semibold ${locked ? "text-red-700" : "text-red-600"}`}>
              {locked ? t("pinLocked") : error ? t("wrongPin") : ""}
            </p>
            <Keypad onKey={press} onDelete={() => setPin((p) => p.slice(0, -1))} />
            {locked && (
              <button className={secondary} onClick={() => setTries(0)}>
                Manager OK
              </button>
            )}
            <p className="text-center text-sm text-stone-400">Demo PINs: Lan 1111 · Hoa 2222 · Tuấn 3333 · Vy 4444 · Kim (manager) 9999</p>
          </div>
        ) : view === "home" ? (
          <StaffHome me={me} go={setView} exit={exit} />
        ) : view === "client" ? (
          <MyClient me={me} back={() => setView("home")} />
        ) : (
          <MyEarnings me={me} back={() => setView("home")} />
        )}
      </main>
    </>
  );
}

function StaffHome({ me, go, exit }: { me: Staff; go: (v: View) => void; exit: () => void }) {
  const { s, t, actions } = useStore();
  const inAt = clockedInAt(s, me.id);
  const isTech = me.role === "tech";
  return (
    <div className="space-y-4 pt-4">
      <h1 className="text-3xl font-bold">
        {t("hello")}, {me.name} 👋
      </h1>
      {inAt ? (
        <p className="text-emerald-700 font-semibold">
          ✓ {t("clockedInAt")} {timeOf(inAt)}
        </p>
      ) : null}
      {inAt ? (
        <button className={secondary} onClick={() => { actions.clockOut(me.id); exit(); }}>
          {t("clockOut")}
        </button>
      ) : (
        <button className={primary} onClick={() => { actions.clockIn(me.id); exit(); }}>
          {t("clockIn")}
        </button>
      )}
      {isTech && (
        <>
          <button className={secondary} onClick={() => go("client")}>
            {t("myClient")}
          </button>
          <button className={secondary} onClick={() => go("earnings")}>
            {t("myEarnings")}
          </button>
        </>
      )}
      <button className="w-full py-4 text-stone-500 font-semibold" onClick={exit}>
        {t("exit")}
      </button>
    </div>
  );
}

function MyClient({ me, back }: { me: Staff; back: () => void }) {
  const { s, t, actions } = useStore();
  const tk = activeTicket(s, me.id);
  const c = tk ? clientByPhone(s, tk.phone) : null;
  const addons = SERVICES.filter((x) => x.addon);

  if (!tk)
    return (
      <div className="space-y-6 pt-10 text-center">
        <p className="text-xl text-stone-500">{isClockedIn(s, me.id) ? t("noClientYet") : t("clockInHint")}</p>
        <button className={secondary} onClick={back}>{t("back")}</button>
      </div>
    );

  return (
    <div className="space-y-4 pt-4">
      <div className="text-sm font-semibold text-stone-500">{tk.status === "assigned" ? t("yourNextClient") : t("inService")}</div>
      <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm">
        <div className="text-3xl font-bold">{c?.name}</div>
        <div className="text-lg">{tk.serviceIds.map((id) => serviceById(id)?.[s.lang]).join(" + ")}</div>
        <div className="text-stone-500">{minutesFor(tk.serviceIds)} min · {fmt(tk.subtotalCents)}</div>
        {c?.notes && <div className="mt-3 rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">{c.notes}</div>}
      </div>
      {tk.status === "in_service" && (
        <div>
          <div className="font-bold text-stone-500 mb-2">{t("addons")}</div>
          <div className="grid grid-cols-3 gap-2">
            {addons.map((a) => {
              const on = tk.serviceIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => actions.setServices(tk.id, on ? tk.serviceIds.filter((x) => x !== a.id) : [...tk.serviceIds, a.id])}
                  className={`rounded-xl border-2 p-2 text-sm font-semibold ${on ? "border-rose-600 bg-rose-50" : "border-stone-200 bg-white"}`}
                >
                  {a[s.lang]}
                  <div className="text-stone-500 font-normal">+{fmt(a.priceCents)}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {tk.status === "assigned" ? (
        <button className={primary} onClick={() => actions.start(tk.id)}>{t("start")}</button>
      ) : (
        <button className={`${primary} !bg-emerald-600`} onClick={() => { actions.finish(tk.id); back(); }}>{t("done")}</button>
      )}
      <button className={secondary} onClick={back}>{t("back")}</button>
    </div>
  );
}

function MyEarnings({ me, back }: { me: Staff; back: () => void }) {
  const { s, t, actions } = useStore();
  const [sent, setSent] = useState(false);
  const paid = ticketsFor(s, me.id).filter((x) => x.status === "paid");
  const rows = paid.map((x) => ({
    x,
    commission: Math.round((x.subtotalCents * me.commissionPct) / 100),
    cardTip: x.tipMethod === "card" ? x.tipCents : 0,
    cashTip: x.tipMethod === "cash" ? x.tipCents : 0,
  }));
  const sum = (k: "commission" | "cardTip" | "cashTip") => rows.reduce((a, r) => a + r[k], 0);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-between items-baseline">
        <h1 className="text-2xl font-bold">{t("myEarnings")} · {me.name}</h1>
        <span className="text-stone-500">{new Date().toLocaleDateString()}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-stone-500 py-8 text-center">{t("noTickets")}</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-2xl bg-white border border-stone-200">
          {rows.map(({ x, commission }) => (
            <li key={x.id} className="p-3">
              <div className="flex justify-between font-semibold">
                <span>#{x.number} · {x.paidAt && timeOf(x.paidAt)}</span>
                <span>{fmt(commission + x.tipCents)}</span>
              </div>
              <div className="text-sm text-stone-600">{x.serviceIds.map((id) => serviceById(id)?.[s.lang]).join(" + ")} · {fmt(x.subtotalCents)}</div>
              <div className="text-sm text-stone-500">
                {t("commission")} {me.commissionPct}%: {fmt(commission)} · {t("tip")} ({x.tipMethod === "cash" ? t("cash") : t("card")}): {fmt(x.tipCents)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <dl className="rounded-2xl bg-stone-900 text-white p-4 grid grid-cols-2 gap-y-1">
        <dt>{t("commission")}</dt><dd className="text-right">{fmt(sum("commission"))}</dd>
        <dt>{t("tip")} · {t("card")}</dt><dd className="text-right">{fmt(sum("cardTip"))}</dd>
        <dt>{t("tip")} · {t("cash")}</dt><dd className="text-right">{fmt(sum("cashTip"))}</dd>
        <dt className="text-xl font-bold pt-2">{t("totalPay")}</dt>
        <dd className="text-xl font-bold pt-2 text-right">{fmt(sum("commission") + sum("cardTip") + sum("cashTip"))}</dd>
      </dl>
      <p className="text-xs text-stone-500">Tips: 100% to you. Card fee on tips is not taken from you.</p>
      <div className="grid grid-cols-2 gap-3 print:hidden">
        <button className={secondary} onClick={() => window.print()}>{t("print")}</button>
        <button className={secondary} disabled={sent} onClick={() => { actions.reportProblem(me.id, "Earnings look wrong"); setSent(true); }}>
          {sent ? "✓" : t("reportProblem")}
        </button>
      </div>
      {sent && <p className="text-emerald-700 font-semibold">{t("reported")}</p>}
      <button className={`${secondary} print:hidden`} onClick={back}>{t("back")}</button>
    </div>
  );
}
