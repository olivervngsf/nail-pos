"use client";
// Signed in, but this person turned on 2-step login and this session has not passed it yet:
// cover the app and ask for the 6-digit code. Nothing shows for anyone else.
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth";
import { checkCode, codeOk, myFactors, needsSecondStep } from "@/lib/mfa";
import { getSupabase } from "@/lib/supabase/client";
import { useLang } from "@/components/AppProviders";

export default function TwoStepGate() {
  const { lang } = useLang();
  const vi = lang === "vi";
  const [need, setNeed] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const c = getSupabase();
    if (!c) return;
    const look = () => void needsSecondStep().then(setNeed).catch(() => {});
    look();
    const { data } = c.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "MFA_CHALLENGE_VERIFIED") setTimeout(look, 0); });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!need) return null;

  const go = async () => {
    setBusy(true); setErr("");
    const f = (await myFactors())[0];
    const e = f ? await checkCode(f.id, code) : "No authenticator app found";
    setBusy(false);
    if (e) { setErr(vi ? "Mã không đúng. Thử mã mới." : "That code is not right. Try the newest code."); setCode(""); return; }
    setNeed(false); setCode("");
  };

  return (
    <div className="tw-gate" role="dialog" aria-modal="true" aria-label={vi ? "Đăng nhập 2 bước" : "2-step login"} data-testid="two-step-gate">
      <div className="card pad in" style={{ width: "100%", maxWidth: 380, padding: 28, gap: 14 }}>
        <div className="logo" style={{ margin: 0 }}>P</div>
        <b className="h2">{vi ? "Nhập mã 6 số" : "Enter your 6-digit code"}</b>
        <span className="cap">{vi ? "Mở ứng dụng xác thực của bạn và nhập mã cho PolishOS." : "Open your authenticator app and enter the code for PolishOS."}</span>
        <input className="inp tw-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus data-testid="two-step-gate-code"
          onChange={(e) => { setErr(""); setCode(e.target.value.replace(/\D/g, "")); }} onKeyDown={(e) => e.key === "Enter" && codeOk(code) && void go()} />
        {err && <span className="hint err" role="alert" style={{ margin: 0 }}>{err}</span>}
        <button type="button" className="btn primary block" disabled={busy || !codeOk(code)} onClick={() => void go()}>{busy ? "…" : vi ? "Tiếp tục" : "Continue"}</button>
        <button type="button" className="btn ghost" onClick={async () => { await signOut(); location.href = "/login"; }}>{vi ? "Đăng xuất" : "Sign out"}</button>
        <span className="cap">{vi ? "Mất điện thoại? Nhắn cho PolishOS để được giúp." : "Lost your phone? Contact PolishOS for help."}</span>
      </div>
    </div>
  );
}
