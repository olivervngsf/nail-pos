"use client";
// Profile menu: the email you can also sign in with. Add it once (we email a code to confirm), then the sign-in
// screen's "Use email instead" opens this same account.
import { useEffect, useState } from "react";
import { confirmAddEmail, emailOk, myEmail, startAddEmail, SMS_ON } from "@/lib/auth";

export default function SignInEmail({ vi }: { vi: boolean }) {
  const [email, setEmail] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { void myEmail().then(setEmail).catch(() => {}); }, []);

  const send = async () => {
    if (!emailOk(draft)) { setErr(vi ? "Email chưa đúng." : "Enter an email like name@gmail.com."); return; }
    setBusy(true); setErr("");
    const e = await startAddEmail(draft);
    setBusy(false);
    if (e) setErr(e); else setStage("code");
  };
  const confirm = async () => {
    setBusy(true); setErr("");
    const e = await confirmAddEmail(draft, code);
    setBusy(false);
    if (e) { setErr(e); setCode(""); return; }
    setEmail(draft.trim().toLowerCase()); setEdit(false); setStage("email"); setCode(""); setDone(true);
  };

  if (!edit) return (
    <div className="sie">
      <span className="cap">{vi ? "Email đăng nhập" : "Sign-in email"}</span>
      <span className="sie-row">
        <b className="sie-mail" data-testid="signin-email">{email ?? (vi ? "Chưa có" : "None yet")}</b>
        <button type="button" className="btn sm" onClick={() => { setEdit(true); setDraft(email ?? ""); setErr(""); setDone(false); }} data-testid="add-email">
          {email ? (vi ? "Đổi" : "Change") : (vi ? "Thêm email" : "Add sign-in email")}</button>
      </span>
      {done && <span className="cap" style={{ color: "#1F7A33" }}>{vi ? "Xong. Lần sau bấm “Dùng email” khi đăng nhập." : "Done. Next time tap “Use email instead” on sign-in."}</span>}
    </div>
  );
  return (
    <div className="sie">
      {stage === "email" ? <>
        <span className="cap">{vi ? "Email để đăng nhập" : "Email to sign in with"}</span>
        <input className="inp" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={draft} autoFocus
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} style={{ height: 40, fontSize: 15 }} data-testid="add-email-input" />
        <span className="sie-row">
          <button type="button" className="btn sm primary" disabled={busy} onClick={send} data-testid="add-email-send">{busy ? "…" : vi ? "Gửi mã" : "Email me a code"}</button>
          <button type="button" className="btn sm ghost" onClick={() => setEdit(false)}>{vi ? "Hủy" : "Cancel"}</button>
        </span>
      </> : <>
        <span className="cap">{vi ? `Mã 6 số đã gửi tới ${draft.trim()}` : `6-digit code sent to ${draft.trim()}`}</span>
        <input className="inp otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code" placeholder="––––––" autoFocus
          value={code} onChange={(e) => { setErr(""); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }} style={{ height: 44 }} data-testid="add-email-code" />
        {!SMS_ON && <span className="cap">{vi ? "Bản thử: nhập 6 số bất kỳ." : "Test version: any 6 numbers."}</span>}
        <span className="sie-row">
          <button type="button" className="btn sm primary" disabled={code.length !== 6 || busy} onClick={confirm} data-testid="add-email-confirm">{busy ? "…" : vi ? "Xác nhận" : "Confirm"}</button>
          <button type="button" className="btn sm ghost" onClick={() => setStage("email")}>{vi ? "Đổi email" : "Change email"}</button>
        </span>
      </>}
      {err && <span className="hint err" role="alert" style={{ margin: 0 }}>{err}</span>}
    </div>
  );
}
