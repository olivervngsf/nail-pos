// Settings → Salon + Menu (Nov 25): the salon facts from setup, changed later. Shapes, checks and sample data.
import { DAYS, defaultHours, NAIL_TEMPLATE, toMin } from "@/lib/onboarding/data";

export type DayHours = { weekday: number; on: boolean; open: string; close: string };
export type MenuItem = { id: string; cat: string; name: string; minutes: number; cents: number; from: boolean; online: boolean };
export type SalonInfo = { name: string; phone: string; address: string; state: string; time_zone: string; can_edit: boolean; hours: DayHours[]; services: MenuItem[] };

export const TIME_ZONES: [string, string][] = [
  ["America/Los_Angeles", "Pacific (CA, WA, NV)"],
  ["America/Denver", "Mountain (CO, UT)"],
  ["America/Phoenix", "Arizona"],
  ["America/Chicago", "Central (TX, MN, IL)"],
  ["America/New_York", "Eastern (NY, FL, GA)"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Anchorage", "Alaska"],
];

export const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

export const dayName = (weekday: number) => DAYS[weekday] ?? "";

/** 7 rows Mon..Sun; fills any day the salon has no row for. */
export function fullWeek(rows: DayHours[]): DayHours[] {
  const def = defaultHours();
  return def.map((d, i) => rows.find((r) => r.weekday === i) ?? { weekday: i, on: d.on, open: d.open, close: d.close })
    .map((r) => ({ ...r, open: r.open || "09:00", close: r.close || "19:00" }));
}

/** First problem with the salon info, or "" when it can be saved. */
export function infoProblem(s: Pick<SalonInfo, "name" | "hours">): "" | "name" | "hours" {
  if (!s.name.trim()) return "name";
  if (s.hours.some((h) => h.on && toMin(h.close) <= toMin(h.open))) return "hours";
  return "";
}

/** First problem with one menu item, or "" when it can be saved. */
export function itemProblem(it: Pick<MenuItem, "id" | "name" | "minutes" | "cents">, menu: MenuItem[]): "" | "name" | "minutes" | "price" | "dup" {
  const nm = it.name.trim().toLowerCase();
  if (!nm) return "name";
  if (!(it.minutes >= 5 && it.minutes <= 600)) return "minutes";
  if (!(it.cents >= 0 && it.cents <= 10_000_000)) return "price";
  if (menu.some((m) => m.id !== it.id && m.name.trim().toLowerCase() === nm)) return "dup";
  return "";
}

/** Menu grouped by its groups, in menu order. */
export function groupMenu(menu: MenuItem[]): [string, MenuItem[]][] {
  const out = new Map<string, MenuItem[]>();
  for (const m of menu) out.set(m.cat || "Other", [...(out.get(m.cat || "Other") ?? []), m]);
  return [...out.entries()];
}

export const sampleInfo = (): SalonInfo => ({
  name: "Lotus Test Nails", phone: "(408) 555-0100", address: "123 Main St, San Jose, CA 95112", state: "CA", time_zone: "America/Los_Angeles", can_edit: true,
  hours: defaultHours().map((h, i) => ({ weekday: i, on: h.on, open: h.open, close: h.close })),
  services: NAIL_TEMPLATE.map((s, i) => ({ id: `sample-${i}`, cat: s.cat, name: s.name, minutes: s.minutes, cents: s.priceCents, from: !!s.priceFrom, online: true })),
});
