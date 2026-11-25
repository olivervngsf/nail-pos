"use client";
// Settings → Salon address (owner/manager). Needed for card payments: Stripe makes the salon's card "location" from
// street, city, state and ZIP. Shows what it read from the line typed, so a missing ZIP is plain before saving.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/kit";
import { api } from "@/lib/api";
import { addressOk, parseAddress } from "@/lib/stripe/address";
import SettingsShell, { type Access } from "../SettingsShell";

export default function SalonAddressPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.salon")}>{(a) => <Address a={a} />}</SettingsShell>;
}

const DEMO = { address: "1550 S Bascom Ave, Campbell, CA 95008", state: "CA" };

function Address({ a }: { a: Access }) {
  const t = useTranslations("settings.salon");
  const [state, setState] = useState("CA");
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (a.demo) { setSaved(DEMO.address); setText(DEMO.address); return; }
    void api<{ address: string; state: string }>(`/api/salon/address?salonId=${a.salonId}`)
      .then((r) => { setSaved(r.address); setText(r.address); setState(r.state); })
      .catch((e: Error) => { setSaved(""); setErr(e.message); });
  }, [a.demo, a.salonId]);

  const p = parseAddress(text, state);
  const ok = addressOk(p);
  const missing = [p.line1 === "Salon" && t("street"), !p.city && t("city"), !p.postal_code && t("zip")].filter(Boolean) as string[];
  const changed = text.trim() !== (saved ?? "").trim();

  const save = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      if (!a.demo) {
        const r = await api<{ address: string; stripe: string }>("/api/salon/address", { salonId: a.salonId, address: text });
        setText(r.address); setSaved(r.address);
        setMsg(r.stripe === "failed" ? t("savedStripeFailed") : t("saved"));
      } else { setSaved(text); setMsg(t("saved")); }
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  if (saved === null) return <p className="cap" role="status">{t("loading")}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }} data-testid="settings-salon">
      <p style={{ margin: 0, fontSize: 15 }}>{t("why")}</p>
      {!addressOk(parseAddress(saved, state)) && <div className="banner" role="status" data-testid="address-needed">{t("needed")}</div>}
      <div className="card pad" style={{ gap: 12 }}>
        <label className="lbl" htmlFor="addr">{t("label")}</label>
        <input className="inp" id="addr" data-testid="address-input" autoComplete="street-address" placeholder="1550 S Bascom Ave, Campbell, CA 95008"
          value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }} />
        <div className="group" data-testid="address-parts">
          <div className="row"><span className="grow cap">{t("street")}</span><b>{p.line1 === "Salon" ? "—" : p.line1}</b></div>
          <div className="row"><span className="grow cap">{t("city")}</span><b>{p.city || "—"}</b></div>
          <div className="row"><span className="grow cap">{t("state")}</span><b>{p.state}</b></div>
          <div className="row"><span className="grow cap">{t("zip")}</span><b>{p.postal_code || "—"}</b></div>
        </div>
        <div className="cap" data-testid="address-check" style={{ color: ok ? undefined : "#b5470a" }}>
          {ok ? t("ready") : t("missing", { parts: missing.join(", ") })}
        </div>
        <div><Button variant="primary" data-testid="address-save" disabled={!ok || !changed || busy} onClick={() => void save()}>{busy ? t("saving") : t("save")}</Button></div>
      </div>
      {msg && <div className="hint" role="status" data-testid="address-saved">{msg}</div>}
      {err && <div className="hint err" role="alert">{err}</div>}
      {a.demo && <div className="demo">{t("demo")}</div>}
    </div>
  );
}
