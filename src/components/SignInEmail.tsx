"use client";
// Profile menu: the email you can also sign in with. Add it once: type it → Save → tap "Yes, this is my email" in the
// email we send (opens /auth/confirm on any device). The 6-digit code in that email is a backup you can type here.
// While waiting we check every few seconds, so this menu flips to "Email added" on its own.
import { useEffect, useState } from "react";
import { confirmAddEmail, emailOk, myEmail, startAddEmail, SMS_ON } from "@/lib/auth";

export default function SignInEmail({ vi }: { vi: boolean }) {
  const [email, setEmail] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState<"email" | "sent">("email");
  const [showCode, setShowCode] = useState(!SMS_ON);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { void myEmail().then(setEmail).catch(() => {}); }, []);

  const finish = (m: string) => { setEmail(m); setEdit(false); setStage("email"); setCode(""); setShowCode(!SMS_ON); setDone(true); };

  // Waiting for the tap in the email: look again every 4 s and when this tab comes back to the front.
  useEffect(() => {
    if (!edit || stage !== "sent" || !SMS_ON) return;
    const want = draft.trim().toLowerCase();
    const check = () => { void myEmail().then((m) => { if (m && m.toLowerCase() === want) finish(m); }).catch(() => {}); };
    const t = setInterval(check, 4000);
    window.addEventListener("focus", check);
    return () => { clearInterval(t); window.removeEventListener("focus", check); };
  }, [edit, stage, draft]);

  const send = async () => {
    if (!emailOk(draft)) { setErr(vi ? "Email chưa đúng." : "Enter an email like name@gmail.com."); return; }
    setBusy(true); setErr("");
    // Same email as on file (e.g. already confirmed from the email): nothing to send, it's done.
    const now = await myEmail().catch(() => null);
    if (now && now.toLowerCase() === draft.trim().toLowerCase()) { setBusy(false); finish(now); return; }
    const e = await startAddEmail(draft);
    setBusy(false);
    if (e) setErr(e); else setStage("sent");
  };
  const confirm = async () => {
    setBusy(true); setErr("");
    const e = await confirmAddEmail(draft, code);
    setBusy(false);
    if (e) { setErr(e); setCode(""); return; }
    finish(draft.trim().toLowerCase());
  };

  if (!edit) return (
    <div className="sie">
      <span className="cap">{vi ? "Email đăng nhập" : "Sign-in email"}</span>
      <span className="sie-row">
        <b className="sie-mail" data-testid="signin-email">{email ?? (vi ? "Chưa có" : "None yet")}</b>
        <button type="button" className="btn sm" onClick={() => { setEdit(true); setDraft(email ?? ""); setErr(""); setDone(false); }} data-testid="add-email">
          {email ? (vi ? "Đổi" : "Change") : (vi ? "Thêm email" : "Add sign-in email")}</button>
      </span>
      {done && <span className="cap" style={{ color: "#1F7A33" }}>{vi ? "Đã thêm email. Lần sau bấm “Dùng email” khi đăng nhập." : "Email added. Next time tap “Use email instead” on sign-in."}</span>}
    </div>
  );
  return (
    <div className="sie">
      {stage === "email" ? <>
        <span className="cap">{vi ? "Email để đăng nhập" : "Email to sign in with"}</span>
        <input className="inp" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={draft} autoFocus
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} style={{ height: 40, fontSize: 15 }} data-testid="add-email-input" />
        <span className="sie-row">
          <button type="button" className="btn sm primary" disabled={busy} onClick={send} data-testid="add-email-send">{busy ? "…" : vi ? "Lưu" : "Save"}</button>
          <button type="button" className="btn sm ghost" onClick={() => setEdit(false)}>{vi ? "Hủy" : "Cancel"}</button>
        </span>
      </> : <>
        <b data-testid="add-email-sent">{vi ? "Kiểm tra email của bạn" : "Check your email"}</b>
        <span className="cap">{vi ? <>Mở email gửi tới <b>{draft.trim()}</b> và bấm “Đúng, email của tôi”.</> : <>Open the email we sent to <b>{draft.trim()}</b> and tap “Yes, this is my email”.</>}</span>
        {SMS_ON && <span className="cap">{vi ? "Màn hình này tự cập nhật khi xong." : "This updates on its own when you’re done."}</span>}
        {showCode ? <>
          <input className="inp otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code" placeholder="––––––" autoFocus
            value={code} onChange={(e) => { setErr(""); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }} style={{ height: 44 }} data-testid="add-email-code" />
          {!SMS_ON && <span className="cap">{vi ? "Bản thử: nhập 6 số bất kỳ." : "Test version: any 6 numbers."}</span>}
          <span className="sie-row">
            <button type="button" className="btn sm primary" disabled={code.length !== 6 || busy} onClick={confirm} data-testid="add-email-confirm">{busy ? "…" : vi ? "Xác nhận" : "Confirm"}</button>
            <button type="button" className="btn sm ghost" onClick={() => setStage("email")}>{vi ? "Đổi email" : "Change email"}</button>
          </span>
        </> : <span className="sie-row">
          <button type="button" className="btn sm ghost" onClick={() => setShowCode(true)} data-testid="add-email-use-code">{vi ? "Nhập mã 6 số" : "Type the 6-digit code instead"}</button>
          <button type="button" className="btn sm ghost" onClick={() => setStage("email")}>{vi ? "Đổi email" : "Change email"}</button>
        </span>}
      </>}
      {err && <span className="hint err" role="alert" style={{ margin: 0 }}>{err}</span>}
    </div>
  );
}
