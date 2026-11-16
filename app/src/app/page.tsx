"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header, primary, secondary } from "@/components/Shell";
import { serviceById, staffById, techs, type WaitingClient } from "@/lib/data";
import { fmt, minutesFor, timeOf } from "@/lib/money";
import { activeTicket, clientByPhone, isClockedIn, ticketsFor, useStore } from "@/lib/store";

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

export default function TurnList() {
  const { s, t, actions } = useStore();
  const now = useNow();
  const [picking, setPicking] = useState<WaitingClient | null>(null);
  const svcName = (id: string) => serviceById(id)?.[s.lang];

  // Facts per tech. Sorted by fewest turns first, but the front desk decides.
  const working = techs()
    .filter((x) => isClockedIn(s, x.id))
    .map((tech) => {
      const list = ticketsFor(s, tech.id);
      const active = activeTicket(s, tech.id);
      const freeAt = active ? (active.startedAt ?? now) + minutesFor(active.serviceIds) * 60_000 : null;
      return {
        tech,
        turns: list.length,
        sales: list.reduce((a, x) => a + x.subtotalCents, 0),
        active,
        freeAt,
      };
    })
    .sort((a, b) => Number(!!a.active) - Number(!!b.active) || a.turns - b.turns);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl p-4 grid gap-6 md:grid-cols-[1fr_1.4fr]">
        {/* Waiting clients */}
        <section>
          <h2 className="text-lg font-bold mb-3">
            {t("waiting")} <span className="text-stone-400">({s.waiting.length})</span>
          </h2>
          {s.waiting.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center">
              <p className="text-stone-500 mb-4">{t("noWaiting")}</p>
              <Link href="/check-in" className={primary + " block"}>
                {t("checkInClient")}
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {s.waiting.map((w) => {
                const c = clientByPhone(s, w.phone);
                const req = w.requestedTechId ? staffById(w.requestedTechId) : null;
                const mins = Math.max(0, Math.round((now - w.at) / 60_000));
                return (
                  <li key={w.id}>
                    <button
                      onClick={() => setPicking(w)}
                      className="w-full text-left rounded-2xl bg-white border border-stone-200 p-4 shadow-sm active:bg-stone-50"
                    >
                      <div className="flex justify-between items-baseline">
                        <span className="text-xl font-bold">{c?.name ?? w.phone}</span>
                        <span className={`text-sm font-semibold ${mins >= 15 ? "text-orange-600" : "text-stone-500"}`}>
                          {mins} min
                        </span>
                      </div>
                      <div className="text-stone-600">{w.serviceIds.map(svcName).join(" + ")}</div>
                      <div className="mt-1 text-sm font-semibold text-blue-700">
                        {req ? `${t("requested")}: ${req.name}` : t("anyTech")}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Techs working */}
        <section>
          <h2 className="text-lg font-bold mb-3">{t("techsWorking")}</h2>
          {working.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-stone-500">
              {t("noTechs")}{" "}
              <Link className="text-rose-700 font-semibold underline" href="/pin">
                {t("clockInHint")}
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {working.map(({ tech, turns, sales, active, freeAt }) => {
                const c = active ? clientByPhone(s, active.phone) : null;
                return (
                  <li key={tech.id} className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold">{tech.name}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-bold ${
                          active ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {active ? t("busy") : t("free")}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-4 text-stone-600">
                      <span>
                        <b className="text-stone-900">{turns}</b> {t("turns")}
                      </span>
                      <span>
                        <b className="text-stone-900">{fmt(sales)}</b> {t("today")}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-stone-500">{tech.skills.join(" · ")}</div>
                    {active && (
                      <div className="mt-3 rounded-xl bg-stone-50 p-3">
                        <div className="font-semibold">
                          {c?.name} · {active.serviceIds.map(svcName).join(" + ")}
                        </div>
                        <div className="text-sm text-stone-500">
                          {active.status === "assigned" ? t("next") : t("inService")} · {t("freeAt")} {freeAt && timeOf(freeAt)}
                        </div>
                        <div className="mt-2 flex gap-2">
                          {active.status === "assigned" ? (
                            <button onClick={() => actions.start(active.id)} className="flex-1 rounded-xl bg-stone-900 text-white py-2 font-semibold">
                              {t("start")}
                            </button>
                          ) : (
                            <button onClick={() => actions.finish(active.id)} className="flex-1 rounded-xl bg-emerald-600 text-white py-2 font-semibold">
                              {t("done")}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      <div className="mx-auto max-w-6xl px-4 pb-8 text-right">
        <button className="text-sm text-stone-400 underline" onClick={() => confirm("Reset demo data?") && actions.reset()}>
          {t("resetDemo")}
        </button>
      </div>

      {/* Pick a tech: show facts, the front desk decides */}
      {picking && (
        <div className="fixed inset-0 z-20 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setPicking(null)}>
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-1">
              {t("pickTech")} {clientByPhone(s, picking.phone)?.name}
            </h3>
            <p className="text-stone-500 mb-4">{picking.serviceIds.map(svcName).join(" + ")}</p>
            <ul className="space-y-2 mb-4">
              {working.map(({ tech, turns, sales, active, freeAt }) => {
                const requested = picking.requestedTechId === tech.id;
                return (
                  <li key={tech.id}>
                    <button
                      onClick={() => {
                        actions.assign(picking.id, tech.id);
                        setPicking(null);
                      }}
                      className={`w-full flex justify-between items-center rounded-2xl border-2 p-4 text-left ${
                        requested ? "border-blue-500 bg-blue-50" : "border-stone-200"
                      }`}
                    >
                      <span>
                        <span className="text-lg font-bold">{tech.name}</span>
                        {requested && <span className="ml-2 text-sm font-semibold text-blue-700">{t("requested")}</span>}
                        <span className="block text-sm text-stone-500">
                          {turns} {t("turns")} · {fmt(sales)} · {active ? `${t("freeAt")} ${freeAt && timeOf(freeAt)}` : t("free")}
                        </span>
                      </span>
                      <span className="text-2xl text-stone-400">›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="grid grid-cols-2 gap-3">
              <button className={secondary} onClick={() => setPicking(null)}>
                {t("cancel")}
              </button>
              <button
                className={`${secondary} text-red-700`}
                onClick={() => {
                  actions.removeWaiting(picking.id);
                  setPicking(null);
                }}
              >
                Walk-out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
