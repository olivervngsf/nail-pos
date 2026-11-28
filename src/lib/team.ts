// Team (Settings → Team): one shape for the list, the member drawer and team_save. Pay is owner-only (server enforces).
import type { Role } from "@/lib/auth";

export type PayType = "commission" | "hourly" | "booth_rent";
export type Member = {
  id: string; name: string; nickname: string | null; phone: string; email: string | null; role: Role; language: "en" | "vi";
  payType: PayType | null; commissionPct: number | null; hourlyCents: number | null; checkPct: number;
  skills: string[]; workdays: number[]; licenseNo: string | null; licenseState: string | null; licenseExpires: string | null;
  birthday: string | null; emergency: string | null; startDate: string | null;
  joined: boolean; hasPin: boolean; locked: boolean; clockedIn: boolean; lastClock: string | null; invite: string | null;
};

export const SKILLS = ["Gel", "Dip", "Acrylic", "Pedicure", "Nail art", "Waxing", "Lashes"] as const;
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const; // 0 = Mon (same as salon_hours)

/** Days until a license expires (negative = expired); null = no date. */
export function licenseDaysLeft(m: Pick<Member, "licenseExpires">, today = new Date()): number | null {
  if (!m.licenseExpires) return null;
  const d = new Date(`${m.licenseExpires}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

/** The one short status a row shows (most important first). */
export function memberStatus(m: Member, today = new Date()): "invited" | "noPin" | "locked" | "license" | "in" | "out" {
  if (!m.joined) return "invited";
  if (m.locked) return "locked";
  const days = licenseDaysLeft(m, today);
  if (days !== null && days <= 30) return "license";
  if (!m.hasPin) return "noPin";
  return m.clockedIn ? "in" : "out";
}

/** Pay in plain words for a row: "60% · 70/30", "$16.50/hr", "Booth rent". */
export function payLabel(m: Pick<Member, "payType" | "commissionPct" | "hourlyCents" | "checkPct">): string {
  const split = m.checkPct < 100 ? ` · ${m.checkPct}/${100 - m.checkPct}` : "";
  if (m.payType === "commission") return `${Number(m.commissionPct ?? 0)}%${split}`;
  if (m.payType === "hourly") return `$${((m.hourlyCents ?? 0) / 100).toFixed(2)}/hr${split}`;
  if (m.payType === "booth_rent") return "Booth rent";
  return "—";
}

export const blankMember = (): Member => ({
  id: "", name: "", nickname: null, phone: "", email: null, role: "tech", language: "en", payType: "commission", commissionPct: 60, hourlyCents: null,
  checkPct: 100, skills: [], workdays: [1, 2, 3, 4, 5], licenseNo: null, licenseState: null, licenseExpires: null, birthday: null, emergency: null,
  startDate: null, joined: false, hasPin: false, locked: false, clockedIn: false, lastClock: null, invite: null,
});

const m = (o: Partial<Member>): Member => ({ ...blankMember(), joined: true, hasPin: true, language: "vi", ...o });
export const DEMO_TEAM: Member[] = [
  m({ id: "d-owner", name: "Mai Nguyen", phone: "+14085550110", role: "owner", language: "en", payType: null, commissionPct: null, clockedIn: true }),
  m({ id: "d-bao", name: "Bao Tran", phone: "+14085550120", role: "manager", payType: "hourly", hourlyCents: 1800, commissionPct: null, clockedIn: true }),
  m({ id: "d-hanh", name: "Hanh Le", phone: "+14085550130", role: "front_desk", payType: "hourly", hourlyCents: 1700, commissionPct: null, clockedIn: true }),
  m({ id: "d-kim", name: "Kim Vo", phone: "+14085550140", payType: "commission", commissionPct: 60, checkPct: 70, skills: ["Gel", "Dip", "Nail art"], clockedIn: true, licenseNo: "M 284117", licenseExpires: "2027-08-01" }),
  m({ id: "d-tuan", name: "Tuan Do", phone: "+14085550150", payType: "commission", commissionPct: 55, skills: ["Acrylic", "Pedicure"], hasPin: false }),
  m({ id: "d-vy", name: "Vy Hoang", phone: "+14085550160", payType: "commission", commissionPct: 55, checkPct: 60, skills: ["Gel", "Pedicure"],
    licenseNo: "M 301552", licenseExpires: isoIn(19) }),
  m({ id: "d-linh", name: "Linh Pham", phone: "+14085550170", joined: false, hasPin: false, invite: "7B3D56" }),
];
function isoIn(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

/** What team_save receives (only what the form edits; pay only when the owner saves). */
export function savePayload(salonId: string, x: Member, withPay: boolean) {
  return {
    salonId, id: x.id || undefined, name: x.name.trim(), phone: x.phone, role: x.role, language: x.language, nickname: x.nickname ?? "", email: x.email ?? "",
    birthday: x.birthday ?? "", emergency: x.emergency ?? "", skills: x.skills, workdays: x.workdays.map(String),
    licenseNo: x.licenseNo ?? "", licenseState: x.licenseState ?? "", licenseExpires: x.licenseExpires ?? "", startDate: x.startDate ?? "",
    ...(withPay ? { payType: x.payType ?? "", commissionPct: x.commissionPct == null ? "" : String(x.commissionPct),
      hourlyCents: x.hourlyCents == null ? "" : String(x.hourlyCents), checkPct: String(x.checkPct) } : {}),
  };
}

/** Status → icon tone (never colour alone: the row always shows the word too). Out = no icon. */
export function statusTone(st: ReturnType<typeof memberStatus>, m: Pick<Member, "licenseExpires">, today = new Date()): "good" | "watch" | "bad" | null {
  if (st === "in") return "good";
  if (st === "locked") return "bad";
  if (st === "license") { const d = licenseDaysLeft(m, today); return d !== null && d <= 7 ? "bad" : "watch"; }
  if (st === "invited" || st === "noPin") return "watch";
  return null;
}

/** Role groups for the list, in this order. */
export const TEAM_GROUPS = ["boss", "desk", "tech"] as const;
/** How the owner orders the Team list (saved per device): by role (grouped), name A→Z / Z→A, or who needs attention first. */
export const TEAM_SORTS = ["role", "az", "za", "status"] as const;
export type TeamSort = (typeof TEAM_SORTS)[number];
const STATUS_ORDER = ["in", "license", "locked", "noPin", "invited", "out"] as const;
export function sortTeam(list: Member[], sort: TeamSort, today = new Date()): Member[] {
  const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const out = [...list];
  if (sort === "az") return out.sort(byName);
  if (sort === "za") return out.sort((a, b) => byName(b, a));
  if (sort === "status") return out.sort((a, b) => STATUS_ORDER.indexOf(memberStatus(a, today)) - STATUS_ORDER.indexOf(memberStatus(b, today)) || byName(a, b));
  return out;
}
export type TeamGroup = (typeof TEAM_GROUPS)[number];
export const groupOf = (r: Role): TeamGroup => (r === "owner" || r === "manager" ? "boss" : r === "front_desk" ? "desk" : "tech");

/** "9:02 AM" today, "Mon 6:10 PM" this week, else "Nov 3". */
export function clockWhen(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
