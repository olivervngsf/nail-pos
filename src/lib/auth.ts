"use client";
// Sign in by phone + text code (Supabase phone auth via Twilio Verify), and who-am-I helpers.
import { getSupabase } from "@/lib/supabase/client";

/** Real text codes on (NEXT_PUBLIC_SMS_LOGIN=on). Off = test version: any 6 digits, nothing saved to the server. */
export const SMS_ON = process.env.NEXT_PUBLIC_SMS_LOGIN === "on";

/** "(408) 555-0110" → "+14085550110" */
export const e164 = (phone: string) => "+1" + phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export type Role = "owner" | "manager" | "front_desk" | "tech";
export type Membership = {
  membership_id: string;
  salon_id: string;
  salon_name: string;
  role: Role;
  display_name: string;
  setup_step: number;
  has_pin: boolean;
  language: "en" | "vi";
};

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", front_desk: "Front desk", tech: "Tech" };

function sb() {
  const c = getSupabase();
  if (!c) throw new Error("Can't reach our server. Check internet and try again.");
  return c;
}

export async function sendCode(phone: string): Promise<string | null> {
  if (!SMS_ON) return null;
  try {
    const { error } = await sb().auth.signInWithOtp({ phone: e164(phone) });
    return error ? "Couldn't send the text. Check the number and try again." : null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Verify the code, then link any memberships waiting for this phone (invites, test accounts). */
export async function verifyCode(phone: string, code: string): Promise<string | null> {
  if (!SMS_ON) return null;
  try {
    const { error } = await sb().auth.verifyOtp({ phone: e164(phone), token: code, type: "sms" });
    if (error) return "That code didn't work. Check the text and try again.";
    await sb().rpc("claim_memberships");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export async function isSignedIn(): Promise<boolean> {
  if (!SMS_ON) return false;
  const c = getSupabase();
  if (!c) return false;
  const { data } = await c.auth.getSession();
  return !!data.session;
}

export async function myMemberships(): Promise<Membership[]> {
  const { data, error } = await sb().rpc("my_memberships");
  if (error) throw new Error(error.message);
  return (data ?? []) as Membership[];
}

/** Where to go after sign-in: owner with unfinished setup → /setup, desk roles → /today, tech → /t, nobody yet → /setup. */
export function homeFor(ms: Membership[]): string {
  if (!ms.length) return "/setup";
  const m = ms[0];
  if (m.role === "owner" && m.setup_step < 9) return "/setup";
  return m.role === "tech" ? "/t" : "/today";
}

export async function signOut() {
  const c = getSupabase();
  await c?.auth.signOut();
  try {
    localStorage.removeItem("nailpos.acting");
  } catch {
    /* ignore */
  }
}

export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ---------- salon device (owner signs this device in once) ---------- */
export type Device = { id: string; salonId: string; name: string };
const DEVICE_KEY = "nailpos.device";
export function getDevice(): Device | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? (JSON.parse(raw) as Device) : null;
  } catch {
    return null;
  }
}
export async function makeSalonDevice(salonId: string, name: string): Promise<Device> {
  const id = await rpc<string>("register_device", { p_salon: salonId, p_name: name, p_kind: "front_desk" });
  const d = { id, salonId, name };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
  return d;
}
export function forgetDevice() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* ignore */
  }
}

export type PinResult = { ok: boolean; reason?: "wrong" | "locked" | "no_pin" | "device" | "person"; tries_left?: number; until?: string; membership_id?: string; name?: string; role?: Role };
export const pinMessage = (r: PinResult) =>
  r.reason === "wrong" ? `Wrong PIN. ${r.tries_left} ${r.tries_left === 1 ? "try" : "tries"} left.`
  : r.reason === "locked" ? `Locked for 5 minutes after 5 wrong PINs. Ask the owner to reset it.`
  : r.reason === "no_pin" ? "No PIN yet. Join from the invite text to make one."
  : r.reason === "device" ? "This device isn't a salon device for this salon."
  : "Can't check that PIN.";
