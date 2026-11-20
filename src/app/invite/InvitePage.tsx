"use client";
// Invite: the owner (or staff) opens the link we sent, or types the 8-character code.
// Signed in → Join. Not signed in → sign in any way (phone, email, password, Google), then the invite is used.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ROLE_LABEL, SMS_ON, cleanCode, getInvite, homeFor, isSignedIn, myMemberships, redeemInvite, showCode, signOut, type InviteInfo } from "@/lib/auth";

export default function InvitePage({ code: start }: { code?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(start ? showCode(cleanCode(start)) : "");
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined); // undefined = not checked yet, null = not found
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const c = cleanCode(code);

  const check = async (v = c) => {
    if (v.length !== 8) { setErr("The code has 8 letters and numbers, like ABCD-2345."); return; }
    setBusy(true); setErr("");
    try { setInfo(SMS_ON ? await getInvite(v) : { salon_name: "Lotus Nails", display_name: "You", role: "owner", owner_name: null, phone_last4: "0110", status: "open" }); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => {
    void isSignedIn().then(setSignedIn);
    if (start) void check(cleanCode(start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async () => {
    if (!signedIn) { router.push(`/login?invite=${c}`); return; }
    setBusy(true); setErr("");
    const e = await redeemInvite(c);
    if (e) { setBusy(false); setErr(e); return; }
    router.replace(SMS_ON ? homeFor(await myMemberships()) : "/setup");
  };

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad in" style={{ width: "100%", maxWidth: 420, padding: 28, gap: 16 }}>
        <div className="logo" style={{ margin: 0 }}>P</div>
        {info ? <>
          <h1 className="h1" data-testid="invite-title">{info.status === "open" ? `Join ${info.salon_name}` : info.salon_name}</h1>
          {info.status === "open" ? <>
            <p className="cap lead">
              You&apos;re invited as <b>{ROLE_LABEL[info.role]}</b>{info.display_name ? <> ({info.display_name})</> : null}.
              {" "}{signedIn ? "Tap Join to add this salon to your account." : "Sign in with your phone, email or Google. Use the phone ending in " + info.phone_last4 + " if you can."}
            </p>
            <button className="btn primary block" type="button" disabled={busy} onClick={join} data-testid="invite-join">
              {busy ? "Joining…" : signedIn ? `Join ${info.salon_name}` : "Sign in to join"}</button>
          </> : <p className="cap lead" role="alert">
            {info.status === "used" ? "This invite was already used. If it was you, just sign in." : "This invite ran out (7 days). Ask PolishOS or your salon for a new one."}
          </p>}
          <button className="btn ghost" type="button" onClick={() => { setInfo(undefined); setErr(""); }}>Use a different code</button>
        </> : <>
          <h1 className="h1">Enter your invite code</h1>
          <p className="cap lead">It&apos;s in the text or email from PolishOS or your salon: 8 letters and numbers.</p>
          <div>
            <label className="lbl" htmlFor="ic">Invite code</label>
            <input className={`inp ${err ? "err" : ""}`} id="ic" autoCapitalize="characters" autoComplete="one-time-code" placeholder="ABCD-2345" data-testid="invite-code"
              value={code} onChange={(e) => { setErr(""); setInfo(undefined); const v = cleanCode(e.target.value).slice(0, 8); setCode(showCode(v)); }}
              onKeyDown={(e) => e.key === "Enter" && check()} style={{ letterSpacing: 2, fontWeight: 600 }} />
          </div>
          {info === null && <div className="hint err" role="alert" style={{ margin: 0 }}>We can&apos;t find that code. Check the letters and numbers.</div>}
          <button className="btn primary block" type="button" disabled={busy} onClick={() => check()} data-testid="invite-check">{busy ? "Checking…" : "Continue"}</button>
        </>}
        {err && <div className="hint err" role="alert" style={{ margin: 0 }}>{err}</div>}
        {signedIn
          // Signed in with a number that has no salon: /login would send them straight back here, so sign out first.
          ? <button className="btn ghost" type="button" data-testid="invite-signout"
              onClick={async () => { await signOut(); router.replace("/login"); }}>Sign in with another number</button>
          : <div className="cap">Already in a salon? <Link href="/login">Sign in</Link></div>}
      </div>
    </main>
  );
}
