// Offline-first save queue ("outbox"). Every write goes here first, then a sync loop sends it.
// - Saved on the device (IndexedDB via Dexie), so a reload or no internet loses nothing.
// - Sent in order, one at a time. Each action carries a clientId so the server can apply it once.
// - A handler per action kind does the real send (Supabase, API route). Handlers throw to retry later.
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
export type SyncState = { pending: number; online: boolean; syncing: boolean; lastSyncedAt?: string; lastError?: string };

class OutboxDB extends Dexie {
  outbox!: Table<OutboxItem, number>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ outbox: "++seq, &clientId, kind" });
  }
}

const handlers = new Map<string, Handler>();
const listeners = new Set<(s: SyncState) => void>();
let db: OutboxDB | null = null;
let state: SyncState = { pending: 0, online: true, syncing: false };
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
  emit({ pending: await getDb().outbox.count() });
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
      for (;;) {
        const item = await d.outbox.orderBy("seq").first();
        if (!item) break;
        const handler = handlers.get(item.kind);
        if (!handler) {
          await d.outbox.update(item.seq!, { tries: item.tries + 1, lastError: `no handler for ${item.kind}` });
          emit({ lastError: `no handler for ${item.kind}` });
          break;
        }
        try {
          await handler(item);
          await d.outbox.delete(item.seq!);
          emit({ lastSyncedAt: new Date().toISOString(), lastError: undefined });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
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
  void refreshCount().then(kick);
}

/** Tests only: fresh database + state. */
export async function _resetForTests(name = `nailpos-test-${uuid()}`) {
  db = new OutboxDB(name);
  handlers.clear();
  running = null;
  state = { pending: 0, online: true, syncing: false };
}
