"use client";

// Prototype store: all data lives on this device (localStorage), so every
// action works with no internet. Later this becomes a local queue that syncs
// to Supabase.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  CLIENTS,
  type Client,
  type ClockEntry,
  type Ticket,
  type WaitingClient,
} from "./data";
import { cardFee, sumServices } from "./money";
import { translate, type Key, type Lang } from "./i18n";

type State = {
  lang: Lang;
  clients: Client[];
  clock: ClockEntry[];
  waiting: WaitingClient[];
  tickets: Ticket[];
  problems: { staffId: string; at: number; note: string }[];
  nextNumber: number;
};

const KEY = "nailpos-proto-v1";
const uid = () => Math.random().toString(36).slice(2, 10);

function seed(): State {
  const now = Date.now();
  const h = 3600_000;
  return {
    lang: "vi",
    clients: CLIENTS,
    clock: [
      { staffId: "lan", inAt: now - 3 * h },
      { staffId: "hoa", inAt: now - 2.5 * h },
      { staffId: "tuan", inAt: now - 1 * h },
    ],
    waiting: [
      { id: uid(), phone: "4155550103", serviceIds: ["fill"], requestedTechId: "hoa", at: now - 8 * 60_000 },
      { id: uid(), phone: "4155550102", serviceIds: ["gelpedi"], requestedTechId: null, at: now - 3 * 60_000 },
    ],
    tickets: [
      {
        id: uid(), number: 101, phone: "4155550101", techId: "lan", serviceIds: ["gelmani", "art"],
        status: "paid", createdAt: now - 2.5 * h, startedAt: now - 2.5 * h, doneAt: now - 1.8 * h, paidAt: now - 1.7 * h,
        subtotalCents: 5000, tipCents: 1000, tipMethod: "card", payMethod: "card", cardFeeCents: cardFee(6000), receipt: "text",
      },
      {
        id: uid(), number: 102, phone: "4155550104", techId: "hoa", serviceIds: ["pedi"],
        status: "paid", createdAt: now - 2 * h, startedAt: now - 2 * h, doneAt: now - 1.3 * h, paidAt: now - 1.2 * h,
        subtotalCents: 3500, tipCents: 700, tipMethod: "cash", payMethod: "cash", cardFeeCents: 0, receipt: "none",
      },
      {
        id: uid(), number: 103, phone: "4155550101", techId: "lan", serviceIds: ["pedi"],
        status: "in_service", createdAt: now - 25 * 60_000, startedAt: now - 25 * 60_000,
        subtotalCents: 3500, tipCents: 0, cardFeeCents: 0,
      },
    ],
    problems: [],
    nextNumber: 104,
  };
}

function useStoreState() {
  const [s, setS] = useState<State | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setS(raw ? (JSON.parse(raw) as State) : seed());
    } catch {
      setS(seed());
    }
  }, []);

  useEffect(() => {
    if (!s) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  }, [s]);

  const up = useCallback((fn: (s: State) => State) => setS((p) => (p ? fn(p) : p)), []);

  const actions = {
    setLang: (lang: Lang) => up((s) => ({ ...s, lang })),
    reset: () => setS(seed()),

    clockIn: (staffId: string) =>
      up((s) => ({ ...s, clock: [...s.clock, { staffId, inAt: Date.now() }] })),
    clockOut: (staffId: string) =>
      up((s) => ({
        ...s,
        clock: s.clock.map((c) => (c.staffId === staffId && !c.outAt ? { ...c, outAt: Date.now() } : c)),
      })),

    upsertClient: (c: Client) =>
      up((s) => ({
        ...s,
        clients: s.clients.some((x) => x.phone === c.phone)
          ? s.clients.map((x) => (x.phone === c.phone ? { ...x, ...c } : x))
          : [...s.clients, c],
      })),

    checkIn: (w: Omit<WaitingClient, "id" | "at">) =>
      up((s) => ({ ...s, waiting: [...s.waiting, { ...w, id: uid(), at: Date.now() }] })),

    removeWaiting: (id: string) => up((s) => ({ ...s, waiting: s.waiting.filter((w) => w.id !== id) })),

    assign: (waitingId: string, techId: string) =>
      up((s) => {
        const w = s.waiting.find((x) => x.id === waitingId);
        if (!w) return s;
        const t: Ticket = {
          id: uid(), number: s.nextNumber, phone: w.phone, techId, serviceIds: w.serviceIds,
          status: "assigned", createdAt: Date.now(), subtotalCents: sumServices(w.serviceIds),
          tipCents: 0, cardFeeCents: 0,
        };
        return { ...s, waiting: s.waiting.filter((x) => x.id !== waitingId), tickets: [...s.tickets, t], nextNumber: s.nextNumber + 1 };
      }),

    start: (id: string) => patchTicket(id, { status: "in_service", startedAt: Date.now() }),
    finish: (id: string) => patchTicket(id, { status: "ready", doneAt: Date.now() }),
    setServices: (id: string, serviceIds: string[]) =>
      patchTicket(id, { serviceIds, subtotalCents: sumServices(serviceIds) }),

    pay: (id: string, p: { tipCents: number; tipMethod: "card" | "cash"; payMethod: "card" | "cash" | "link"; receipt: Ticket["receipt"] }) =>
      up((s) => {
        const t = s.tickets.find((x) => x.id === id);
        if (!t) return s;
        const charged = (p.payMethod === "cash" ? 0 : t.subtotalCents) + (p.tipMethod === "card" ? p.tipCents : 0);
        const fee = charged > 0 ? cardFee(charged) : 0;
        const today = new Date().toISOString().slice(0, 10);
        return {
          ...s,
          tickets: s.tickets.map((x) => (x.id === id ? { ...x, ...p, status: "paid", paidAt: Date.now(), cardFeeCents: fee } : x)),
          clients: s.clients.map((c) =>
            c.phone === t.phone ? { ...c, visits: c.visits + 1, lastVisit: today, lastServiceId: t.serviceIds[0], lastTechId: t.techId } : c,
          ),
        };
      }),

    reportProblem: (staffId: string, note: string) =>
      up((s) => ({ ...s, problems: [...s.problems, { staffId, at: Date.now(), note }] })),
  };

  function patchTicket(id: string, patch: Partial<Ticket>) {
    up((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }

  return { s, actions };
}

type Ctx = ReturnType<typeof useStoreState> & { s: State };
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const v = useStoreState();
  if (!v.s) return <div className="p-8 text-lg text-stone-500">…</div>;
  return <StoreCtx.Provider value={v as Ctx}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error("useStore outside StoreProvider");
  const t = (k: Key) => translate(v.s.lang, k);
  return { ...v, t };
}

// ---- derived facts (insight, not autopilot) ----

export const isClockedIn = (s: State, staffId: string) =>
  s.clock.some((c) => c.staffId === staffId && !c.outAt);

export const clockedInAt = (s: State, staffId: string) =>
  s.clock.find((c) => c.staffId === staffId && !c.outAt)?.inAt;

export const ticketsFor = (s: State, techId: string) => s.tickets.filter((t) => t.techId === techId);

export const activeTicket = (s: State, techId: string) =>
  s.tickets.find((t) => t.techId === techId && (t.status === "assigned" || t.status === "in_service"));

export const clientByPhone = (s: State, phone: string) => s.clients.find((c) => c.phone === phone);
