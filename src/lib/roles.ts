"use client";
// Roles + permissions the owner sets (Settings → Roles + permissions). Same rules as the database (_role_can):
// owner = everything; manager / front desk = the defaults below unless the owner changed them; tech = never an OK.
// One copy per salon, cached on the device so screens decide instantly (and offline).
import { useEffect, useState } from "react";
import { rpc, type Role } from "@/lib/auth";

export const OK_PERMS = ["ok.discount", "ok.refund", "ok.close", "ok.client", "ok.menu"] as const;
export const SET_PERMS = ["set.salon", "set.team", "set.pay", "set.clients", "set.money", "set.safety"] as const;
export type Perm = (typeof OK_PERMS)[number] | (typeof SET_PERMS)[number];
export type EditRole = "manager" | "front_desk";
export type RolePerms = Partial<Record<EditRole, Partial<Record<Perm, boolean>>>>;
export type OkPurpose = "discount" | "refund" | "close" | "client" | "menu";

/** What a role may do before the owner changes anything (= how the app worked before this page). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- same shape as the database's _role_perm_default(role, perm)
export function permDefault(role: Role, perm: Perm): boolean {
  if (role === "owner") return true;
  if (role === "manager") return true;
  return false; // front desk + tech: no OKs, no Settings
}

/** May this role do it in this salon? Front desk never opens Settings; techs never OK anything. */
export function can(perms: RolePerms | null | undefined, role: Role, perm: Perm): boolean {
  if (role === "owner") return true;
  if (role !== "manager" && role !== "front_desk") return false;
  if (role === "front_desk" && perm.startsWith("set.")) return false;
  const v = perms?.[role]?.[perm];
  return typeof v === "boolean" ? v : permDefault(role, perm);
}
export const canOk = (perms: RolePerms | null | undefined, role: Role, purpose: OkPurpose) => can(perms, role, `ok.${purpose}`);

/** Only what differs from the defaults (what role_perms_save keeps). */
export function diffFromDefaults(p: RolePerms): RolePerms {
  const out: RolePerms = {};
  for (const r of ["manager", "front_desk"] as EditRole[]) {
    const one: Partial<Record<Perm, boolean>> = {};
    for (const k of [...OK_PERMS, ...SET_PERMS]) {
      if (r === "front_desk" && k.startsWith("set.")) continue;
      const v = p[r]?.[k];
      if (typeof v === "boolean" && v !== permDefault(r, k)) one[k] = v;
    }
    if (Object.keys(one).length) out[r] = one;
  }
  return out;
}

const KEY = (salon: string) => `nailpos.roles.${salon}`;
export function cachedPerms(salon: string): RolePerms {
  try { return JSON.parse(localStorage.getItem(KEY(salon)) ?? "{}") as RolePerms; } catch { return {}; }
}
export function storePerms(salon: string, p: RolePerms) { try { localStorage.setItem(KEY(salon), JSON.stringify(p)); } catch { /* storage blocked */ } }

/** The salon's permissions: device copy first, then the server once (test copy = device only). */
export function useRolePerms(salonId: string | null | undefined, demo = false) {
  const [perms, setPerms] = useState<RolePerms>({});
  useEffect(() => {
    if (!salonId) return;
    setPerms(cachedPerms(salonId));
    if (demo || salonId === "demo") return;
    let live = true;
    void rpc<RolePerms>("role_perms_get", { p_salon: salonId }).then((p) => { if (!live) return; const v = p ?? {}; storePerms(salonId, v); setPerms(v); }).catch(() => { /* offline: keep the copy */ });
    return () => { live = false; };
  }, [salonId, demo]);
  return perms;
}
