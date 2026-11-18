// Founder Admin · one salon (admin_salon): totals by day, devices, readers, team size by role, activity log.
// Activity = what happened + who (role, admin name, or System); never client names, PINs or staff notes.

export type DayTotal = { day: string; tickets: number; cents: number };
export type Device = { name: string; kind: string; last_seen: string | null };
export type Reader = { label: string; simulated: boolean; added: string };
export type Activity = { at: string; action: string; who: string; note: string | null };
export type SalonDetail = { days: DayTotal[]; devices: Device[]; readers: Reader[]; roles: Record<string, number>; activity: Activity[] };

export type Group = "setup" | "money" | "devices" | "support" | "notes";
export const GROUPS: { key: Group | "all"; label: string }[] = [
  { key: "all", label: "All" }, { key: "setup", label: "Setup" }, { key: "money", label: "Money" },
  { key: "devices", label: "Devices" }, { key: "support", label: "Support" }, { key: "notes", label: "Notes" },
];

const LABELS: Record<string, [string, Group, ("bad" | "warn" | "good")?]> = {
  "salon.created": ["Salon added", "setup"],
  "invite.used": ["Owner joined from the invite", "setup", "good"],
  "staff.added": ["Staff member added", "setup"],
  "staff.edited": ["Staff details changed", "setup"],
  "staff.joined": ["Staff member joined on their phone", "setup"],
  "staff.removed": ["Staff member removed", "setup"],
  "booking.page": ["Booking page changed", "setup"],
  "loyalty.settings": ["Loyalty settings changed", "setup"],
  "print_settings.saved": ["Printer settings saved", "setup"],
  "pin.rules": ["PIN rules changed", "setup"],
  "ticket.paid": ["Ticket paid", "money"],
  "ticket.refunded": ["Ticket refunded", "money", "warn"],
  "gift.made": ["Gift card sold", "money"],
  "gift.locked": ["Gift card locked", "money", "warn"],
  "gift.linked_by_client": ["Client added a gift card", "money"],
  "device.registered": ["Salon device set up", "devices"],
  "device.signed_out": ["Salon device signed out", "devices", "warn"],
  "pin.locked": ["PIN locked after wrong tries", "devices", "warn"],
  "pin.blocked": ["PIN blocked", "devices", "warn"],
  "pin.wrong": ["Wrong PIN", "devices"],
  "pin.changed": ["PIN changed", "devices"],
  "pin.reset": ["PIN reset", "devices"],
  "client.phone_viewed": ["Client phone shown", "devices"],
  "admin.alert_handled": ["Alert marked handled", "support", "good"],
  "admin.note": ["Call note", "notes"],
};

export function describe(a: Activity): { label: string; group: Group; tone?: "bad" | "warn" | "good" } {
  const hit = LABELS[a.action];
  if (hit) return { label: hit[0], group: hit[1], tone: hit[2] };
  const [area] = a.action.split(".");
  const group: Group = area === "admin" ? "support" : area === "ticket" || area === "gift" || area === "pay" ? "money" : area === "device" || area === "pin" ? "devices" : "setup";
  return { label: a.action.replace(/[._]/g, " "), group };
}

export const WHO: Record<string, string> = { owner: "Owner", manager: "Manager", front_desk: "Front desk", tech: "Tech", System: "System", Staff: "Staff" };
export const whoLabel = (w: string) => WHO[w] ?? w;

/** Today + the 7 days before (in the salon's own days), oldest first, missing days filled with 0. */
export function lastDays(days: DayTotal[], today: string, n = 8): DayTotal[] {
  const by = new Map(days.map((d) => [d.day, d]));
  const out: DayTotal[] = [];
  const t = new Date(today + "T12:00:00Z");
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getTime() - i * 86400_000).toISOString().slice(0, 10);
    out.push(by.get(d) ?? { day: d, tickets: 0, cents: 0 });
  }
  return out;
}

/** The salon's own date (YYYY-MM-DD) for an instant. */
export const dayIn = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/* ---------- sample (no Supabase / test version) ---------- */
export function sampleSalon(id: string, nowIso = new Date().toISOString()): SalonDetail {
  const now = Date.parse(nowIso);
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  const today = dayIn(nowIso, "America/Los_Angeles");
  const base = id === "s-cosmo" ? 55 : id === "s-kim" || id === "s-vy" ? 0 : 30;
  const days = lastDays([], today).map((d, i) => ({ ...d, tickets: base ? base - 6 + ((i * 7) % 13) : 0, cents: base ? (base - 6 + ((i * 7) % 13)) * 5600 : 0 }));
  return {
    days,
    devices: base ? [{ name: "Front desk iPad", kind: "front_desk", last_seen: ago(id === "s-lotus" ? 48 : 0.02) }, { name: "Time clock", kind: "clock", last_seen: ago(id === "s-lotus" ? 50 : 0.1) }] : [],
    readers: base ? [{ label: "Front desk", simulated: false, added: ago(24 * 20) }] : [],
    roles: base ? { owner: 1, manager: 1, front_desk: 1, tech: 5 } : { owner: 1 },
    activity: [
      { at: ago(0.3), action: "ticket.paid", who: "front_desk", note: null },
      { at: ago(2), action: "admin.note", who: "Elang", note: "Called the owner about the bank document. Sending it tonight." },
      { at: ago(3), action: "admin.alert_handled", who: "Oliver", note: null },
      { at: ago(5), action: "pin.locked", who: "tech", note: null },
      { at: ago(26), action: "ticket.refunded", who: "manager", note: null },
      { at: ago(28), action: "device.registered", who: "owner", note: null },
      { at: ago(24 * 6), action: "staff.joined", who: "tech", note: null },
      { at: ago(24 * 20), action: "invite.used", who: "owner", note: null },
      { at: ago(24 * 21), action: "salon.created", who: "System", note: null },
    ],
  };
}
