"use client";
// Print to a Bluetooth thermal printer straight from the browser (Web Bluetooth).
// Works in Chrome on Android (tablets, phones) and in the Bluefy browser on iPhone/iPad. Desktop uses normal printing.
import type { Paper } from "./escpos";

// ESC/POS printer channels (service → write pipe), same list + pacing that worked with the NETUM in the
// earlier Nail Tech Log app: 100-byte pieces, 25 ms apart, then 250 ms to let the printer finish.
const PROFILES = [
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", write: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", write: "0000ffe1-0000-1000-8000-00805f9b34fb" },
  { service: "0000ff00-0000-1000-8000-00805f9b34fb", write: "0000ff02-0000-1000-8000-00805f9b34fb" },
  { service: "000018f0-0000-1000-8000-00805f9b34fb", write: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2", write: "bef8d6c9-9c21-4c9e-b632-bd581100031c" },
  { service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e", write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e" },
];
const SERVICES = PROFILES.map((p) => p.service);
const NAME_PREFIXES = ["BlueTooth Printer", "Bluetooth Printer", "NETUM", "MTP", "PT-", "Printer"];
const CHUNK = 100, CHUNK_DELAY = 25, FINISH_WAIT = 250;

type Char = { uuid?: string; properties: { write: boolean; writeWithoutResponse: boolean }; writeValueWithResponse(b: BufferSource): Promise<void>; writeValueWithoutResponse(b: BufferSource): Promise<void> };
type Dev = { id: string; name?: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristics(): Promise<Char[]> }> }> } };
type BT = { requestDevice(o: unknown): Promise<Dev>; getDevices?(): Promise<Dev[]> };

const bt = (): BT | null => (typeof navigator !== "undefined" && "bluetooth" in navigator ? (navigator as unknown as { bluetooth: BT }).bluetooth : null);
/** This device can print receipts itself: Web Bluetooth, or our Android app with the terminal's own printer. */
export const canBluetooth = () => !!bt() || inApp();
export const isIOS = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

// ── Our own Android app (handheld terminal with a printer inside) ───────────────────────────────────────────────
// The PolishOS app (android/ps10) shows this web app in its own window and offers `window.PolishOSApp` to pages from
// polishosapp.com. A print = {"id","print": base64 ESC/POS} → the app writes it to the terminal's InnerPrinter and
// answers {"id","ok":true} or {"id","error":"…"}. Nothing to pick: inside the app this is always the printer.
type AppBridge = { postMessage(s: string): void; onmessage: ((e: { data: string }) => void) | null };
const appBridge = (): AppBridge | null => (typeof window !== "undefined" ? (window as unknown as { PolishOSApp?: AppBridge }).PolishOSApp ?? null : null);
/** Running inside the PolishOS Android app. */
export const inApp = () => !!appBridge();
const waiting = new Map<string, (error?: string) => void>();
function appPrint(bytes: Uint8Array): Promise<void> {
  const app = appBridge()!;
  app.onmessage = (e) => {
    try { const m = JSON.parse(e.data) as { id?: string; error?: string }; const done = m.id ? waiting.get(m.id) : undefined; if (done) { waiting.delete(m.id!); done(m.error); } } catch { /* not ours */ }
  };
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error("The printer didn't answer. Try again.")); }, 30000);
    waiting.set(id, (error) => { clearTimeout(timer); if (error) reject(new Error(error)); else resolve(); });
    app.postMessage(JSON.stringify({ id, print: btoa(bin) }));
  });
}

const KEY = "nailpos.printer";
// via "serial" = a terminal's built-in printer (old-style Bluetooth serial, e.g. "InnerPrinter"), reached through Web Serial.
export type SavedPrinter = { id: string; name: string; paper: Paper; via?: "serial" | "rawbt" | "app" };
export function savedPrinter(): SavedPrinter | null {
  let p: SavedPrinter | null = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* */ }
  // Inside our app the terminal's printer is the printer; only the paper width is remembered.
  if (inApp()) return { id: "app", name: "Built-in printer", paper: p?.via === "app" ? p.paper : 58, via: "app" };
  return p?.via === "app" ? null : p;
}
export function savePrinter(p: SavedPrinter | null) {
  try { if (p) localStorage.setItem(KEY, JSON.stringify(p)); else localStorage.removeItem(KEY); } catch { /* */ }
}

let dev: Dev | null = null;
let pipe: Char | null = null;

async function findPipe(d: Dev): Promise<Char> {
  const server = await d.gatt!.connect();
  for (const p of PROFILES) {
    try {
      const chars = await (await server.getPrimaryService(p.service)).getCharacteristics();
      const ok = (c: Char) => c.properties.writeWithoutResponse || c.properties.write;
      const pick = chars.find((c) => c.uuid?.toLowerCase() === p.write && ok(c)) ?? chars.find(ok);
      if (pick) return pick;
    } catch { /* a printer has only one of these channels */ }
  }
  throw new Error("This printer doesn't take prints over Bluetooth Low Energy.");
}

/** Pick the printer (shows the browser's list). Must be called from a tap. */
export async function pickPrinter(paper: Paper, all = false): Promise<SavedPrinter> {
  const b = bt();
  if (!b) throw new Error(isIOS() ? "On iPhone or iPad, open PolishOS in the Bluefy browser to print by Bluetooth." : "This browser can't use Bluetooth. Use Chrome.");
  // Show printers first; `all` = every Bluetooth device nearby (for a printer with an unusual name).
  const everything = () => b.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
  dev = all ? await everything() : await b.requestDevice({ filters: [...SERVICES.map((sv) => ({ services: [sv] })), ...NAME_PREFIXES.map((namePrefix) => ({ namePrefix }))], optionalServices: SERVICES })
    .catch((e: Error) => { if (/cancel/i.test(e.message)) throw e; return everything(); });
  pipe = await findPipe(dev);
  const p = { id: dev.id, name: dev.name || "Bluetooth printer", paper };
  savePrinter(p);
  return p;
}

/** Reconnect to the saved printer without asking again (when the browser allows it). */
async function reconnect(): Promise<boolean> {
  if (dev?.gatt?.connected && pipe) return true;
  const b = bt(), s = savedPrinter();
  if (!b || !s) return false;
  if (!dev && b.getDevices) dev = (await b.getDevices()).find((d) => d.id === s.id) ?? null;
  if (!dev) return false;
  pipe = await findPipe(dev);
  return true;
}

// ── Built-in printer of a handheld terminal ─────────────────────────────────────────────────────────────────────
// These show up in Android as a paired old-style Bluetooth printer ("InnerPrinter", 00:11:22:33:44:55). Web Bluetooth
// can't talk to those; Chrome's Web Serial can (Bluetooth serial port, SPP).
const SPP = "00001101-0000-1000-8000-00805f9b34fb";
type Port = { open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; writable: WritableStream<Uint8Array> | null };
type Serial = { requestPort(o?: unknown): Promise<Port>; getPorts(): Promise<Port[]> };
const serial = (): Serial | null => (typeof navigator !== "undefined" && "serial" in navigator ? (navigator as unknown as { serial: Serial }).serial : null);
/** Only offered on Android: on a computer the serial list is cables, not printers. Shown even when this browser
 * has no Web Serial, so the tap can say "update Chrome" instead of the button just missing. */
// Chrome's "Desktop site" mode hides "Android" (says Linux), so a Linux touch screen counts too.
export const canBuiltIn = () => typeof navigator !== "undefined" && (/Android/i.test(navigator.userAgent) || (/Linux/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0));

let port: Port | null = null;

/** Pick the terminal's own printer (shows the browser's list). Must be called from a tap. */
export async function pickBuiltIn(paper: Paper): Promise<SavedPrinter> {
  const sr = serial();
  if (!sr) throw new Error(`This browser can't reach a built-in printer. Open PolishOS in Google Chrome and update it in the Play Store (now: ${navigator.userAgent.match(/Chrome\/\d+/)?.[0] ?? "not Chrome"}).`);
  // No filter: the inner printer is a pretend Bluetooth device and may not say which services it has, so a
  // "serial printers only" filter hides it ("No compatible devices found").
  port = await sr.requestPort({ allowedBluetoothServiceClassIds: [SPP] });
  const p: SavedPrinter = { id: "serial", name: "Built-in printer", paper, via: "serial" };
  savePrinter(p);
  return p;
}

async function serialPrint(bytes: Uint8Array, paper: Paper): Promise<void> {
  const sr = serial();
  if (!port && sr) port = (await sr.getPorts())[0] ?? null;
  if (!port) await pickBuiltIn(paper);
  const pt = port!;
  try {
    if (!pt.writable) await pt.open({ baudRate: 9600 });
    const w = pt.writable!.getWriter();
    try { for (let i = 0; i < bytes.length; i += 512) await w.write(bytes.slice(i, i + 512)); }
    finally { w.releaseLock(); }
    await new Promise((r) => setTimeout(r, FINISH_WAIT));
  } catch (e) {
    await pt.close().catch(() => {});
    port = null;
    throw e;
  }
}

// ── RawBT helper app ─────────────────────────────────────────────────────────────────────────────────────────────
// When Chrome can't see the built-in printer at all: the free RawBT app (Play Store) is a print driver that can.
// The printer is picked once inside RawBT; we hand it the same bytes through an Android link.
/** Use the RawBT app on this device as the printer. */
export function pickRawbt(paper: Paper): SavedPrinter {
  const p: SavedPrinter = { id: "rawbt", name: "RawBT app", paper, via: "rawbt" };
  savePrinter(p);
  return p;
}
function rawbtPrint(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  // Opens RawBT (or its Play Store page when it isn't installed).
  window.location.href = `intent:base64,${btoa(bin)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

/** Send receipt bytes in small pieces (Bluetooth sends ~100 bytes at a time). */
export async function printBytes(bytes: Uint8Array, paper: Paper): Promise<void> {
  if (inApp()) return appPrint(bytes);
  const via = savedPrinter()?.via;
  if (via === "rawbt") return rawbtPrint(bytes);
  if (via === "serial") return serialPrint(bytes, paper);
  if (!(await reconnect().catch(() => false))) await pickPrinter(paper);
  const c = pipe!;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.slice(i, i + CHUNK);
    if (c.properties.writeWithoutResponse) await c.writeValueWithoutResponse(part);
    else await c.writeValueWithResponse(part);
    await wait(CHUNK_DELAY);
  }
  await wait(FINISH_WAIT);
}
