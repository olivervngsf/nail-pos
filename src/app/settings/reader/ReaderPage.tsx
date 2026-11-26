"use client";
// Settings → Card reader: the salon's Stripe readers (online / offline), add one by its 3-word pairing code, remove one.
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Banner, Button } from "@/components/kit";
import { api } from "@/lib/api";
import SettingsShell, { type Access } from "../SettingsShell";

type Reader = { id: string; label: string; simulated: boolean; status: string; device: string };
type List = { on?: boolean; connected?: boolean; test?: boolean; readers: Reader[] };

export default function ReaderPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.reader")}>{(a) => <Readers a={a} />}</SettingsShell>;
}

function Readers({ a }: { a: Access }) {
  const t = useTranslations("settings.reader");
  const [list, setList] = useState<List | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("Front desk");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr("");
    if (a.demo) { setList((c) => c ?? { on: true, connected: true, test: true, readers: [{ id: "tmr_demo", label: "Front desk", simulated: true, status: "online", device: "Stripe Reader S710" }] }); return; }
    try { setList(await api<List>(`/api/stripe/reader?salonId=${a.salonId}`)); } catch (e) { setErr((e as Error).message); }
  }, [a.demo, a.salonId]);
  useEffect(() => { void load(); }, [load]);

  const ok = code.trim().split(/[-\s]+/).filter(Boolean).length === 3;
  const pair = async (c: string) => {
    setBusy(true); setErr("");
    try {
      if (!a.demo) await api("/api/stripe/reader", { salonId: a.salonId, code: c, label: label.trim() || "Front desk" });
      setCode(""); await load();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const remove = async (r: Reader) => {
    if (!confirm(t("removeAsk", { name: r.label }))) return;
    setBusy(true); setErr("");
    try {
      if (a.demo) setList((c) => c && { ...c, readers: c.readers.filter((x) => x.id !== r.id) });
      else { await api("/api/stripe/reader", { salonId: a.salonId, remove: r.id }); await load(); }
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  if (!list && !err) return <p className="cap" role="status">{t("loading")}</p>;
  const noStripe = list && (list.on === false || !list.connected);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }} data-testid="settings-reader">
      {noStripe && <Banner tone="info">{list?.on === false ? t("off") : <>{t("needStripe")} <Link href="/settings/payments">{t("toPayments")}</Link></>}</Banner>}
      {list && list.readers.length > 0 && <div className="group">
        {list.readers.map((r) => (
          <div key={r.id} className="row" style={{ gap: 12 }}>
            <span className="g" style={{ flex: 1 }}><b>{r.label}</b><span className="cap" style={{ display: "block" }}>{r.simulated ? t("testReader") : r.device}</span></span>
            <span className={`pill ${r.status === "online" ? "ok" : "warn"}`}>{r.status === "online" && <span className="dot" aria-hidden />}{r.status === "online" ? t("online") : r.status === "offline" ? t("offline") : t("unknown")}</span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(r)}>{t("remove")}</Button>
          </div>
        ))}
      </div>}
      {list && !list.readers.length && !noStripe && <p className="cap" style={{ margin: 0 }}>{t("none")}</p>}
      {!noStripe && <div className="card pad" style={{ gap: 12 }}>
        <b>{list?.readers.length ? t("addAnother") : t("add")}</b>
        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
          <li>{t("s1")}</li><li>{t("s2")}</li><li>{t("s3")}</li>
        </ol>
        <div className="grid2" style={{ gap: 12 }}>
          <div><label className="lbl" htmlFor="rc">{t("code")}</label><input className="inp" id="rc" placeholder="tempo-quote-lima" autoCapitalize="none" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="rl">{t("name")}</label><input className="inp" id="rl" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="primary" disabled={!ok || busy} onClick={() => void pair(code)}>{t("connect")}</Button>
          {list?.test && <Button variant="ghost" disabled={busy} onClick={() => void pair("simulated-s710")}>{t("useTest")}</Button>}
        </div>
      </div>}
      {err && <div className="hint err" role="alert">{err}</div>}
      <Button style={{ alignSelf: "flex-start" }} onClick={() => void load()} disabled={busy}>{t("refresh")}</Button>
    </div>
  );
}
