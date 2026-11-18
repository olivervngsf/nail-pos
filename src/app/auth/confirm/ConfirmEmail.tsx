"use client";
// Opened from the "Yes, this is my email" button in the confirm email (Supabase "Change Email Address" template:
// /auth/confirm?token_hash=…&type=email_change). Works on any device: the phone where the email is open, or the salon computer.
// It never leaves a different person signed in: no one signed in before → sign out after; someone else signed in → put them back.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";

type State = "busy" | "done" | "half" | "bad";

export default function ConfirmEmail() {
  const [state, setState] = useState<State>("busy");
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      const q = new URLSearchParams(location.search);
      const tokenHash = q.get("token_hash"), type = q.get("type");
      const sb = getSupabase();
      if (!sb || !tokenHash || type !== "email_change") { setState("bad"); return; }
      const before = (await sb.auth.getSession()).data.session;
      const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email_change" });
      if (error) { setState("bad"); return; }
      // Changing an email you already had: Supabase wants a tap in BOTH emails (old + new). This was the first one.
      if (!data.session || !data.user) { setState("half"); return; }
      setEmail(data.user.email ?? "");
      await sb.rpc("sync_my_email").then(() => {}, () => {}); // the DB trigger does it too; this is a backup
      if (!before) await sb.auth.signOut({ scope: "local" });
      else if (before.user.id !== data.user.id) await sb.auth.setSession({ access_token: before.access_token, refresh_token: before.refresh_token });
      setSignedIn(!!before && before.user.id === data.user.id);
      setState("done");
    })();
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad in" style={{ width: "100%", maxWidth: 420, padding: 28, gap: 14 }} data-testid="confirm-email" data-state={state}>
        <div className="logo" style={{ margin: 0 }}>P</div>
        {state === "busy" && <h1 className="h2" style={{ margin: 0 }}>Confirming your email…</h1>}
        {state === "done" && <>
          <h1 className="h2" style={{ margin: 0 }}>Email added ✓</h1>
          <p style={{ margin: 0 }}>{email ? <><b>{email}</b> can</> : "This email can"} now sign in to your PolishOS account.</p>
          <p className="cap" style={{ margin: 0 }}>Đã thêm email. Lần sau bấm “Dùng email” khi đăng nhập.</p>
          {signedIn
            ? <Link className="btn primary block" href="/">Back to PolishOS</Link>
            : <Link className="btn primary block" href="/login">Sign in</Link>}
          <p className="cap" style={{ margin: 0 }}>On the sign-in screen, tap “Use email instead”.</p>
        </>}
        {state === "half" && <>
          <h1 className="h2" style={{ margin: 0 }}>One more tap</h1>
          <p style={{ margin: 0 }}>We also sent an email to your other address. Tap the button in that one too, and the change is done.</p>
          <p className="cap" style={{ margin: 0 }}>Còn một bước: bấm nút trong email gửi tới địa chỉ kia.</p>
        </>}
        {state === "bad" && <>
          <h1 className="h2" style={{ margin: 0 }}>This link didn’t work</h1>
          <p style={{ margin: 0 }}>It may be old or already used. In PolishOS, open your name (top right) → Add sign-in email, and send a new one.</p>
          <p className="cap" style={{ margin: 0 }}>Link hết hạn hoặc đã dùng. Mở tên bạn (góc phải) → Thêm email, gửi lại.</p>
          <Link className="btn block" href="/login">Go to PolishOS</Link>
        </>}
      </div>
    </main>
  );
}
