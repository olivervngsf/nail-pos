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
  "admin.texting": ["Texting status changed", "support"],
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

/* ---------- salon page tabs (admin_signals, migration admin_signals) ---------- */
export type Signals = {
  stripe: { at: string; type: string; ticket: number | null }[];
  stripe_week: { pay: number; matched: number };
  vitals: { day: string; loads: number; avg_ms: number | null; slow: number; errors: number; last_error: string | null }[];
  texts: { kind: string; sent: number; failed: number }[];
  texts_daily: { day: string; n: number; promo: number }[];
};
export const STRIPE_EVENT: Record<string, string> = {
  "payment_intent.succeeded": "Card payment", "payment_intent.payment_failed": "Card declined", "payment_intent.canceled": "Payment canceled",
  "charge.refunded": "Refund", "charge.updated": "Payment updated", "charge.dispute.created": "Dispute opened", "account.updated": "Account changed",
  "payout.paid": "Payout to bank", "payout.failed": "Payout failed",
};
export const stripeEvent = (t: string) => STRIPE_EVENT[t] ?? t.replace(/[._]/g, " ");
export const TEXT_KIND: Record<string, string> = { confirm: "Booking confirms", reminder: "Reminders", receipt: "Receipts", promo: "Promos", invite: "Staff invites", salon_ready: "Salon ready", other: "Other" };

export function sampleSignals(id: string, nowIso = new Date().toISOString()): Signals {
  const now = Date.parse(nowIso);
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  const day = (d: number) => new Date(now - d * 86400_000).toISOString().slice(0, 10);
  const live = id !== "s-kim" && id !== "s-vy";
  const slow = id === "s-bella";
  return {
    stripe: live ? [
      { at: ago(slow ? 3.3 : 0.1), type: "payment_intent.succeeded", ticket: 1284 },
      { at: ago(slow ? 3.4 : 0.6), type: "charge.updated", ticket: 1283 },
      { at: ago(slow ? 4 : 1.2), type: "payment_intent.succeeded", ticket: 1283 },
      { at: ago(20), type: "payout.paid", ticket: null },
    ] : [],
    stripe_week: live ? { pay: 96, matched: 96 } : { pay: 0, matched: 0 },
    vitals: live ? Array.from({ length: 7 }, (_, i) => ({ day: day(i), loads: 60 + i * 3, avg_ms: slow && i < 2 ? 3800 : 1100 + i * 20, slow: slow && i < 2 ? 12 : 0, errors: slow && i === 0 ? 4 : 0, last_error: slow && i === 0 ? "Load failed (network)" : null })) : [],
    texts: id === "s-cosmo" ? [{ kind: "reminder", sent: 640, failed: 4 }, { kind: "confirm", sent: 220, failed: 2 }, { kind: "promo", sent: 424, failed: 3 }] : live ? [{ kind: "reminder", sent: 120, failed: 1 }, { kind: "confirm", sent: 66, failed: 0 }] : [],
    texts_daily: live ? Array.from({ length: 30 }, (_, i) => ({ day: day(29 - i), n: 20 + ((i * 7) % 13), promo: id === "s-cosmo" && i % 7 === 4 ? 106 : 0 })) : [],
  };
}
