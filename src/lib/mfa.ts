// 2-step login (authenticator app code) on top of the normal sign-in. Supabase MFA (TOTP).
// Optional per person; meant for owners + managers. Real mode only (needs Supabase).
import { getSupabase } from "@/lib/supabase/client";

export type Factor = { id: string; name: string };
export type Enroll = { id: string; qr: string; secret: string };

/** True when this session signed in but still owes the 2nd step. */
export async function needsSecondStep(): Promise<boolean> {
  const c = getSupabase();
  if (!c) return false;
  const { data } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.currentLevel === "aal1" && data.nextLevel === "aal2";
}

/** Authenticator apps that are set up and confirmed. */
export async function myFactors(): Promise<Factor[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data } = await c.auth.mfa.listFactors();
  return (data?.totp ?? []).filter((f) => f.status === "verified").map((f) => ({ id: f.id, name: f.friendly_name ?? "Authenticator app" }));
}

/** Start set-up: returns the QR to scan. Clears half-done tries first (Supabase refuses a second one with the same name). */
export async function startEnroll(): Promise<Enroll | string> {
  const c = getSupabase();
  if (!c) return "Not connected";
  const { data: all } = await c.auth.mfa.listFactors();
  for (const f of all?.all ?? []) if (f.status !== "verified") await c.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: "PolishOS" });
  if (error || !data) return error?.message ?? "Could not start";
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Check a 6-digit code (finishes set-up, or passes the 2nd step at sign-in). Null = OK. */
export async function checkCode(factorId: string, code: string): Promise<string | null> {
  const c = getSupabase();
  if (!c) return "Not connected";
  const { error } = await c.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, "") });
  return error ? error.message : null;
}

export async function removeFactor(factorId: string): Promise<string | null> {
  const c = getSupabase();
  if (!c) return "Not connected";
  const { error } = await c.auth.mfa.unenroll({ factorId });
  return error ? error.message : null;
}

export const codeOk = (code: string) => /^\d{6}$/.test(code.replace(/\s/g, ""));
