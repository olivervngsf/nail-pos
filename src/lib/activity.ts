// Settings → Activity log: one list of everything that happened in the salon (PIN tries, clock in/out, money,
// clients, settings, team, devices, support). Rows come from `activity_log` (owner + manager only, read only).
// This file sorts each row into a kind, says how it should look (ok / warn / bad) and builds the CSV export.
import type { Role } from "./auth";

export type ActivityRow = {
  at: string;
  action: string;
  actor: string | null;
  actor_role: Role | null;
  subject: string | null;
  device: string | null;
  device_id: string | null;
  detail: Record<string, unknown>;
};

export const KINDS = ["pin", "clock", "money", "clients", "settings", "team", "devices", "support"] as const;
export type Kind = (typeof KINDS)[number] | "other";
export type Tone = "ok" | "warn" | "bad" | "info" | "plain";

const SETTINGS = new Set(["pin.rules", "clock.rules", "clock.wifi_added", "clock.wifi_removed", "booking.page", "loyalty.settings"]);
const TEAM = new Set(["invite.used", "pin.link", "pin.reset"]);

/** Which filter chip a row belongs to. */
export function kindOf(action: string): Kind {
  if (SETTINGS.has(action) || action.endsWith(".saved") || action.endsWith("_saved") || action.startsWith("salon.") || action.startsWith("service.")) return "settings";
  if (TEAM.has(action) || action.startsWith("staff.")) return "team";
  const area = action.split(".")[0];
  if (area === "pin" || action === "desk.locked") return "pin";
  if (area === "clock") return "clock";
  if (["ticket", "payment", "money", "gift", "day", "tips", "setup", "app"].includes(area)) return "money";
  if (area === "client" || area === "booking") return "clients";
  if (area === "device") return "devices";
  if (area === "support") return "support";
  return "other";
}

const BAD = new Set(["pin.locked", "pin.blocked"]);
const WARN = new Set(["pin.wrong", "clock.refused", "ticket.refunded", "money.after_close", "device.signed_out", "payment.extra_refunded", "gift.locked", "staff.removed", "booking.client_cancel"]);
const OK = new Set(["pin.ok", "clock.in", "clock.out", "clock.phone", "ticket.paid", "day.closed", "tips.signed", "staff.joined", "invite.used", "device.registered"]);

/** How the result tag looks: never colour alone, the tag always has a word too. */
export function toneOf(action: string): Tone {
  if (BAD.has(action)) return "bad";
  if (WARN.has(action)) return "warn";
  if (OK.has(action)) return "ok";
  if (kindOf(action) === "settings" || kindOf(action) === "team") return "info";
  return "plain";
}

/** Rows that need a look: wrong / locked PINs, refused clock-ins, refunds… */
export const needsLook = (action: string) => BAD.has(action) || WARN.has(action);

/** i18n key for an action: "pin.wrong" → "pin_wrong". */
export const actionKey = (action: string) => action.replace(/[.]/g, "_");

/** Fallback words for an action nobody named yet: "gift.linked_by_client" → "Gift linked by client". */
export function plainAction(action: string): string {
  const s = action.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Counts per kind for the chips (plus "all"). */
export function countKinds(rows: ActivityRow[]): Record<Kind | "all", number> {
  const out = { all: rows.length, other: 0 } as Record<Kind | "all", number>;
  for (const k of KINDS) out[k] = 0;
  for (const r of rows) out[kindOf(r.action)] += 1;
  return out;
}

export type Filter = { kind: Kind | "all"; person: string; device: string };
export function applyFilter(rows: ActivityRow[], f: Filter): ActivityRow[] {
  return rows.filter((r) => (f.kind === "all" || kindOf(r.action) === f.kind)
    && (!f.person || r.actor === f.person || r.subject === f.person)
    && (!f.device || (r.device ?? "") === f.device));
}

/** Detail facts worth showing, in a fixed order; money in cents becomes dollars. Unknown keys come last. */
const ORDER = ["number", "total_cents", "amount_cents", "method", "purpose", "kind", "reason", "rule", "source", "via", "by", "name", "status"];
const HIDE = new Set(["ticket", "client", "ids", "membership", "device", "salon"]);
export function facts(detail: Record<string, unknown> | null | undefined): [string, string][] {
  if (!detail) return [];
  const keys = Object.keys(detail).filter((k) => !HIDE.has(k) && detail[k] !== null && detail[k] !== "" && typeof detail[k] !== "object");
  keys.sort((a, b) => (ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b)));
  return keys.map((k) => {
    const v = detail[k];
    if ((k === "cents" || k.endsWith("_cents")) && typeof v === "number") return [k, `$${(v / 100).toFixed(2)}`];
    if (k === "number") return [k, `#${v}`];
    return [k, String(v)];
  });
}

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** CSV for a printed / emailed record. `what` turns an action into words (already translated). */
export function activityCsv(rows: ActivityRow[], what: (a: string) => string, when: (iso: string) => string): string {
  const head = ["Time", "Kind", "What", "Who", "Role", "For", "Device", "Details"];
  const body = rows.map((r) => [
    when(r.at), kindOf(r.action), what(r.action), r.actor ?? "", r.actor_role ?? "", r.subject ?? "", r.device ?? "",
    facts(r.detail).map(([k, v]) => `${k}=${v}`).join("; "),
  ].map(q).join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}

/** Sample day for the test copy (no database): same names as the design board. */
export function demoActivity(day = new Date()): ActivityRow[] {
  const at = (h: number, m: number) => { const d = new Date(day); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const r = (h: number, m: number, action: string, actor: string, role: Role | null, device: string | null, detail: Record<string, unknown> = {}, subject: string | null = null): ActivityRow =>
    ({ at: at(h, m), action, actor, actor_role: role, subject, device, device_id: device ? `dev-${device}` : null, detail });
  return [
    r(14, 41, "ticket.refunded", "Bao Tran", "manager", "Front desk iPad", { number: 1291, total_cents: 4500, method: "card" }),
    r(14, 14, "pin.locked", "Tuan Do", "tech", "Time clock", { purpose: "clock_out" }),
    r(14, 13, "pin.wrong", "Tuan Do", "tech", "Time clock", { purpose: "clock_out" }),
    r(13, 58, "pin.ok", "Bao Tran", "manager", "Front desk iPad", { purpose: "approve_discount" }),
    r(13, 30, "clock.in", "Vy Hoang", "tech", "Time clock", { source: "pin" }),
    r(12, 47, "client.phone_viewed", "Hanh Le", "front_desk", "Front desk iPad"),
    r(12, 2, "staff.edited", "Mai Nguyen", "owner", null, {}, "Kim Vo"),
    r(11, 40, "clock.refused", "Linh Pham", "tech", null, { kind: "in", reason: "not_wifi", rule: "wifi" }),
    r(11, 12, "pin.link", "Mai Nguyen", "owner", null, {}, "Linh Pham"),
    r(10, 5, "device.changed", "Bao Tran", "manager", "Front desk iPad", { name: "Pedicure iPad" }),
    r(9, 30, "clock.in", "Kim Vo", "tech", "Time clock", { source: "pin" }),
    r(9, 15, "clock.in", "Hanh Le", "front_desk", "Front desk iPad", { source: "pin" }),
    r(9, 2, "clock.in", "Bao Tran", "manager", "Front desk iPad", { source: "pin" }),
    r(9, 0, "pin.ok", "Hanh Le", "front_desk", "Front desk iPad", { purpose: "unlock" }),
  ];
}
