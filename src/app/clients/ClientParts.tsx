"use client";
// Shared pieces for Clients (C1–C2) and Client history (H1–H2): stats, care box, edit drawer, photo button, money words.
import { pinLenFor } from "@/lib/pin";
import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Button, Drawer, Field, ListGroup, PinKeypad } from "@/components/kit";
import { ROLE_LABEL, e164, getDevice, pinMessage, rpc, type PinResult, type Role } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { addPhoto, everyWeeks, saveClient, type Profile, type Visit, type Who } from "@/lib/clients";

export const $ = formatCents;
export const initials = (n: string) => n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
export const phone = (p: string | null) => (p ? fmtPhone(p) : "");

export function Stats({ p }: { p: Profile }) {
  const t = useTranslations("clients");
  const wk = everyWeeks(p.stats.gap_days);
  const s: [string, string][] = [
    [String(p.stats.visits), t("sVisits")], [$(Number(p.stats.spent)).replace(/\.00$/, ""), t("sSpent")], [$(Number(p.stats.avg)).replace(/\.00$/, ""), t("sAvg")],
    [wk ? t("weeks", { n: wk }) : "—", p.tag === "lost" ? t("sCameEvery") : t("sEvery")], [$(Number(p.stats.avg_tip)).replace(/\.00$/, ""), t("sTip")],
  ];
  return (
    <div className="cl-stats" data-testid="client-stats">
      {s.map(([v, l]) => <div key={l} className="cl-stat"><b className="num">{v}</b><span className="cap">{l}</span></div>)}
    </div>
  );
}

export function CareBox({ care }: { care: string }) {
  const t = useTranslations("clients");
  if (!care) return null;
  return <div className="card cl-care" data-testid="client-care"><b>▲ {t("care")}:</b> {care}</div>;
}

export function TagChip({ tag }: { tag: Profile["tag"] }) {
  const t = useTranslations("clients");
  if (!tag) return null;
  return <span className={`tag ${tag === "regular" ? "jade" : ""} ${tag === "lost" ? "cl-lost" : ""}`}>{t(`tag_${tag}`)}</span>;
}

/** How a visit was paid, in plain words (tip + card fee shown). */
export function PaidWords({ v }: { v: Visit }) {
  const t = useTranslations("clients");
  const pays = v.payments ?? [];
  const parts = pays.map((p) => p.method === "cash" ? t("payCash", { amount: $(Number(p.cents)) })
    : p.method === "gift_card" ? t("payGift", { amount: $(Number(p.cents)), last4: p.last4 ?? "" })
    : t("payCard", { amount: $(Number(p.cents)), card: p.brand ? `${p.brand.toUpperCase()} ••${p.last4 ?? ""}` : t("link"), fee: $(Number(p.fee)) }));
  return <span>{parts.join(" · ") || "—"}{Number(v.tip) > 0 ? ` · ${t("tipWas", { amount: $(Number(v.tip)) })}` : ""}{Number(v.discount) > 0 ? ` · ${t("discWas", { amount: $(Number(v.discount)) })}` : ""}</span>;
}

export function useDate() {
  const f = useFormatter();
  return (iso: string | null, long = false) => (iso ? f.dateTime(new Date(iso), long ? { dateStyle: "medium" } : { month: "short", day: "numeric" }) : "—");
}

/** + Photo: opens the camera on a phone, file picker on a computer. */
export function PhotoButton({ who, p, ticketId, onDone, say }: { who: Who; p: Profile; ticketId: string | null; onDone: () => void; say: (s: string) => void }) {
  const t = useTranslations("clients");
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return <>
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => ref.current?.click()} data-testid="add-photo">{busy ? t("uploading") : t("addPhoto")}</Button>
    <input ref={ref} type="file" accept="image/*" capture="environment" hidden aria-label={t("addPhoto")} onChange={async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setBusy(true);
      try { await addPhoto(who, p, file, ticketId); say(t("photoSaved")); onDone(); } catch (err) { say(navigator.onLine ? (err as Error).message : t("needNet")); }
      setBusy(false);
    }} />
  </>;
}

/** Who gets the Edit button: an owner/manager on their own login, or any salon device (a manager PIN then gates it). */
export const canEditClient = (who: Who) => who.mode === "demo" || who.role === "owner" || who.role === "manager" || !!getDevice();

type Approver = { id: string; name: string; role: Role };

/** Changing someone already on file needs an owner/manager OK first: their PIN on the salon device, or (owner/manager on
 *  their own login) one tap. The server checks it again and uses it once. Adding a new client needs no OK. */
function useClientOk(who: Who, needed: boolean) {
  const device = getDevice();
  const admin = who.role === "owner" || who.role === "manager";
  const gate: "free" | "self" | "pin" | "denied" = !needed ? "free" : who.mode === "demo" || device ? "pin" : admin ? "self" : "denied";
  const [okd, setOkd] = useState<{ approvalId?: string; name: string } | null>(null);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [approver, setApprover] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (gate !== "pin") return;
    if (who.mode === "demo") { setApprovers([{ id: "demo", name: "Mai", role: "owner" }]); setApprover("demo"); return; }
    void rpc<{ membership_id: string; display_name: string; role: Role }[]>("desk_staff", { p_salon: who.salonId }).then((r) => {
      const a = r.filter((s) => s.role === "owner" || s.role === "manager").map((s) => ({ id: s.membership_id, name: s.display_name, role: s.role }));
      setApprovers(a);
      if (a.length === 1) setApprover(a[0].id);
    }).catch(() => setErr("offline"));
  }, [gate, who.mode, who.salonId]);
  const checkPin = async (pin: string) => {
    setErr("");
    if (who.mode === "demo") return setOkd({ name: "Mai" });
    if (!navigator.onLine || !device || !approver) return setErr("offline");
    try {
      const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", { p_salon: who.salonId, p_device: device.id, p_membership: approver, p_pin: pin, p_purpose: "client" });
      if (!r.ok) return setErr((r.reason as string) === "not_manager" ? "not_manager" : pinMessage(r));
      setOkd({ approvalId: r.approval_id, name: r.name ?? "" });
    } catch { setErr("offline"); }
  };
  /** The approval to send with the save (own-login owner/manager: asked for right now). */
  const approvalId = async (): Promise<string | undefined> => {
    if (gate === "self") {
      const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", { p_salon: who.salonId, p_purpose: "client" });
      if (!r.ok) throw new Error("not_manager");
      return r.approval_id;
    }
    return okd?.approvalId;
  };
  return { gate, open: gate === "free" || gate === "self" || !!okd, okd, approvers, approver, setApprover, err, checkPin, approvalId };
}

/** New client or edit details. Desk / owner only; editing someone on file needs an owner/manager OK. */
export function EditDrawer({ who, p, onClose, onSaved }: { who: Who; p: Profile | null; onClose: () => void; onSaved: (id: string, c: { name: string; phone: string }) => void }) {
  const t = useTranslations("clients");
  const ok = useClientOk(who, !!p);
  const okErr = (e: string) => (e === "offline" ? t("okOffline") : e === "not_manager" ? t("okOnlyAdmin") : e);
  const [f, setF] = useState({
    name: p?.name ?? "", phone: p?.phone ? fmtPhone(p.phone) : "", email: p?.email ?? "", birthday: p?.birthday?.slice(5) ?? "",
    shape: p?.shape ?? "", colors: p?.colors ?? "", care: p?.care ?? "", notes: p?.notes ?? "", textsOk: p?.texts_ok ?? false, language: p?.language ?? "en",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const bdayOk = !f.birthday || /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(f.birthday);
  const valid = (f.name.trim() || phoneOk(f.phone)) && (!f.phone || phoneOk(f.phone)) && bdayOk;
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const phone = f.phone ? e164(f.phone) : "";
      const approvalId = await ok.approvalId();
      const id = await saveClient(who, p?.id ?? null, { ...f, phone, birthday: f.birthday ? `2000-${f.birthday}` : "", language: f.language as "en" | "vi", approvalId });
      onSaved(id, { name: f.name.trim(), phone });
    } catch (e) { setErr(navigator.onLine ? okErr((e as Error).message) : t("needNet")); setBusy(false); }
  };
  const title = p ? t("editTitle", { name: p.name }) : t("newClient");
  if (!ok.open) return (
    <Drawer title={title} onClose={onClose}>
      <div className="eyebrow">{t("okTitle")}</div>
      <div className="cap">{t("okWhy")}</div>
      {ok.gate === "denied" ? <div className="hint err" data-testid="client-ok-denied">{t("okOnlyAdmin")}</div>
        : !ok.approver ? <>
            <span className="cap">{t("okWho")}</span>
            <ListGroup>{ok.approvers.map((m) => <button key={m.id} type="button" className="opt" onClick={() => ok.setApprover(m.id)}><Avatar name={m.name} />{m.name}<span className="cap">{ROLE_LABEL[m.role]}</span></button>)}</ListGroup>
            {ok.err && <span className="hint err">{okErr(ok.err)}</span>}
          </>
        : <><span className="cap">{t("okPin")}</span><PinKeypad length={pinLenFor(ok.approver)} error={ok.err ? okErr(ok.err) : undefined} onDone={(pin) => void ok.checkPin(pin)} /></>}
      <div className="cap">{t("okMore")}</div>
    </Drawer>
  );
  return (
    <Drawer title={title} onClose={onClose}
      footer={<Button variant="primary" block disabled={!valid || busy} onClick={() => void save()} data-testid="client-save">{t("save")}</Button>}>
      {ok.okd && <div className="note" data-testid="client-ok">{t("okBy", { name: ok.okd.name })}</div>}
      <Field id="cn" label={t("name")} value={f.name} onChange={set("name")} />
      <Field id="cp" label={t("phone")} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: fmtPhone(e.target.value) })} error={f.phone && !phoneOk(f.phone) ? t("phoneBad") : undefined} />
      <Field id="ce" label={t("email")} type="email" value={f.email} onChange={set("email")} />
      <Field id="cb" label={t("birthday")} placeholder="MM-DD" value={f.birthday} onChange={set("birthday")} error={bdayOk ? undefined : "MM-DD"} />
      <div>
        <label className="lbl" htmlFor="cc" style={{ color: "#C92A2A" }}>▲ {t("care")}</label>
        <textarea className="inp" id="cc" rows={2} style={{ height: "auto", padding: 12 }} placeholder={t("carePh")} value={f.care} onChange={set("care")} />
      </div>
      <Field id="cs" label={t("shape")} placeholder="Almond · short" value={f.shape} onChange={set("shape")} />
      <Field id="co" label={t("colors")} placeholder="OPI Bubble Bath, nudes" value={f.colors} onChange={set("colors")} />
      <div>
        <label className="lbl" htmlFor="cno">{t("notes")}</label>
        <textarea className="inp" id="cno" rows={3} style={{ height: "auto", padding: 12 }} value={f.notes} onChange={set("notes")} />
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={f.textsOk} onChange={(e) => setF({ ...f, textsOk: e.target.checked })} />{t("textsOk")}</label>
      <div style={{ display: "flex", gap: 8 }}>
        {(["en", "vi"] as const).map((l) => <button key={l} type="button" className={`chip ${f.language === l ? "on" : ""}`} aria-pressed={f.language === l} onClick={() => setF({ ...f, language: l })}>{l === "en" ? "English" : "Tiếng Việt"}</button>)}
      </div>
      {err && <div className="hint err">{err}</div>}
    </Drawer>
  );
}
