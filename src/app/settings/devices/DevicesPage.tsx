"use client";
// Settings → Devices (board 5.4): every salon device with its job (front desk / time clock / walk-in kiosk), last seen,
// rename, change job, owner signs one out. "Use this device as…" sets up the one in your hand.
// (QR set-up from the owner's phone comes next: it needs a device login of its own.)
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Chip, Drawer, Field, ListGroup, Toast } from "@/components/kit";
import { forgetDevice, getDevice, makeSalonDevice, rpc } from "@/lib/auth";
import SettingsShell, { type Access } from "../SettingsShell";

type Kind = "front_desk" | "clock" | "kiosk";
type Dev = { id: string; name: string; kind: Kind | "owner"; last_seen: string | null; created_at: string; set_up_by: string | null };
const HOME: Record<Kind, string> = { front_desk: "/desk", clock: "/clock", kiosk: "/kiosk" };

export default function DevicesPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.devices")}>{(a) => <Devices a={a} />}</SettingsShell>;
}

function Devices({ a }: { a: Access }) {
  const t = useTranslations("settings.dev");
  const f = useFormatter();
  const [list, setList] = useState<Dev[] | null>(null);
  const [edit, setEdit] = useState<Dev | null>(null);
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

  const seen = (iso: string | null) => (!iso ? t("never") : Date.now() - new Date(iso).getTime() < 120_000 ? t("now") : f.relativeTime(new Date(iso), new Date()));
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
      <ListGroup>
        {list.map((d) => (
          <button key={d.id} type="button" className="opt set-row" data-testid={`device-${d.name}`} onClick={() => setEdit(d)}>
            <span className="av" aria-hidden>{d.kind === "clock" ? "C" : d.kind === "kiosk" ? "K" : "D"}</span>
            <span className="g" style={{ flex: 1, minWidth: 0 }}><b>{d.name}{thisOne?.id === d.id ? ` · ${t("thisOne")}` : ""}</b>
              <span className="cap">{t(`kind.${d.kind}`)}{d.kind in HOME ? ` · ${HOME[d.kind as Kind]}` : ""}{d.set_up_by ? ` · ${t("by", { name: d.set_up_by })}` : ""}</span></span>
            <span className="cap set-pay">{seen(d.last_seen)}</span>
          </button>
        ))}
        {!list.length && <div className="row"><span className="cap">{t("none")}</span></div>}
      </ListGroup>

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
      <div className="cap">{t("works")}</div>
      {err && <p className="hint err">{err}</p>}

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
