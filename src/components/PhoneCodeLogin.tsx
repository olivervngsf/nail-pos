"use client";
// Phone + 6-digit text code. Used by /login, setup sign-up and staff join.
import { useState } from "react";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { SMS_ON, sendCode, verifyCode } from "@/lib/auth";

export default function PhoneCodeLogin({
  phone, setPhone, onDone, title = "Sign in", lead = "Your phone number is your login. We text you a code. No password.", extra, sendLabel = "Text me a code", lockedPhone,
}: {
  phone: string; setPhone: (p: string) => void; onDone: () => void | Promise<void>;
  title?: string; lead?: string; extra?: React.ReactNode; sendLabel?: string; lockedPhone?: boolean;
}) {
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tried, setTried] = useState(false);
  const bad = !phoneOk(phone);

  const send = async () => {
    setTried(true);
    if (bad) return;
    setBusy(true); setErr("");
    const e = await sendCode(phone);
    setBusy(false);
    if (e) setErr(e); else setStage("code");
  };
  const verify = async () => {
    setBusy(true); setErr("");
    const e = await verifyCode(phone, code);
    if (e) { setBusy(false); setErr(e); setCode(""); return; }
    await onDone();
    setBusy(false);
  };

  if (stage === "phone") return (
    <>
      <h1 className="h1">{title}</h1>
      <p className="cap lead">{lead}</p>
      {extra}
      <div>
        <label className="lbl" htmlFor="ph">Your mobile number</label>
        <input className={`inp ${tried && bad ? "err" : ""}`} id="ph" inputMode="tel" autoComplete="tel" placeholder="(408) 555-0110" readOnly={lockedPhone}
          value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} />
        {tried && bad && <div className="hint err">Enter a 10-digit US mobile number.</div>}
      </div>
      {err && <div className="hint err" role="alert" style={{ margin: 0 }}>{err}</div>}
      <button className="btn primary block" type="button" disabled={busy} onClick={send}>{busy ? "Sending…" : sendLabel}</button>
    </>
  );
  return (
    <>
      <h1 className="h1">Enter the 6-digit code</h1>
      <p className="cap lead">Sent to {phone}</p>
      <input className={`inp otp ${err ? "err" : ""}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code"
        placeholder="––––––" data-1p-ignore data-lpignore="true" autoFocus
        value={code} onChange={(e) => { setErr(""); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }} />
      {err && <div className="hint err" role="alert" style={{ margin: 0 }}>{err}</div>}
      {!SMS_ON && (
        <div className="demo" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 180 }}>Test version: texting isn&apos;t on yet. Type any 6 numbers.</span>
          <button type="button" className="btn sm" onClick={() => setCode("123456")}>Fill test code</button>
        </div>
      )}
      <button className="btn primary block" type="button" disabled={code.length !== 6 || busy} onClick={verify}>{busy ? "Checking…" : "Verify"}</button>
      {SMS_ON && <button className="btn ghost" type="button" disabled={busy} onClick={() => sendCode(phone).then((e) => e && setErr(e))}>Send a new code</button>}
      <button className="btn ghost" type="button" onClick={() => setStage("phone")}>Change number</button>
    </>
  );
}
