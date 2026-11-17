"use client";
// Sign in with email + 6-digit code. Works once an email was added to the account (menu → Add sign-in email).
import { useState } from "react";
import { SMS_ON, emailOk, sendEmailCode, verifyEmailCode } from "@/lib/auth";

export default function EmailCodeLogin({ onDone, onPhone }: { onDone: () => void | Promise<void>; onPhone: () => void }) {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tried, setTried] = useState(false);
  const bad = !emailOk(email);

  const send = async () => {
    setTried(true);
    if (bad) return;
    setBusy(true); setErr("");
    const e = await sendEmailCode(email);
    setBusy(false);
    if (e) setErr(e); else setStage("code");
  };
  const verify = async () => {
    setBusy(true); setErr("");
    const e = await verifyEmailCode(email, code);
    if (e) { setBusy(false); setErr(e); setCode(""); return; }
    await onDone();
    setBusy(false);
  };

  if (stage === "email") return (
    <>
      <h1 className="h1">Sign in with email</h1>
      <p className="cap lead">We email you a 6-digit code. No password. Works after you add your email in your profile.</p>
      <div>
        <label className="lbl" htmlFor="em">Your email</label>
        <input className={`inp ${tried && bad ? "err" : ""}`} id="em" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} data-testid="email" />
        {tried && bad && <div className="hint err">Enter an email like name@gmail.com.</div>}
      </div>
      {err && <div className="hint err" role="alert" style={{ margin: 0 }}>{err}</div>}
      <button className="btn primary block" type="button" disabled={busy} onClick={send} data-testid="email-send">{busy ? "Sending…" : "Email me a code"}</button>
      <button className="btn ghost" type="button" onClick={onPhone} data-testid="use-phone">Use phone number instead</button>
    </>
  );
  return (
    <>
      <h1 className="h1">Enter the 6-digit code</h1>
      <p className="cap lead">Sent to {email.trim()}. Check spam if you don&apos;t see it.</p>
      <input className={`inp otp ${err ? "err" : ""}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code"
        placeholder="––––––" data-1p-ignore data-lpignore="true" autoFocus
        value={code} onChange={(e) => { setErr(""); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }} />
      {err && <div className="hint err" role="alert" style={{ margin: 0 }}>{err}</div>}
      {!SMS_ON && (
        <div className="demo" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 180 }}>Test version: no email is sent. Type any 6 numbers.</span>
          <button type="button" className="btn sm" onClick={() => setCode("123456")}>Fill test code</button>
        </div>
      )}
      <button className="btn primary block" type="button" disabled={code.length !== 6 || busy} onClick={verify} data-testid="email-verify">{busy ? "Checking…" : "Verify"}</button>
      {SMS_ON && <button className="btn ghost" type="button" disabled={busy} onClick={() => sendEmailCode(email).then((e) => e && setErr(e))}>Send a new code</button>}
      <button className="btn ghost" type="button" onClick={() => setStage("email")}>Change email</button>
    </>
  );
}
