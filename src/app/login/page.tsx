"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PhoneCodeLogin from "@/components/PhoneCodeLogin";
import EmailCodeLogin from "@/components/EmailCodeLogin";
import { SMS_ON, homeFor, isSignedIn, myMemberships } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [byEmail, setByEmail] = useState(false);

  const go = async () => {
    if (!SMS_ON) { router.push("/setup"); return; }
    try {
      // Came from a link that needs sign-in (e.g. a ticket slip QR): go back there.
      const next = new URLSearchParams(location.search).get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(await myMemberships()));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  // Already signed in on this device → straight to your home.
  useEffect(() => { void isSignedIn().then((yes) => { if (yes) void go(); }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad in" style={{ width: "100%", maxWidth: 420, padding: 28, gap: 16 }}>
        <div className="logo" style={{ margin: 0 }}>P</div>
        {byEmail
          ? <EmailCodeLogin onDone={go} onPhone={() => setByEmail(false)} />
          : <><PhoneCodeLogin phone={phone} setPhone={setPhone} onDone={go} />
              <button className="btn ghost" type="button" onClick={() => setByEmail(true)} data-testid="use-email">Use email instead</button></>}
        {msg && <div className="hint err" role="alert">{msg}</div>}
        <div className="cap">New salon? <Link href="/setup">Set up your salon</Link></div>
      </div>
    </main>
  );
}
