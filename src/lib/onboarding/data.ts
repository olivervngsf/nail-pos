// Salon setup (onboarding) data: steps, nail template menu, state tip rules, hours helpers.
// Source of truth for the flow: Onboarding prototype https://claude.ai/artifact/BYMHXFQTM4Bs9oug6i8ThB

export const STEPS = [
  "Salon info",
  "Services",
  "Staff + PIN",
  "Connect payments",
  "Card reader",
  "Printer",
  "This device",
  "Clients",
  "Test $1",
  "Ready",
] as const;

export type Role = "Owner" | "Manager" | "Front desk" | "Tech";
export type PayType = "Commission 60%" | "Hourly $16" | "Booth rent";

export type Service = { id?: string; cat: string; name: string; minutes: number; priceCents: number; priceFrom?: boolean; on: boolean; flag?: boolean };
/** "$45" or "$45+" (from price: the front desk sets the final price at checkout). */
export const fmtPrice = (s: Pick<Service, "priceCents" | "priceFrom">) =>
  "$" + (s.priceCents / 100).toFixed(s.priceCents % 100 ? 2 : 0) + (s.priceFrom ? "+" : "");
export type Hours = { day: string; on: boolean; open: string; close: string };
export type Staff = { id?: string; name: string; phone: string; role: Role; pay?: PayType; status: "You" | "Invited" | "Joined"; inviteCode?: string };

// Nail salon starter menu. Owner edits prices; "flag" = minutes to double-check.
export const NAIL_TEMPLATE: Service[] = [
  ["Pedicures", "Regular spa pedicure", 45, 3800],
  ["Pedicures", "Deluxe spa pedicure", 50, 4800],
  ["Pedicures", "Collagen spa pedicure", 60, 6800, true],
  ["Manicures", "Regular manicure", 30, 3000],
  ["Gel color", "Gel color manicure", 45, 4500],
  ["Gel color", "Gel color pedicure", 60, 5300],
  ["Gel color", "Gel color change - hands", 30, 3000],
  ["Add-ons", "French tip", 10, 700],
  ["Enhancements", "Acrylic full set", 75, 4800],
  ["Enhancements", "Acrylic fill-in", 45, 3800],
  ["Enhancements", "Pink and white", 75, 7000, true],
  ["Enhancements", "Builder gel", 75, 6800],
  ["Dipping", "Dipping powder - no tips", 60, 4800],
  ["Waxing", "Eyebrows", 15, 1200],
].map(([cat, name, minutes, priceCents, flag]) => ({
  cat: cat as string,
  name: name as string,
  minutes: minutes as number,
  priceCents: priceCents as number,
  on: true,
  flag: Boolean(flag),
}));

// Card fee on tips: locked off in CA + MN (CLAUDE.md design rules).
export const STATES: Record<string, string> = {
  CA: "California: card fees can never be taken from tips. This setting is locked.",
  MN: "Minnesota: card fees can never be taken from tips. This setting is locked.",
  TX: "Texas: you may pass the card fee on tips to staff, shown on their payout sheet.",
  FL: "Florida: you may pass the card fee on tips to staff, shown on their payout sheet.",
  NY: "New York: tips go to staff in full; fee rules set for you.",
  WA: "Washington: you may pass the card fee on tips to staff, shown on their payout sheet.",
};

export const WEAK_PINS = ["1234", "1111", "0000", "1212", "4321", "2222", "9999"];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const defaultHours = (): Hours[] =>
  DAYS.map((day, i) => ({ day, on: true, open: i < 6 ? "09:00" : "10:00", close: i < 6 ? "19:00" : "17:00" }));

/** "HH:MM" (24h) → minutes since midnight */
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
/** "19:00" → "7:00 PM" */
export const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const fmtHours = (h: Hours) => {
  const d = toMin(h.close) - toMin(h.open);
  return `${Number((d / 60).toFixed(1))} h`;
};
export const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Keep only digits, format as US phone "(408) 555-0110". */
export const fmtPhone = (v: string) => {
  const d = v.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};
export const phoneOk = (v: string) => v.replace(/\D/g, "").replace(/^1/, "").length === 10;

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export const newInviteCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
