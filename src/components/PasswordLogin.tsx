"use client";
// Sign in with phone or email + password, and "Forgot password?" (code by text/email → pick a new password).
import { useState } from "react";
import { PASSWORD_MIN, SMS_ON, loginIdOk, sendResetCode, setPassword, signInWithPassword, verifyResetCode } from "@/lib/auth";
import { fmtPhone } from "@/lib/onboarding/data";

/** Typing digits → (408) 555-0110; typing an @ → plain email. */
const fmtId = (v: string) => (/[a-z@]/i.test(v) ? v : fmtPhone(v));

function PasswordInput({ value, onChange, label, id, autoComplete, onEnter, testId }: {
  value: string; onChange: (v: string) => void; label: string; id: string; autoComplete: string; onEnter?: () => void; testId: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="lbl" htmlFor={id}>{label}</label>
      <div style={{ position: "relative" }}>
        <input className="inp" id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} data-testid={testId}
          onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onEnter?.()} style={{ paddingRight: 64 }} />
        <button type="button" className="btn sm ghost" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
          style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}>{show ? "Hide" : "Show"}</button>
      </div>
    </div>
  );
}

export default function PasswordLogin({ onDone, onCode }: { onDone: () => void | Promise<void>; onCode: () => void }) {
  const [stage, setStage] = useState<"login" | "forgot" | "code" | "new">("login");
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tried, setTried] = useState(false);
  const bad = !loginIdOk(id);
  const idErr = tried && bad && <div className="hint err">Enter your 10-digit mobile number or your email.</div>;
  const errBox = err && <div className="hint err" role="alert" style={{ margin: 0 }}>{err}</div>;
  const run = async (f: () => Promise<string | null>, ok: () => void | Promise<void>) => {
    setBusy(true); setErr("");
    const e = await f();
    if (e) { setBusy(false); setErr(e); return; }
    await ok();
    setBusy(false);
  };

  const signIn = () => { setTried(true); if (bad || !pw) return; void run(() => signInWithPassword(id, pw), onDone); };
  const sendReset = () => { setTried(true); if (bad) return; void run(() => sendResetCode(id), () => { setCode(""); setStage("code"); }); };

  if (stage === "login") return (
    <>
      <h1 className="h1">Sign in with password</h1>
      <p className="cap lead">Your phone number or email, and your password.</p>
      <div>
        <label className="lbl" htmlFor="lid">Phone or email</label>
        <input className={`inp ${idErr ? "err" : ""}`} id="lid" autoComplete="username" placeholder="(408) 555-0110 or you@example.com" data-testid="pw-id"
          value={id} onChange={(e) => setId(fmtId(e.target.value))} />
        {idErr}
      </div>
      <PasswordInput id="lpw" label="Password" autoComplete="current-password" value={pw} onChange={setPw} onEnter={signIn} testId="pw-password" />
      {errBox}
      <button className="btn primary block" type="button" disabled={busy || !pw} onClick={signIn} data-testid="pw-signin">{busy ? "Signing in…" : "Sign in"}</button>
      <button className="btn ghost" type="button" onClick={() => { setErr(""); setTried(false); setStage("forgot"); }} data-testid="forgot">Forgot password?</button>
      <button className="btn ghost" type="button" onClick={onCode} data-testid="use-code">Sign in with a code instead</button>
    </>
  );

  if (stage === "forgot") return (
    <>
      <h1 className="h1">Reset your password</h1>
      <p className="cap lead">We send a 6-digit code to your phone or email. Then you pick a new password.</p>
      <div>
        <label className="lbl" htmlFor="fid">Phone or email</label>
        <input className={`inp ${idErr ? "err" : ""}`} id="fid" autoComplete="username" placeholder="(408) 555-0110 or you@example.com" data-testid="reset-id"
          value={id} onChange={(e) => setId(fmtId(e.target.value))} onKeyDown={(e) => e.key === "Enter" && sendReset()} />
        {idErr}
      </div>
      {errBox}
      <button className="btn primary block" type="button" disabled={busy} onClick={sendReset} data-testid="reset-send">{busy ? "Sending…" : "Send me a code"}</button>
      <button className="btn ghost" type="button" onClick={() => { setErr(""); setStage("login"); }}>Back to sign in</button>
    </>
  );

  if (stage === "code") return (
    <>
      <h1 className="h1">Enter the 6-digit code</h1>
      <p className="cap lead">Sent to {id.trim()}.{id.includes("@") ? " Check spam if you don't see it." : ""}</p>
      <input className={`inp otp ${err ? "err" : ""}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code"
        placeholder="––––––" data-1p-ignore data-lpignore="true" autoFocus data-testid="reset-code"
        value={code} onChange={(e) => { setErr(""); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }} />
      {errBox}
      {!SMS_ON && (
        <div className="demo" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 180 }}>Test version: no code is sent. Type any 6 numbers.</span>
          <button type="button" className="btn sm" onClick={() => setCode("123456")}>Fill test code</button>
        </div>
      )}
      <button className="btn primary block" type="button" disabled={code.length !== 6 || busy} data-testid="reset-verify"
        onClick={() => run(() => verifyResetCode(id, code), () => { setPw(""); setStage("new"); })}>{busy ? "Checking…" : "Verify"}</button>
      {SMS_ON && <button className="btn ghost" type="button" disabled={busy} onClick={() => sendResetCode(id).then((e) => e && setErr(e))}>Send a new code</button>}
      <button className="btn ghost" type="button" onClick={() => setStage("forgot")}>Change phone or email</button>
    </>
  );

  return (
    <>
      <h1 className="h1">Pick a new password</h1>
      <p className="cap lead">At least {PASSWORD_MIN} letters or numbers. You&apos;re signed in; this is for next time.</p>
      <PasswordInput id="npw" label="New password" autoComplete="new-password" value={pw} onChange={(v) => { setErr(""); setPw(v); }}
        onEnter={() => run(() => setPassword(pw), onDone)} testId="reset-new" />
      {errBox}
      <button className="btn primary block" type="button" disabled={busy || pw.length < PASSWORD_MIN} data-testid="reset-save"
        onClick={() => run(() => setPassword(pw), onDone)}>{busy ? "Saving…" : "Save and continue"}</button>
    </>
  );
}
