"use client";
// Profile → Sign in: turn 2-step login on or off (authenticator app). Shown to owners + managers on their own login.
import { useEffect, useState } from "react";
import { SMS_ON } from "@/lib/auth";
import { checkCode, codeOk, myFactors, removeFactor, startEnroll, type Enroll, type Factor } from "@/lib/mfa";

export default function TwoStep({ vi }: { vi: boolean }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [en, setEn] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [off, setOff] = useState(false);
  useEffect(() => { void myFactors().then(setFactors).catch(() => {}); }, []);
  const on = factors.length > 0;

  const start = async () => {
    setErr(""); setBusy(true);
    const r = await startEnroll();
    setBusy(false);
    if (typeof r === "string") return setErr(r);
    setEn(r); setCode("");
  };
  const finish = async () => {
    if (!en) return;
    setBusy(true); setErr("");
    const e = await checkCode(en.id, code);
    setBusy(false);
    if (e) return setErr(vi ? "Mã không đúng. Thử mã mới." : "That code is not right. Try the newest code.");
    setEn(null); setCode(""); setFactors(await myFactors());
  };
  const turnOff = async () => {
    setBusy(true); setErr("");
    for (const f of factors) { const e = await removeFactor(f.id); if (e) { setErr(e); break; } }
    setBusy(false); setOff(false); setFactors(await myFactors());
  };

  return (
    <div className="sie" data-testid="two-step">
      <span className="cap">{vi ? "Đăng nhập 2 bước" : "2-step login"}</span>
      {!en ? <>
        <span className="sie-row">
          <b className="sie-mail" data-testid="two-step-state">{on ? (vi ? "Đang bật" : "On") : (vi ? "Đang tắt" : "Off")}</b>
          {!on && <button type="button" className="btn sm" disabled={busy || !SMS_ON} onClick={() => void start()} data-testid="two-step-on">{vi ? "Bật" : "Turn on"}</button>}
          {on && !off && <button type="button" className="btn sm" onClick={() => setOff(true)} data-testid="two-step-off">{vi ? "Tắt" : "Turn off"}</button>}
          {on && off && <>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void turnOff()} data-testid="two-step-off-yes">{vi ? "Tắt thật" : "Yes, turn off"}</button>
            <button type="button" className="btn sm ghost" onClick={() => setOff(false)}>{vi ? "Giữ" : "Keep on"}</button>
          </>}
        </span>
        <span className="cap">{on
          ? (vi ? "Khi đăng nhập trên máy mới, bạn nhập thêm mã 6 số từ ứng dụng xác thực." : "On a new device you also enter a 6-digit code from your authenticator app.")
          : (vi ? "Thêm một bước: mã 6 số từ ứng dụng xác thực (Google Authenticator, 1Password…). Nên bật cho chủ tiệm và quản lý." : "One more step: a 6-digit code from an authenticator app (Google Authenticator, 1Password…). Best for owners and managers.")}</span>
        {!SMS_ON && <span className="cap">{vi ? "Bản thử: chưa bật được." : "Test version: can't be turned on here."}</span>}
      </> : <>
        <span>{vi ? "1. Mở ứng dụng xác thực và quét mã này." : "1. Open your authenticator app and scan this code."}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="tw-qr" src={en.qr} alt={vi ? "Mã QR để quét" : "QR code to scan"} />
        <span className="cap" style={{ wordBreak: "break-all" }}>{vi ? "Không quét được? Nhập mã này: " : "Can't scan? Type this key: "}<b>{en.secret}</b></span>
        <span>{vi ? "2. Nhập mã 6 số ứng dụng hiện ra." : "2. Enter the 6-digit code the app shows."}</span>
        <input className="inp tw-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus data-testid="two-step-code"
          onChange={(e) => { setErr(""); setCode(e.target.value.replace(/\D/g, "")); }} onKeyDown={(e) => e.key === "Enter" && codeOk(code) && void finish()} />
        <span className="sie-row">
          <button type="button" className="btn sm primary" disabled={busy || !codeOk(code)} onClick={() => void finish()} data-testid="two-step-save">{busy ? "…" : vi ? "Bật" : "Turn on"}</button>
          <button type="button" className="btn sm ghost" onClick={() => { setEn(null); setErr(""); }}>{vi ? "Hủy" : "Cancel"}</button>
        </span>
      </>}
      {err && <span className="hint err" role="alert" style={{ margin: 0 }}>{err}</span>}
    </div>
  );
}
