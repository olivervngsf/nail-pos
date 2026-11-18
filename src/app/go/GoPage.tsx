"use client";
// Tablet side of QR set-up (board 5.4): the owner's phone shows a QR → the tablet's camera opens polishosapp.com/go?c=CODE.
// No QR camera? Open polishosapp.com/go and type the 8 letters. Same on iPad, Android tablets and computers.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import { claimDevice, DEVICE_HOME } from "@/lib/auth";

const clean = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const show = (c: string) => (c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

export default function GoPage() {
  const t = useTranslations("go");
  const q = useSearchParams();
  const [code, setCode] = useState(() => clean(q.get("c") ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ name: string; salon?: string; home: string } | null>(null);
  const tried = useRef(false);

  const go = useCallback(async (c: string) => {
    if (c.length !== 8) return setErr(t("short"));
    setBusy(true); setErr("");
    try {
      const d = await claimDevice(c);
      const home = DEVICE_HOME[d.kind];
      setDone({ name: d.name, salon: d.salonName, home });
      setTimeout(() => { location.href = home; }, 1500);
    } catch (e) {
      const m = (e as Error).message;
      setErr(m === "bad_code" ? t("bad") : m === "not_set_up" ? t("notSetUp") : t("failed"));
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    if (tried.current || code.length !== 8 || !q.get("c")) return;
    tried.current = true;
    void go(code);
  }, [code, go, q]);

  return (
    <main className="go-page" data-testid="go">
      <div className="card pad go-card">
        {done ? (
          <>
            <div className="go-ok" aria-hidden>✓</div>
            <h1 className="h1" data-testid="go-done">{t("ready", { name: done.name })}</h1>
            <p className="cap">{done.salon ? t("readyNote", { salon: done.salon }) : ""}</p>
          </>
        ) : (
          <>
            <h1 className="h1">{t("title")}</h1>
            <p className="cap">{t("lead")}</p>
            <input className="inp go-code" aria-label={t("code")} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
              placeholder="ABCD-2345" value={show(code)} onChange={(e) => setCode(clean(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter") void go(code); }} data-testid="go-code" />
            <Button variant="primary" block disabled={busy || code.length !== 8} onClick={() => void go(code)} data-testid="go-btn">{busy ? t("busy") : t("btn")}</Button>
            {err && <p className="hint err" role="alert">{err}</p>}
            <p className="cap">{t("how")}</p>
          </>
        )}
      </div>
    </main>
  );
}
