"use client";
// Settings → Support (Founder Admin A2/A4, issue #21): the owner lets the PolishOS team (Oliver, Elang) into the salon for
// 24 hours, sees it's on + time left, ends it any time, and sees every step support took (what + when).
// Server: support_grant / support_end / support_status (migration 20261220000001_support_access). Only the owner can turn it on.
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Field, ListGroup, Row, Tag, Toast } from "@/components/kit";
import { rpc } from "@/lib/auth";
import SettingsShell, { type Access } from "../SettingsShell";

type Status = {
  on: boolean; until: string | null; since: string | null; reason: string | null; grantedBy: string | null;
  log: { at: string; action: string; what: string | null }[];
  past: { from: string; to: string; ended: "early" | "timed_out" }[];
};
const OFF: Status = { on: false, until: null, since: null, reason: null, grantedBy: null, log: [], past: [] };

export default function SupportPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.support")}>{(a) => <Support a={a} />}</SettingsShell>;
}

function Support({ a }: { a: Access }) {
  const t = useTranslations("settings.support");
  const f = useFormatter();
  const [s, setS] = useState<Status | null>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [, tick] = useState(0);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    if (a.demo) { setS((cur) => cur ?? OFF); return; }
    try { setS(await rpc<Status>("support_status", { p_salon: a.salonId })); } catch (e) { setErr((e as Error).message); }
  }, [a.demo, a.salonId]);
  useEffect(() => { void load(); }, [load]);
  // time left counts down; when it runs out the window is closed by the server too
  useEffect(() => { const h = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(h); }, []);

  const turnOn = async () => {
    setErr(""); setBusy(true);
    try {
      if (a.demo) {
        const now = new Date();
        setS({ ...OFF, on: true, since: now.toISOString(), until: new Date(now.getTime() + 864e5).toISOString(), reason: why, grantedBy: "Mai Nguyen",
          log: [{ at: now.toISOString(), action: "support.on", what: null }] });
      } else { await rpc("support_grant", { p_salon: a.salonId, p_reason: why }); await load(); }
      setWhy(""); say(t("onToast"));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const end = async () => {
    setErr(""); setBusy(true);
    try {
      if (a.demo && s) setS({ ...s, on: false, until: null, log: [{ at: new Date().toISOString(), action: "support.off", what: null }, ...s.log] });
      else { await rpc("support_end", { p_salon: a.salonId }); await load(); }
      say(t("offToast"));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!s) return err ? <p className="hint err">{err}</p> : null;
  const live = s.on && !!s.until && new Date(s.until).getTime() > Date.now();
  const left = live ? Math.max(0, new Date(s.until!).getTime() - Date.now()) : 0;
  const hours = Math.floor(left / 36e5), mins = Math.floor((left % 36e5) / 6e4);
  const when = (iso: string) => f.dateTime(new Date(iso), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const label = (x: Status["log"][number]) => x.action === "support.on" ? t("logOn") : x.action === "support.off" ? t("logOff")
    : x.action === "support.change" ? t("logChange", { what: x.what ?? "" }) : x.action;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }} data-testid="support-page">
      {a.demo && <div className="demo">{t("demo")}</div>}
      <section className="card pad" style={{ gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="h2" style={{ flex: 1 }}>{t("title")}</div>
          {live ? <Tag tone="jade">{t("on")}</Tag> : <Tag>{t("off")}</Tag>}
        </div>
        <p className="cap">{t("what")}</p>
        {live ? (
          <>
            <div className="note" data-testid="support-on">{t("onFor", { h: hours, m: mins, until: when(s.until!) })}{s.reason ? ` · ${s.reason}` : ""}</div>
            <div><Button onClick={() => void end()} disabled={busy} data-testid="support-end">{t("endNow")}</Button></div>
          </>
        ) : a.owner ? (
          <>
            <Field id="support-why" label={t("why")} placeholder={t("whyHint")} value={why} onChange={(e) => setWhy(e.target.value)} />
            <div><Button variant="primary" onClick={() => void turnOn()} disabled={busy} data-testid="support-on-btn">{t("turnOn")}</Button></div>
          </>
        ) : <p className="cap">{t("ownerOnly")}</p>}
        {err && <p className="hint err" role="alert">{err}</p>}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="eyebrow">{t("rules")}</div>
        <ListGroup>
          <Row size="s" title={t("rule1")} />
          <Row size="s" title={t("rule2")} />
          <Row size="s" title={t("rule3")} />
          <Row size="s" title={t("rule4")} />
        </ListGroup>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="eyebrow">{t("log")}</div>
        <ListGroup data-testid="support-log">
          {s.log.map((x, i) => <Row key={i} size="s" title={label(x)} right={<span className="cap">{when(x.at)}</span>} />)}
          {!s.log.length && <Row size="s" title={<span className="cap">{t("noLog")}</span>} />}
        </ListGroup>
        {!!s.past.length && <p className="cap">{t("past", { n: s.past.length })}</p>}
      </section>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
