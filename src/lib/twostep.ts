// 2-step sign-in (M14): a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator,
// 1Password, iPhone Passwords…) after the usual sign-in. Turned on per person in My profile. The server
// (`_aal_ok` in migration two_step) keeps every salon closed until the code is entered.
import { getSupabase } from "@/lib/supabase/client";
import { SMS_ON } from "@/lib/auth";

const sb = () => { const c = getSupabase(); if (!c) throw new Error("Can't reach our server. Check internet and try again."); return c; };
const bad = (m: string) => (/invalid|code|expired/i.test(m) ? "That code didn't work. Use the newest 6 digits in the app." : m);

/** The verified app, if this person has one. */
export async function twoStepOn(): Promise<{ id: string } | null> {
  if (!SMS_ON) return null;
  const { data } = await sb().auth.mfa.listFactors();
  const f = data?.totp?.find((x) => x.status === "verified");
  return f ? { id: f.id } : null;
}

/** Step 1 of turning it on: a QR for the app + the same key as text (type it in if the camera can't scan). */
export async function twoStepStart(): Promise<{ id: string; qr: string; secret: string }> {
  const c = sb();
  // Clear a half-done set-up from before (unverified), so a new one can start.
  const { data: list } = await c.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status !== "verified") await c.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: `PolishOS ${new Date().toISOString().slice(0, 10)}`, issuer: "PolishOS" });
  if (error || !data) throw new Error(error?.message ?? "Couldn't start. Try again.");
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Check a code for this app (finishes the set-up, or finishes today's sign-in). */
export async function twoStepCheck(factorId: string, code: string): Promise<string | null> {
  const { error } = await sb().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, "") });
  return error ? bad(error.message) : null;
}

/** Turn it off (needs a code-checked session first: Supabase only lets aal2 remove a verified app). */
export async function twoStepOff(factorId: string): Promise<string | null> {
  const { error } = await sb().auth.mfa.unenroll({ factorId });
  return error ? error.message : null;
}

/** Does this signed-in session still owe the code? */
export async function twoStepNeeded(): Promise<boolean> {
  if (!SMS_ON) return false;
  const c = getSupabase();
  if (!c) return false;
  const { data } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.currentLevel === "aal1" && data.nextLevel === "aal2";
}
