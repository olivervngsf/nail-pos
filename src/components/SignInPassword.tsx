"use client";
// Profile menu: set or change a password (then /login → "Sign in with password"), and connect Google.
import { useEffect, useState } from "react";
import { GOOGLE_ON, PASSWORD_MIN, connectGoogle, googleEmail, hasPassword, setPassword } from "@/lib/auth";

export default function SignInPassword({ vi }: { vi: boolean }) {
  const [has, setHas] = useState(false);
  const [edit, setEdit] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [google, setGoogle] = useState<string | null>(null);
  useEffect(() => {
    void hasPassword().then(setHas).catch(() => {});
    void googleEmail().then(setGoogle).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true); setErr("");
    const e = await setPassword(pw);
    setBusy(false);
    if (e) { setErr(e); return; }
    setHas(true); setEdit(false); setPw(""); setDone(true);
  };
  const linkGoogle = async () => { setErr(""); const e = await connectGoogle(); if (e) setErr(e); };

  return (
    <div className="sie">
      {!edit ? <>
        <span className="cap">{vi ? "Mật khẩu" : "Password"}</span>
        <span className="sie-row">
          <b className="sie-mail" data-testid="password-state">{has ? "••••••••" : (vi ? "Chưa có" : "None yet")}</b>
          <button type="button" className="btn sm" onClick={() => { setEdit(true); setErr(""); setDone(false); }} data-testid="set-password">
            {has ? (vi ? "Đổi" : "Change") : (vi ? "Tạo mật khẩu" : "Set a password")}</button>
        </span>
        {done && <span className="cap" style={{ color: "#1F7A33" }}>{vi ? "Xong. Lần sau bấm “Đăng nhập bằng mật khẩu”." : "Done. Next time tap “Sign in with password”."}</span>}
      </> : <>
        <span className="cap">{vi ? `Mật khẩu mới (ít nhất ${PASSWORD_MIN} ký tự)` : `New password (at least ${PASSWORD_MIN} letters or numbers)`}</span>
        <input className="inp" type={show ? "text" : "password"} autoComplete="new-password" value={pw} autoFocus data-testid="set-password-input"
          onChange={(e) => { setErr(""); setPw(e.target.value); }} onKeyDown={(e) => e.key === "Enter" && pw.length >= PASSWORD_MIN && save()} style={{ height: 40, fontSize: 15 }} />
        <span className="sie-row">
          <button type="button" className="btn sm primary" disabled={busy || pw.length < PASSWORD_MIN} onClick={save} data-testid="set-password-save">{busy ? "…" : vi ? "Lưu" : "Save"}</button>
          <button type="button" className="btn sm ghost" onClick={() => setShow((s) => !s)}>{show ? (vi ? "Ẩn" : "Hide") : (vi ? "Hiện" : "Show")}</button>
          <button type="button" className="btn sm ghost" onClick={() => { setEdit(false); setPw(""); }}>{vi ? "Hủy" : "Cancel"}</button>
        </span>
      </>}
      {GOOGLE_ON && <>
        <span className="cap" style={{ marginTop: 6 }}>Google</span>
        <span className="sie-row">
          <b className="sie-mail" data-testid="google-state">{google ?? (vi ? "Chưa kết nối" : "Not connected")}</b>
          {!google && <button type="button" className="btn sm" onClick={linkGoogle} data-testid="connect-google">{vi ? "Kết nối" : "Connect Google"}</button>}
        </span>
      </>}
      {err && <span className="hint err" role="alert" style={{ margin: 0 }}>{err}</span>}
    </div>
  );
}
