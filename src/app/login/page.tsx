"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PhoneCodeLogin from "@/components/PhoneCodeLogin";
import EmailCodeLogin from "@/components/EmailCodeLogin";
import PasswordLogin from "@/components/PasswordLogin";
import { GOOGLE_ON, SMS_ON, amPlatformAdmin, claimMine, homeFor, isSignedIn, lastLoginWay, myMemberships, redeemInvite, rememberLoginWay, signInWithGoogle, type LoginWay } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [way, setWay] = useState<LoginWay>("phone");
  // Open on the way this device signed in last time (password users skip the code screen).
  useEffect(() => setWay(lastLoginWay()), []);

  const go = async (used?: LoginWay) => {
    if (used) rememberLoginWay(used);
    if (!SMS_ON) { router.push("/setup"); return; }
    try {
      await claimMine(); // invite waiting for this phone or (Google / email) verified email
      // Came from an invite link: join that salon now.
      const invite = new URLSearchParams(location.search).get("invite");
      if (invite) {
        const e = await redeemInvite(invite);
        if (e) { setMsg(e); return; }
      }
      const ms = await myMemberships();
      // Came from a link that needs sign-in (e.g. a ticket slip QR): go back there.
      const next = new URLSearchParams(location.search).get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(ms, !ms.length && (await amPlatformAdmin())));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  // Already signed in on this device (or just back from Google) → straight to your home.
  useEffect(() => { void isSignedIn().then((yes) => { if (yes) void go(); }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const google = async () => { setMsg(""); const e = await signInWithGoogle(); if (e) setMsg(e); };

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad in" style={{ width: "100%", maxWidth: 420, padding: 28, gap: 16 }}>
        <div className="logo" style={{ margin: 0 }}>P</div>
        {way === "password"
          ? <PasswordLogin onDone={() => go("password")} onCode={() => setWay("phone")} />
          : way === "email"
            ? <EmailCodeLogin onDone={() => go("email")} onPhone={() => setWay("phone")} />
            : <><PhoneCodeLogin phone={phone} setPhone={setPhone} onDone={() => go("phone")} />
                <button className="btn ghost" type="button" onClick={() => setWay("email")} data-testid="use-email">Use email instead</button></>}
        {way !== "password" && <button className="btn ghost" type="button" onClick={() => setWay("password")} data-testid="use-password">Sign in with password</button>}
        {GOOGLE_ON && <>
          <div className="cap" style={{ textAlign: "center" }}>or</div>
          <button className="btn block" type="button" onClick={google} data-testid="google">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
        </>}
        {msg && <div className="hint err" role="alert">{msg}</div>}
        <div className="cap">New salon? <Link href="/setup">Set up your salon</Link></div>
      </div>
    </main>
  );
}
