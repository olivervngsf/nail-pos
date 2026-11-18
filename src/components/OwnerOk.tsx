"use client";
// Owner/manager OK before a protected change (client details, adding to the menu…).
// Salon device: pick who approves + their PIN. Owner/manager on their own login: no keypad, the OK is asked for on save.
// Anyone else on their own login: not allowed. The server checks the OK again and uses it once (approve_discount + purpose).
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, ListGroup, PinKeypad } from "@/components/kit";
import { ROLE_LABEL, getDevice, pinMessage, rpc, type PinResult, type Role } from "@/lib/auth";
import { pinLenFor } from "@/lib/pin";

export type OkScope = { mode: "demo" | "live"; salonId: string; role: Role };
export type OkPurpose = "client" | "menu";
type Approver = { id: string; name: string; role: Role };

export function useOwnerOk(scope: OkScope, needed: boolean, purpose: OkPurpose) {
  const device = getDevice();
  const admin = scope.role === "owner" || scope.role === "manager";
  const gate: "free" | "self" | "pin" | "denied" = !needed ? "free" : scope.mode === "demo" || device ? "pin" : admin ? "self" : "denied";
  const [okd, setOkd] = useState<{ approvalId?: string; name: string } | null>(null);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [approver, setApprover] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (gate !== "pin") return;
    if (scope.mode === "demo") { setApprovers([{ id: "demo", name: "Mai", role: "owner" }]); setApprover("demo"); return; }
    void rpc<{ membership_id: string; display_name: string; role: Role }[]>("desk_staff", { p_salon: scope.salonId }).then((r) => {
      const a = r.filter((s) => s.role === "owner" || s.role === "manager").map((s) => ({ id: s.membership_id, name: s.display_name, role: s.role }));
      setApprovers(a);
      if (a.length === 1) setApprover(a[0].id);
    }).catch(() => setErr("offline"));
  }, [gate, scope.mode, scope.salonId]);
  const checkPin = async (pin: string) => {
    setErr("");
    if (scope.mode === "demo") return setOkd({ name: "Mai" });
    if (!navigator.onLine || !device || !approver) return setErr("offline");
    try {
      const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", { p_salon: scope.salonId, p_device: device.id, p_membership: approver, p_pin: pin, p_purpose: purpose });
      if (!r.ok) return setErr((r.reason as string) === "not_manager" ? "not_manager" : pinMessage(r));
      setOkd({ approvalId: r.approval_id, name: r.name ?? "" });
    } catch { setErr("offline"); }
  };
  /** The approval to send with the save (own-login owner/manager: asked for right now). */
  const approvalId = async (): Promise<string | undefined> => {
    if (gate === "self") {
      const r = await rpc<PinResult & { approval_id?: string }>("approve_discount", { p_salon: scope.salonId, p_purpose: purpose });
      if (!r.ok) throw new Error("not_manager");
      return r.approval_id;
    }
    return okd?.approvalId;
  };
  return { gate, open: gate === "free" || gate === "self" || !!okd, okd, approvers, approver, setApprover, err, checkPin, approvalId };
}
export type OwnerOk = ReturnType<typeof useOwnerOk>;

/** Who approves → their PIN. `deniedText` shows when this login can't approve at all. */
export function OwnerOkPanel({ ok, deniedText }: { ok: OwnerOk; deniedText: string }) {
  const t = useTranslations("clients");
  const msg = (e: string) => (e === "offline" ? t("okOffline") : e === "not_manager" ? deniedText : e);
  if (ok.gate === "denied") return <div className="hint err" data-testid="owner-ok-denied">{deniedText}</div>;
  if (!ok.approver) return <>
    <span className="cap">{t("okWho")}</span>
    <ListGroup>{ok.approvers.map((m) => <button key={m.id} type="button" className="opt" onClick={() => ok.setApprover(m.id)}><Avatar name={m.name} />{m.name}<span className="cap">{ROLE_LABEL[m.role]}</span></button>)}</ListGroup>
    {ok.err && <span className="hint err">{msg(ok.err)}</span>}
  </>;
  return <><span className="cap">{t("okPin")}</span><PinKeypad length={pinLenFor(ok.approver)} error={ok.err ? msg(ok.err) : undefined} onDone={(pin) => void ok.checkPin(pin)} /></>;
}
