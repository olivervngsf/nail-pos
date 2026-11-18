"use client";
// My profile → 2-step sign-in: turn on (scan QR in an authenticator app, type its 6 digits) or off.
// Same pattern as SignInEmail / SignInPassword (inline EN/VI).
import { useEffect, useState } from "react";
import { twoStepCheck, twoStepOff, twoStepOn, twoStepStart } from "@/lib/twostep";

export default function TwoStep({ vi, owner }: { vi: boolean; owner: boolean }) {
  const [on, setOn] = useState<{ id: string } | null>(null);
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useEffect(() => { void twoStepOn().then(setOn).catch(() => {}); }, []);

  const start = async () => {
    setErr(""); setDone(""); setBusy(true);
    try { setSetup(await twoStepStart()); setCode(""); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const confirm = async () => {
    if (!setup) return;
    setBusy(true); setErr("");
    const e = await twoStepCheck(setup.id, code);
    setBusy(false);
    if (e) return setErr(e);
    setOn({ id: setup.id }); setSetup(null); setDone(vi ? "Đã bật. Lần sau đăng nhập sẽ hỏi mã 6 số trong app." : "On. Next sign-in asks for the 6 digits in the app.");
  };
  const off = async () => {
    if (!on || !confirm_(vi)) return;
    setBusy(true); setErr("");
    const e = await twoStepOff(on.id);
    setBusy(false);
    if (e) return setErr(vi ? "Không tắt được. Đăng xuất, đăng nhập lại với mã, rồi thử lại." : "Couldn't turn it off. Sign out, sign in again with the code, then try again.");
    setOn(null); setDone(vi ? "Đã tắt." : "Off.");
  };

  return (
    <div className="sie" data-testid="two-step">
      <span className="cap">{vi ? "Đăng nhập 2 bước" : "2-step sign-in"}</span>
      {!setup ? <>
        <span className="sie-row">
          <b className="sie-mail" data-testid="two-step-state">{on ? (vi ? "Đang bật" : "On") : (vi ? "Tắt" : "Off")}</b>
          {on
            ? <button type="button" className="btn sm" disabled={busy} onClick={() => void off()}>{vi ? "Tắt" : "Turn off"}</button>
            : <button type="button" className="btn sm" disabled={busy} onClick={() => void start()} data-testid="two-step-on">{vi ? "Bật" : "Turn on"}</button>}
        </span>
        {!on && <span className="cap">{owner
          ? (vi ? "Nên bật cho chủ tiệm: tiền và dữ liệu khách an toàn hơn, kể cả khi lộ mật khẩu." : "Recommended for owners: money and client data stay safe even if a password leaks.")
          : (vi ? "Sau khi đăng nhập, nhập thêm mã 6 số từ app xác thực." : "After signing in, also type a 6-digit code from an authenticator app.")}</span>}
      </> : <>
        <span className="cap">{vi
          ? "1. Mở app xác thực (Google Authenticator, Microsoft Authenticator, 1Password…) → thêm → quét mã QR."
          : "1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, iPhone Passwords…) → add → scan this QR."}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt={vi ? "Mã QR cho app xác thực" : "QR code for the authenticator app"} width={180} height={180} style={{ background: "#fff", borderRadius: 8 }} data-testid="two-step-qr" />
        <span className="cap">{vi ? "Không quét được? Gõ khoá này:" : "Can't scan? Type this key:"} <code style={{ userSelect: "all", wordBreak: "break-all" }}>{setup.secret}</code></span>
        <span className="cap">{vi ? "2. Gõ 6 số app đang hiện:" : "2. Type the 6 digits the app shows:"}</span>
        <span className="sie-row">
          <input className="inp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} aria-label={vi ? "Mã 6 số" : "6-digit code"}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) void confirm(); }} style={{ maxWidth: 140, letterSpacing: "0.2em" }} />
          <button type="button" className="btn sm primary" disabled={busy || code.length !== 6} onClick={() => void confirm()}>{vi ? "Bật" : "Turn on"}</button>
          <button type="button" className="btn sm" onClick={() => setSetup(null)}>{vi ? "Huỷ" : "Cancel"}</button>
        </span>
      </>}
      {done && <span className="cap" style={{ color: "#1F7A33" }}>{done}</span>}
      {err && <span className="hint err">{err}</span>}
    </div>
  );
}
const confirm_ = (vi: boolean) => window.confirm(vi ? "Tắt đăng nhập 2 bước? Tài khoản sẽ kém an toàn hơn." : "Turn off 2-step sign-in? Your account will be less safe.");
