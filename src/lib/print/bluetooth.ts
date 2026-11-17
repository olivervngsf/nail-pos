"use client";
// Print to a Bluetooth thermal printer straight from the browser (Web Bluetooth).
// Works in Chrome on Android (tablets, phones) and in the Bluefy browser on iPhone/iPad. Desktop uses normal printing.
import type { Paper } from "./escpos";

// Services cheap thermal printers use for their "write" pipe (NETUM, Xprinter, Goojprt, MTP, PT-210…).
const SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

type Char = { properties: { write: boolean; writeWithoutResponse: boolean }; writeValueWithResponse(b: BufferSource): Promise<void>; writeValueWithoutResponse(b: BufferSource): Promise<void> };
type Dev = { id: string; name?: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryServices(): Promise<{ getCharacteristics(): Promise<Char[]> }[]> }> } };
type BT = { requestDevice(o: unknown): Promise<Dev>; getDevices?(): Promise<Dev[]> };

const bt = (): BT | null => (typeof navigator !== "undefined" && "bluetooth" in navigator ? (navigator as unknown as { bluetooth: BT }).bluetooth : null);
export const canBluetooth = () => !!bt();
export const isIOS = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

const KEY = "nailpos.printer";
export type SavedPrinter = { id: string; name: string; paper: Paper };
export function savedPrinter(): SavedPrinter | null {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function savePrinter(p: SavedPrinter | null) {
  try { if (p) localStorage.setItem(KEY, JSON.stringify(p)); else localStorage.removeItem(KEY); } catch { /* */ }
}

let dev: Dev | null = null;
let pipe: Char | null = null;

async function findPipe(d: Dev): Promise<Char> {
  const server = await d.gatt!.connect();
  for (const s of await server.getPrimaryServices()) {
    for (const c of await s.getCharacteristics()) {
      if (c.properties.writeWithoutResponse || c.properties.write) return c;
    }
  }
  throw new Error("This printer doesn't take prints over Bluetooth Low Energy.");
}

/** Pick the printer (shows the browser's list). Must be called from a tap. */
export async function pickPrinter(paper: Paper): Promise<SavedPrinter> {
  const b = bt();
  if (!b) throw new Error(isIOS() ? "On iPhone or iPad, open PolishOS in the Bluefy browser to print by Bluetooth." : "This browser can't use Bluetooth. Use Chrome.");
  dev = await b.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
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

/** Send receipt bytes in small pieces (Bluetooth sends ~100 bytes at a time). */
export async function printBytes(bytes: Uint8Array, paper: Paper): Promise<void> {
  if (!(await reconnect().catch(() => false))) await pickPrinter(paper);
  const c = pipe!;
  for (let i = 0; i < bytes.length; i += 100) {
    const part = bytes.slice(i, i + 100);
    if (c.properties.writeWithoutResponse) { await c.writeValueWithoutResponse(part); await new Promise((r) => setTimeout(r, 20)); }
    else await c.writeValueWithResponse(part);
  }
}
