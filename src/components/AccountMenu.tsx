"use client";
// The one place for "me": top-right chip → small menu with who I am, language, sign out.
// (Replaces the extra avatar at the bottom of the left menu and the loose Sign out buttons.)
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Segmented } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { ROLE_LABEL, signOut, type Role } from "@/lib/auth";
import SignInEmail from "@/components/SignInEmail";

export default function AccountMenu({ name, role, salon, compact }: { name: string; role: Role; salon?: string; compact?: boolean }) {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [open]);
  const vi = lang === "vi";
  return (
    <div className="acct" ref={box}>
      <button type="button" className="who acct-btn" aria-haspopup="menu" aria-expanded={open} data-testid="account-menu" onClick={() => setOpen((o) => !o)}>
        <Avatar name={name} />{!compact && <span className="acct-name">{name} · {ROLE_LABEL[role]}</span>}<span aria-hidden className="cap">▾</span>
      </button>
      {open && (
        <div className="acct-menu card" role="menu">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={name} />
            <span><b style={{ display: "block" }}>{name}</b><span className="cap">{ROLE_LABEL[role]}{salon ? ` · ${salon}` : ""}</span></span>
          </div>
          <div className="sep" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span className="cap">{vi ? "Ngôn ngữ" : "Language"}</span>
            <Segmented label="Language" value={lang} onChange={setLang} options={[{ value: "en", label: "EN" }, { value: "vi", label: "VI" }]} />
          </div>
          <div className="sep" />
          <SignInEmail vi={vi} />
          <div className="sep" />
          <button type="button" role="menuitem" className="opt" data-testid="sign-out" style={{ minHeight: 44, padding: 0, border: 0, color: "var(--orange)" }}
            onClick={async () => { await signOut(); router.replace("/login"); }}>{vi ? "Đăng xuất" : "Sign out"}</button>
        </div>
      )}
    </div>
  );
}
