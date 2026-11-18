// Offline-first save queue ("outbox"). Every write goes here first, then a sync loop sends it.
// - Saved on the device (IndexedDB via Dexie), so a reload or no internet loses nothing.
// - Sent in order, one at a time. Each action carries a clientId so the server can apply it once.
// - A handler per action kind does the real send (Supabase, API route). Handlers throw to retry later.
// - An item the server keeps refusing (not a network problem) is set aside ("parked") after a few tries, so one bad
//   item never blocks everything after it. Parked items stay on the device, are counted in the sync state,
//   and get one more try each time the app starts.
import Dexie, { type Table } from "dexie";

export type OutboxItem = {
  seq?: number;
  clientId: string;
  kind: string;
  payload: unknown;
  deviceTime: string;
  tries: number;
  lastError?: string;
};

export type Handler = (item: OutboxItem) => Promise<void>;
export type SyncState = { pending: number; parked: number; online: boolean; syncing: boolean; lastSyncedAt?: string; lastError?: string };

/** Server said no this many times (online, not a network error) → park it. */
export const MAX_REFUSALS = 3;
const NETWORK = /fetch|network|timeout|timed out|load failed|offline|abort|ECONN|50[234]|gateway|unavailable/i;
export const isNetworkError = (msg: string) => NETWORK.test(msg);

class OutboxDB extends Dexie {
  outbox!: Table<OutboxItem, number>;
  parked!: Table<OutboxItem, number>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ outbox: "++seq, &clientId, kind" });
    this.version(2).stores({ outbox: "++seq, &clientId, kind", parked: "++seq, &clientId, kind" });
  }
}

const handlers = new Map<string, Handler>();
const listeners = new Set<(s: SyncState) => void>();
let db: OutboxDB | null = null;
let state: SyncState = { pending: 0, parked: 0, online: true, syncing: false };
let running: Promise<void> | null = null;

function getDb() {
  db ??= new OutboxDB("nailpos-outbox");
  return db;
}

function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function registerHandler(kind: string, fn: Handler) {
  handlers.set(kind, fn);
}

export function subscribe(fn: (s: SyncState) => void) {
  listeners.add(fn);
  fn(state);
  return () => void listeners.delete(fn);
}

export const getState = () => state;

async function refreshCount() {
  const d = getDb();
  emit({ pending: await d.outbox.count(), parked: await d.parked.count() });
}

/** Put parked items back at the end of the queue for another try. */
export async function retryParked() {
  const d = getDb();
  await d.transaction("rw", d.outbox, d.parked, async () => {
    for (const it of await d.parked.orderBy("seq").toArray()) {
      await d.parked.delete(it.seq!);
      const { seq: _drop, ...rest } = it;
      void _drop;
      if (!(await d.outbox.where("clientId").equals(it.clientId).count())) await d.outbox.add({ ...rest, tries: 0 });
    }
  });
  await refreshCount();
}

/** Forget saves of one kind that are waiting or parked (e.g. a setup save aimed at a salon this person can't change).
 *  Only for kinds where a newer full copy replaces the old one; never for tickets or payments. */
export async function dropQueued(kind: string) {
  const d = getDb();
  await d.transaction("rw", d.outbox, d.parked, async () => {
    await d.outbox.where("kind").equals(kind).delete();
    await d.parked.where("kind").equals(kind).delete();
  });
  await refreshCount();
}

/** Save an action on this device and try to send it now. Returns its clientId. */
export async function enqueue(kind: string, payload: unknown, clientId = uuid()): Promise<string> {
  await getDb().outbox.add({ clientId, kind, payload, deviceTime: new Date().toISOString(), tries: 0 });
  await refreshCount();
  void syncNow();
  return clientId;
}

/** Send everything waiting, oldest first. Stops at the first failure and keeps it for next time. */
export function syncNow(): Promise<void> {
  // A sync is already running: run once more after it, so a request made now (e.g. just back online) is never skipped.
  if (running) return running.then(() => syncNow());
  const p = runOnce();
  running = p;
  void p.finally(() => { if (running === p) running = null; });
  return p;
}

async function runOnce(): Promise<void> {
  {
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    emit({ online });
    if (!online) return;
    const d = getDb();
    emit({ syncing: true });
    try {
      // Items whose sender isn't loaded on this screen (e.g. a booking save while on Checkout) wait for a later run;
      // they must not hold back the tickets and payments behind them.
      const later = new Set<number>();
      for (;;) {
        const item = await d.outbox.orderBy("seq").filter((i) => !later.has(i.seq!)).first();
        if (!item) break;
        const handler = handlers.get(item.kind);
        if (!handler) {
          later.add(item.seq!);
          if (item.lastError !== `no handler for ${item.kind}`) await d.outbox.update(item.seq!, { lastError: `no handler for ${item.kind}` });
          continue;
        }
        try {
          await handler(item);
          await d.outbox.delete(item.seq!);
          emit({ lastSyncedAt: new Date().toISOString(), lastError: undefined });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const stillOnline = typeof navigator === "undefined" ? true : navigator.onLine;
          if (stillOnline && !isNetworkError(msg) && item.tries + 1 >= MAX_REFUSALS) {
            // The server keeps saying no: keep it safe on the device and move on to the next item.
            const { seq: _drop, ...rest } = item;
            void _drop;
            await d.transaction("rw", d.outbox, d.parked, async () => {
              await d.parked.add({ ...rest, tries: item.tries + 1, lastError: msg });
              await d.outbox.delete(item.seq!);
            });
            emit({ lastError: msg });
            continue;
          }
          await d.outbox.update(item.seq!, { tries: item.tries + 1, lastError: msg });
          emit({ lastError: msg });
          break;
        }
      }
    } finally {
      await refreshCount();
      emit({ syncing: false });
    }
  }
}

let started = false;
/** Call once in the browser: syncs on start, when the network comes back, and every 30 s. */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  const kick = () => void syncNow();
  window.addEventListener("online", () => { emit({ online: true }); kick(); });
  window.addEventListener("offline", () => emit({ online: false }));
  setInterval(kick, 30_000);
  void retryParked().then(kick);
}

/** Tests only: fresh database + state. */
export async function _resetForTests(name = `nailpos-test-${uuid()}`) {
  db = new OutboxDB(name);
  handlers.clear();
  running = null;
  state = { pending: 0, parked: 0, online: true, syncing: false };
}
