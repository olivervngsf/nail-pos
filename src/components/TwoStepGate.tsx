"use client";
// After sign-in: if this person turned on 2-step, ask for the 6 digits before any screen opens.
// The server keeps every salon closed until then anyway (`_aal_ok`), so this is the friendly front door.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLang } from "@/components/AppProviders";
import { signOut } from "@/lib/auth";
import { twoStepCheck, twoStepNeeded, twoStepOn } from "@/lib/twostep";

export default function TwoStepGate() {
  const path = usePathname();
  const { lang } = useLang();
  const vi = lang === "vi";
  const [need, setNeed] = useState<{ id: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (!(await twoStepNeeded())) { if (live) setNeed(null); return; }
        const f = await twoStepOn();
        if (live) setNeed(f);
      } catch { /* offline: the server still guards */ }
    })();
    return () => { live = false; };
  }, [path]);

  if (!need) return null;
  const go = async () => {
    setBusy(true); setErr("");
    const e = await twoStepCheck(need.id, code);
    setBusy(false);
    if (e) { setErr(e); setCode(""); return; }
    location.reload();
  };
  return (
    <div className="go-page two-step-gate" role="dialog" aria-modal="true" data-testid="two-step-gate">
      <div className="card pad go-card">
        <h1 className="h1">{vi ? "Nhập mã 6 số" : "Enter your 6-digit code"}</h1>
        <p className="cap">{vi ? "Mở app xác thực trên điện thoại và gõ mã PolishOS." : "Open your authenticator app and type the PolishOS code."}</p>
        <input className="inp go-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} aria-label={vi ? "Mã 6 số" : "6-digit code"}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) void go(); }} />
        <button type="button" className="btn primary block" disabled={busy || code.length !== 6} onClick={() => void go()}>{busy ? "…" : (vi ? "Tiếp" : "Continue")}</button>
        {err && <p className="hint err" role="alert">{err}</p>}
        <button type="button" className="btn ghost" onClick={async () => { await signOut(); location.href = "/login"; }}>{vi ? "Đăng xuất" : "Sign out"}</button>
        <p className="cap">{vi ? "Mất điện thoại? Gọi PolishOS để tắt giúp sau khi xác minh." : "Lost your phone? Call PolishOS: we turn it off after checking it's you."}</p>
      </div>
    </div>
  );
}
