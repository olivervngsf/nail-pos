"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PhoneCodeLogin from "@/components/PhoneCodeLogin";
import { SMS_ON, homeFor, isSignedIn, myMemberships } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");

  const go = async () => {
    if (!SMS_ON) { router.push("/setup"); return; }
    try {
      router.push(homeFor(await myMemberships()));
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
        <PhoneCodeLogin phone={phone} setPhone={setPhone} onDone={go} />
        {msg && <div className="hint err" role="alert">{msg}</div>}
        <div className="cap">New salon? <Link href="/setup">Set up your salon</Link></div>
      </div>
    </main>
  );
}
