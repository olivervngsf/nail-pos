"use client";
// Sign in by phone + text code (Supabase phone auth via Twilio Verify) or by email code (an email added to the same account), and who-am-I helpers.
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

/* ---------- email sign-in (same account: add an email once while signed in by phone, then sign in with it) ---------- */
export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** Email a 6-digit code. Only for accounts that already added this email (no new accounts by email). */
export async function sendEmailCode(email: string): Promise<string | null> {
  if (!SMS_ON) return null;
  try {
    const { error } = await sb().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } });
    if (!error) return null;
    if (/signup|not allowed|not found/i.test(error.message)) return "No account uses this email yet. Sign in with your phone once, then add your email in the menu at the top right (your name → Add sign-in email).";
    if (/rate|too many|seconds/i.test(error.message)) return "Too many codes asked for. Wait a minute and try again.";
    return "Couldn't send the email. Check the address and try again.";
  } catch (e) {
    return (e as Error).message;
  }
}

export async function verifyEmailCode(email: string, code: string): Promise<string | null> {
  if (!SMS_ON) return null;
  try {
    const { error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: "email" });
    if (error) return "That code didn't work. Check the email and try again.";
    await sb().rpc("claim_memberships");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** The sign-in email on this account (null = none yet). */
export async function myEmail(): Promise<string | null> {
  if (!SMS_ON) { try { return localStorage.getItem("nailpos.demoEmail"); } catch { return null; } }
  const { data } = await sb().auth.getUser();
  return data.user?.email || null;
}

/** Step 1 of adding an email: we email a code to the new address. */
export async function startAddEmail(email: string): Promise<string | null> {
  if (!SMS_ON) return null;
  try {
    const { error } = await sb().auth.updateUser({ email: email.trim().toLowerCase() });
    if (!error) return null;
    if (/already|registered|exists/i.test(error.message)) return "That email is already used by another account.";
    if (/rate|too many|seconds/i.test(error.message)) return "Too many codes asked for. Wait a minute and try again.";
    return "Couldn't send the email. Check the address and try again.";
  } catch (e) {
    return (e as Error).message;
  }
}

/** Step 2: the code from that email confirms it. Then the email is also saved on your person record. */
export async function confirmAddEmail(email: string, code: string): Promise<string | null> {
  if (!SMS_ON) { try { localStorage.setItem("nailpos.demoEmail", email.trim().toLowerCase()); } catch { /* */ } return null; }
  try {
    const { error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: "email_change" });
    if (error) return "That code didn't work. Check the email and try again.";
    await sb().rpc("sync_my_email");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/* ---------- password (optional, set from the menu; sign in with phone or email + password) ---------- */
export const PASSWORD_MIN = 8;
/** "name@x.com" → email; anything else → US phone. */
const loginId = (id: string) => (id.includes("@") ? { email: id.trim().toLowerCase() } : { phone: e164(id) });
export const loginIdOk = (id: string) => (id.includes("@") ? emailOk(id) : id.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "").length === 10);

/** Which sign-in way this device used last, so /login opens on it. */
export type LoginWay = "phone" | "email" | "password";
export function lastLoginWay(): LoginWay {
  try { const v = localStorage.getItem("nailpos.loginWay"); return v === "email" || v === "password" ? v : "phone"; } catch { return "phone"; }
}
export function rememberLoginWay(w: LoginWay) {
  try { localStorage.setItem("nailpos.loginWay", w); } catch { /* ignore */ }
}

export async function signInWithPassword(id: string, password: string): Promise<string | null> {
  if (!SMS_ON) return null;
  try {
    const l = loginId(id);
    const { error } = await sb().auth.signInWithPassword("email" in l ? { email: l.email!, password } : { phone: l.phone!, password });
    if (!error) { await sb().rpc("claim_memberships"); return null; }
    if (/invalid|credentials/i.test(error.message)) return "Wrong login or password. No password yet? Sign in with a code, then set one in your menu (top right).";
    if (/rate|too many/i.test(error.message)) return "Too many tries. Wait a minute and try again.";
    return "Couldn't sign in. Check internet and try again.";
  } catch (e) {
    return (e as Error).message;
  }
}

/** Forgot password, step 1: code by text or email to an existing account (no new accounts here). */
export async function sendResetCode(id: string): Promise<string | null> {
  if (!SMS_ON) return null;
  try {
    const l = loginId(id), options = { shouldCreateUser: false };
    const { error } = await sb().auth.signInWithOtp("email" in l ? { email: l.email!, options } : { phone: l.phone!, options });
    if (!error) return null;
    if (/signup|not allowed|not found/i.test(error.message)) return "No account uses this. Check it, or sign in with your phone number.";
    if (/rate|too many|seconds/i.test(error.message)) return "Too many codes asked for. Wait a minute and try again.";
    return "Couldn't send the code. Check it and try again.";
  } catch (e) {
    return (e as Error).message;
  }
}

/** Forgot password, step 2: the code signs you in (then step 3 = setPassword). */
export async function verifyResetCode(id: string, code: string): Promise<string | null> {
  if (!SMS_ON) return null;
  try {
    const l = loginId(id);
    const { error } = await sb().auth.verifyOtp("email" in l ? { email: l.email!, token: code, type: "email" } : { phone: l.phone!, token: code, type: "sms" });
    if (error) return "That code didn't work. Check it and try again.";
    await sb().rpc("claim_memberships");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Set or change the password on the signed-in account. */
export async function setPassword(password: string): Promise<string | null> {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} letters or numbers.`;
  if (!SMS_ON) { try { localStorage.setItem("nailpos.demoPassword", "1"); } catch { /* */ } return null; }
  try {
    const { error } = await sb().auth.updateUser({ password, data: { has_password: true } });
    if (!error) return null;
    if (/same|different/i.test(error.message)) return "That's your current password. Pick a new one.";
    if (/weak|short|characters/i.test(error.message)) return "Too easy to guess. Use a longer password.";
    if (/reauth/i.test(error.message)) return "For safety, sign out and sign in again with a code, then set it.";
    return "Couldn't save the password. Check internet and try again.";
  } catch (e) {
    return (e as Error).message;
  }
}

/** Has this account set a password? (Supabase doesn't say directly; we remember it on the person's auth metadata.) */
export async function hasPassword(): Promise<boolean> {
  if (!SMS_ON) { try { return !!localStorage.getItem("nailpos.demoPassword"); } catch { return false; } }
  const { data } = await sb().auth.getUser();
  return !!data.user?.user_metadata?.has_password;
}

/* ---------- Google (turned on with NEXT_PUBLIC_GOOGLE_LOGIN=on once the Google provider is set up in Supabase) ---------- */
export const GOOGLE_ON = SMS_ON && process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "on";

/** Leaves the page for Google, comes back to /login, which finishes sign-in. */
export async function signInWithGoogle(): Promise<string | null> {
  try {
    // Keep ?next= and ?invite= through the trip to Google and back.
    const q = new URLSearchParams(location.search), keep = new URLSearchParams({ google: "1" });
    for (const k of ["next", "invite"]) { const v = q.get(k); if (v) keep.set(k, v); }
    const back = `${location.origin}/login?${keep}`;
    const { error } = await sb().auth.signInWithOAuth({ provider: "google", options: { redirectTo: back } });
    return error ? "Google sign-in isn't ready yet. Use your phone number." : null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Menu: connect Google to the signed-in account (Supabase "manual linking" must be on). */
export async function connectGoogle(): Promise<string | null> {
  try {
    const { error } = await sb().auth.linkIdentity({ provider: "google", options: { redirectTo: location.href } });
    if (!error) return null;
    if (/already/i.test(error.message)) return "That Google account is already used by another login.";
    return "Couldn't connect Google. Try again later.";
  } catch (e) {
    return (e as Error).message;
  }
}

export async function googleEmail(): Promise<string | null> {
  if (!GOOGLE_ON) return null;
  const { data } = await sb().auth.getUserIdentities();
  const g = data?.identities.find((i) => i.provider === "google");
  return g ? String(g.identity_data?.email ?? "Google") : null;
}

/* ---------- invites (salons are made by PolishOS; owner + staff join with a link or code) ---------- */
/** "abcd-2345 " → "ABCD2345" */
export const cleanCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const showCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
export type InviteInfo = { salon_name: string; display_name: string; role: Role; owner_name: string | null; phone_last4: string; status: "open" | "used" | "expired" };

export async function getInvite(code: string): Promise<InviteInfo | null> {
  const { data, error } = await sb().rpc("get_invite", { p_code: cleanCode(code) });
  if (error) throw new Error("Can't check the code. Check internet and try again.");
  return ((data ?? []) as InviteInfo[])[0] ?? null;
}

/** Attach the invite to whoever is signed in. Returns an error in plain words, or null. */
export async function redeemInvite(code: string): Promise<string | null> {
  if (!SMS_ON) return null;
  const { error } = await sb().rpc("redeem_invite", { p_code: cleanCode(code) });
  if (!error) return null;
  const m = error.message;
  if (/not found/.test(m)) return "We can't find that code. Check the letters and numbers.";
  if (/used/.test(m)) return "This invite was already used. Ask for a new one.";
  if (/expired/.test(m)) return "This invite ran out (7 days). Ask for a new one.";
  if (/already in salon/.test(m)) return "You're already in this salon.";
  if (/phone has a login/.test(m)) return "That phone number already has a login. Sign in with it instead.";
  return "Couldn't join. Check internet and try again.";
}

export async function isPlatformAdmin(): Promise<boolean> {
  if (!SMS_ON) return false;
  const { data } = await sb().rpc("is_platform_admin");
  return data === true;
}

/** Links invites waiting for this phone or verified email (e.g. right after Google). Never throws. */
export async function claimMine() {
  if (SMS_ON) await getSupabase()?.rpc("claim_memberships").then(() => {}, () => {});
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

/** Where to go after sign-in: owner with unfinished setup → /setup, desk roles → /today, tech → /t,
 *  no salon yet → /invite (type your invite code; salons are made by PolishOS). Test copy: /setup. */
export function homeFor(ms: Membership[]): string {
  if (!ms.length) return SMS_ON ? "/invite" : "/setup";
  const m = ms[0];
  if (m.role === "owner" && m.setup_step < 9) return "/setup";
  return m.role === "tech" ? "/t" : "/today";
}

export async function signOut() {
  const c = getSupabase();
  // "local" = only this device. The default ("global") signed you out on every phone + computer at once.
  await c?.auth.signOut({ scope: "local" });
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

export type PinResult = { ok: boolean; reason?: "wrong" | "locked" | "no_pin" | "device" | "person" | "weak"; tries_left?: number; until?: string; membership_id?: string; name?: string; role?: Role };
export const pinMessage = (r: PinResult) =>
  r.reason === "wrong" ? `Wrong PIN. ${r.tries_left} ${r.tries_left === 1 ? "try" : "tries"} left.`
  : r.reason === "locked" ? `Locked after too many wrong PINs. Try again in a minute, or ask the owner.`
  : r.reason === "no_pin" ? "No PIN yet. Make one on your phone (My profile) or from the invite text."
  : r.reason === "device" ? "This device isn't a salon device for this salon."
  : "Can't check that PIN.";
