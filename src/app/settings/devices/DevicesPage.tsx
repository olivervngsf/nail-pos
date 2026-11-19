"use client";
// Settings → Devices (board 5.4): every salon device with its job (front desk / time clock / walk-in kiosk), last seen,
// rename, change job, owner signs one out. "Use this device as…" sets up the one in your hand.
// "+ Add a device" = QR set-up: the owner's phone shows a QR, the tablet scans it (or types the code at /go) and gets its
// own login. Owner signing it out here stops it at once.
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Chip, Drawer, Field, Toast } from "@/components/kit";
import { DEVICE_HOME, forgetDevice, getDevice, makeSalonDevice, rpc, type DeviceKind } from "@/lib/auth";
import DeviceMark from "@/components/DeviceMark";
import { deviceState, devicesOn } from "@/lib/devices";
import SettingsShell, { type Access } from "../SettingsShell";

type Kind = DeviceKind;
type Dev = { id: string; name: string; kind: Kind | "owner"; last_seen: string | null; created_at: string; set_up_by: string | null };
const HOME = DEVICE_HOME;

export default function DevicesPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.devices")}>{(a) => <Devices a={a} />}</SettingsShell>;
}

function AddDevice({ a, onClose, onDone }: { a: Access; onClose: () => void; onDone: (d: { id: string; name: string; kind: Kind }) => void }) {
  const t = useTranslations("settings.dev");
  const [kind, setKind] = useState<Kind>("front_desk");
  const [name, setName] = useState(t("kind.front_desk"));
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [svg, setSvg] = useState("");
  const [left, setLeft] = useState(600);
  const [err, setErr] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(poll.current), []);

  const make = async () => {
    setErr("");
    try {
      const c = a.demo ? { code: "DEMO2345", expires_at: new Date(Date.now() + 600_000).toISOString() }
        : await rpc<{ code: string; expires_at: string }>("device_code_make", { p_salon: a.salonId, p_kind: kind, p_name: name.trim() });
      setCode(c);
      setSvg(await QRCode.toString(`${location.origin}/go?c=${c.code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
      clearInterval(poll.current);
      let n = 0;
      poll.current = setInterval(() => {
        n++;
        const s = Math.max(0, Math.round((new Date(c.expires_at).getTime() - Date.now()) / 1000));
        setLeft(s);
        if (s <= 0) { clearInterval(poll.current); return; }
        if (a.demo || n % 3) return; // check every 3 s
        void rpc<{ used: boolean; expired: boolean; device: { id: string; name: string; kind: Kind } | null }>("device_code_check", { p_code: c.code })
          .then((r) => { if (r?.used && r.device) { clearInterval(poll.current); onDone(r.device); } }).catch(() => {});
      }, 1000);
    } catch (e) { setErr((e as Error).message); }
  };

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <Drawer title={t("addTitle")} onClose={onClose} footer={code
      ? <><Button onClick={onClose}>{t("close")}</Button><Button block onClick={() => void make()}>{t("newCode")}</Button></>
      : <><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" block data-testid="qr-make" disabled={!name.trim()} onClick={() => void make()}>{t("showQr")}</Button></>}>
      {!code ? (
        <>
          <div><span className="lbl">{t("job")}</span>
            <div className="set-chips">{(["front_desk", "clock", "kiosk"] as Kind[]).map((k) => <Chip key={k} on={kind === k} onClick={() => { setKind(k); setName(t(`kind.${k}`)); }}>{t(`kind.${k}`)}</Chip>)}</div>
            <div className="cap" style={{ marginTop: 6 }}>{t(`jobNote.${kind}`)}</div></div>
          <Field id="qr-name" label={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="cap">{t("qrHow")}</div>
        </>
      ) : (
        <div className="dev-qr" data-testid="qr-box">
          {left > 0 ? <>
            <span aria-label={t("qrAlt")} role="img" dangerouslySetInnerHTML={{ __html: svg }} />
            <b>{t("scan", { name })}</b>
            <span className="cap">{t("orType", { site: location.host })}</span>
            <span className="go-code" data-testid="qr-code">{code.code.slice(0, 4)}-{code.code.slice(4)}</span>
            <span className="cap">{t("waiting", { t: mmss })}</span>
          </> : <b>{t("expired")}</b>}
          {a.demo && <div className="demo">{t("qrDemo")}</div>}
        </div>
      )}
      {err && <p className="hint err">{err}</p>}
    </Drawer>
  );
}

function Devices({ a }: { a: Access }) {
  const t = useTranslations("settings.dev");
  const f = useFormatter();
  const [list, setList] = useState<Dev[] | null>(null);
  const [edit, setEdit] = useState<Dev | null>(null);
  const [adding, setAdding] = useState(false);
  const [here, setHere] = useState(() => getDevice());
  const [newName, setNewName] = useState("Front desk");
  const [newKind, setNewKind] = useState<Kind>("front_desk");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    if (a.demo) {
      const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
      setList((cur) => cur ?? [
        { id: "d1", name: "Front desk iPad", kind: "front_desk", last_seen: ago(0), created_at: ago(20000), set_up_by: "Mai Nguyen" },
        { id: "d2", name: "Back room tablet", kind: "clock", last_seen: ago(2), created_at: ago(9000), set_up_by: "Mai Nguyen" },
        { id: "d3", name: "Door kiosk", kind: "kiosk", last_seen: ago(1500), created_at: ago(9000), set_up_by: "Bao Tran" },
      ]);
      return;
    }
    try { setList(await rpc<Dev[]>("devices_list", { p_salon: a.salonId })); } catch (e) { setErr((e as Error).message); }
  }, [a.demo, a.salonId]);
  useEffect(() => { void load(); }, [load]);

  // On / off is worked out from the last "I'm on" signal; re-checked every minute so a tile turns off by itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const h = setInterval(() => { setNow(Date.now()); void load(); }, 60_000); return () => clearInterval(h); }, [load]);
  const thisOne = here && here.salonId === a.salonId ? here : null;

  const setUpHere = async () => {
    setErr("");
    try {
      if (a.demo) { say(t("ready", { name: newName })); return; }
      const d = await makeSalonDevice(a.salonId, newName || t("kind.front_desk"));
      if (newKind !== "front_desk") await rpc("device_save", { p_device: d.id, p_name: d.name, p_kind: newKind });
      setHere(d); say(t("ready", { name: d.name })); void load();
      location.href = HOME[newKind];
    } catch (e) { setErr((e as Error).message); }
  };

  if (err && !list) return <p className="hint err">{err}</p>;
  if (!list) return <div aria-busy="true" />;
  return (
    <>
      <section className="card pad dv-card" data-testid="device-list">
        <div className="dv-head">
          <b>{t("title")}</b>
          {list.length > 0 && <span className={`ad-pill ${devicesOn(list.map((d) => d.last_seen), now) === list.length ? "good" : "warn"}`} data-testid="devices-on">{t("count", { on: devicesOn(list.map((d) => d.last_seen), now), all: list.length })}</span>}
        </div>
        <div className="dv-grid">
          {list.map((d) => {
            const st = deviceState(d.last_seen, now);
            return (
              <button key={d.id} type="button" className={`dv-tile is-${st}`} data-testid={`device-${d.name}`} data-state={st} onClick={() => setEdit(d)}>
                <span className="dv-state"><DeviceMark state={st} size={22} /><span className={`ad-pill ${st === "on" ? "good" : st === "off" ? "warn" : ""}`}>{t(st === "on" ? "on" : st === "off" ? "off" : "neverOn")}</span></span>
                <b>{d.name}{thisOne?.id === d.id ? ` · ${t("thisOne")}` : ""}</b>
                <span className="cap">{t(`kind.${d.kind}`)}{d.set_up_by ? ` · ${t("by", { name: d.set_up_by })}` : ""}</span>
                {st === "off" && d.last_seen && <span className="cap">{t("lastOn", { when: f.relativeTime(new Date(d.last_seen), new Date(now)) })}</span>}
              </button>
            );
          })}
        </div>
        {!list.length && <span className="cap">{t("none")}</span>}
        {list.length > 0 && <span className="cap">{t("onMeans")}</span>}
      </section>

      {!thisOne && (
        <section className="card pad" style={{ gap: 10 }}>
          <b>{t("useHere")}</b>
          <span className="cap">{t("useHereNote", { salon: a.salonName })}</span>
          <div className="set-chips">{(["front_desk", "clock", "kiosk"] as Kind[]).map((k) => <Chip key={k} on={newKind === k} onClick={() => { setNewKind(k); setNewName(t(`kind.${k}`)); }}>{t(`kind.${k}`)}</Chip>)}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="inp" style={{ maxWidth: 240 }} aria-label={t("name")} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button variant="primary" data-testid="use-here" onClick={() => void setUpHere()}>{t("useHereBtn")}</Button>
          </div>
        </section>
      )}
      <Button variant="primary" data-testid="add-device" onClick={() => setAdding(true)}>{t("add")}</Button>
      <div className="cap">{t("works")}</div>
      {err && <p className="hint err">{err}</p>}

      {adding && <AddDevice a={a} onClose={() => setAdding(false)}
        onDone={(d) => { setAdding(false); say(t("ready", { name: d.name })); void load(); }} />}
      {edit && <DeviceDrawer a={a} d={edit} isHere={thisOne?.id === edit.id} onClose={() => setEdit(null)}
        onDone={(msg, signedOut) => {
          setEdit(null); say(msg);
          if (signedOut && thisOne?.id === edit.id) { forgetDevice(); setHere(null); }
          if (a.demo) setList((cur) => signedOut ? (cur ?? []).filter((x) => x.id !== edit.id) : cur); else void load();
        }} />}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}

function DeviceDrawer({ a, d, isHere, onClose, onDone }: { a: Access; d: Dev; isHere: boolean; onClose: () => void; onDone: (msg: string, signedOut?: boolean) => void }) {
  const t = useTranslations("settings.dev");
  const [name, setName] = useState(d.name);
  const [kind, setKind] = useState<Kind>(d.kind === "owner" ? "front_desk" : d.kind);
  const [err, setErr] = useState("");
  const save = async () => {
    try { if (!a.demo) await rpc("device_save", { p_device: d.id, p_name: name, p_kind: kind }); onDone(t("saved")); if (isHere && kind !== d.kind) location.href = HOME[kind]; }
    catch (e) { setErr((e as Error).message); }
  };
  const out = async () => {
    if (!confirm(t("outAsk", { name: d.name }))) return;
    try { if (!a.demo) await rpc("device_archive", { p_device: d.id }); onDone(t("out", { name: d.name }), true); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Drawer title={d.name} onClose={onClose} footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" block onClick={() => void save()} disabled={!name.trim()}>{t("save")}</Button></>}>
      <Field id="dev-name" label={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
      <div><span className="lbl">{t("job")}</span>
        <div className="set-chips">{(["front_desk", "clock", "kiosk"] as Kind[]).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{t(`kind.${k}`)}</Chip>)}</div>
        <div className="cap" style={{ marginTop: 6 }}>{t(`jobNote.${kind}`)}</div></div>
      <div className="cap">{t("setUp", { by: d.set_up_by ?? "—" })}</div>
      {a.owner
        ? <Button data-testid="device-out" style={{ color: "var(--orange)" }} onClick={() => void out()}>{t("signOut")}</Button>
        : <div className="cap">{t("ownerOut")}</div>}
      {err && <p className="hint err">{err}</p>}
    </Drawer>
  );
}
