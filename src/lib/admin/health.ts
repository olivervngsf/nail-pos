// Founder Admin: salon health + alerts, worked out from admin_health() facts (migration admin_health).
// Health only: totals per salon. Never client or staff private data.

export type SalonFacts = {
  salon_id: string; salon_name: string; state: string; created_at: string; setup_step: number; time_zone: string;
  owner_name: string | null; owner_phone: string | null; owner_joined: boolean; invited_at: string | null; invite_open: boolean;
  staff: number; tickets_today: number; cents_today: number; tickets_week_ago: number; tickets_7d: number; last_ticket_at: string | null;
  stripe_linked: boolean; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean;
  devices: number; devices_online: number; device_last_seen: string | null; last_activity_at: string | null;
  // Optional: an overview saved on the device before these existed has none.
  plan_status?: string; plan_cycle?: "monthly" | "yearly" | null; trial_end?: string | null;
  texting?: Texting; texting_at?: string | null;
  // Salon care (design E): last check-in, the one open need, next bill date, tickets in the 3 weeks before this one.
  plan_period_end?: string | null; tickets_prev_21d?: number;
  checkin_at?: string | null; checkin_by?: string | null; checkin_mood?: Mood | null; checkin_note?: string | null;
  need?: string | null; need_due?: string | null; need_who?: string | null;
};
export type Mood = "happy" | "ok" | "help";
export const MOOD: Record<Mood, [string, Health]> = { happy: ["Happy", "good"], ok: ["OK", "setup"], help: ["Needs help", "warn"] };
export type Archived = { salon_id: string; salon_name: string; archived_at: string };
export type Texting = "not_started" | "waiting" | "approved" | "off";
export type Plan = "pilot" | "paid" | "late" | "none";
export type Handled = { salon_id: string; kind: string; at: string; by: string };
export type Overview = { me: string; now: string; salons: SalonFacts[]; handled: Handled[]; archived?: Archived[] };

export type Level = "bad" | "warn";
export type Health = "good" | "warn" | "bad" | "setup";
export type Alert = { salon_id: string; salon: string; owner: string | null; phone: string | null; kind: string; level: Level; title: string; why: string; since: string | null };
export type StripeState = "none" | "needs_info" | "live" | "payouts_paused" | "charges_off";

const H = 3600_000, D = 24 * H;
const SETUP_DONE = 9; // setup_step index of the last step (10 steps, 0-based)

export const isLive = (s: SalonFacts) => s.owner_joined && s.setup_step >= SETUP_DONE;

export function stripeState(s: SalonFacts): StripeState {
  if (!s.stripe_linked) return "none";
  if (!s.details_submitted) return "needs_info";
  if (!s.charges_enabled) return "charges_off";
  if (!s.payouts_enabled) return "payouts_paused";
  return "live";
}

const days = (from: string | null, now: number) => (from ? Math.floor((now - Date.parse(from)) / D) : 0);
/** Our plan for the salon (Stripe Billing on our account): free pilot, paying, payment late, or no plan yet. */
export function planOf(s: SalonFacts): Plan {
  const st = s.plan_status ?? "none";
  if (st === "trialing") return "pilot";
  if (st === "active") return "paid";
  if (st === "past_due" || st === "unpaid") return "late";
  return "none";
}
/** Pilot day number (30-day free pilot), from the day the pilot ends. */
export function pilotDay(s: SalonFacts, nowIso: string): number | null {
  if (planOf(s) !== "pilot" || !s.trial_end) return null;
  return Math.min(30, Math.max(1, 30 - Math.ceil((Date.parse(s.trial_end) - Date.parse(nowIso)) / D)));
}
export const PLAN_CENTS = { monthly: 4900, yearly: 3900 } as const; // per month; yearly = $468 / 12
/** What salons pay us per month right now (paid plans only; pilots are free). */
export function income(o: Overview): { cents: number; paid: number; pilot: number } {
  let cents = 0, paid = 0, pilot = 0;
  for (const s of o.salons) {
    const p = planOf(s);
    if (p === "pilot") pilot++;
    if (p === "paid") { paid++; cents += PLAN_CENTS[s.plan_cycle ?? "monthly"]; }
  }
  return { cents, paid, pilot };
}

/* ---------- salon care (design E): no sales up front ---------- */
export type Use = "busy" | "normal" | "quiet" | "new" | "not_live";
export const USE: Record<Use, string> = { busy: "Busy week", normal: "Normal week", quiet: "Quiet week", new: "First weeks", not_live: "Not live yet" };
/** This week against the salon's own usual week (the 3 weeks before). A word, never a dollar amount. */
export function usageOf(s: SalonFacts): Use {
  if (!isLive(s)) return "not_live";
  const usual = (s.tickets_prev_21d ?? 0) / 3;
  if (usual < 1) return s.tickets_7d ? "new" : "quiet";
  if (s.tickets_7d >= usual * 1.25) return "busy";
  if (s.tickets_7d <= usual * 0.6) return "quiet";
  return "normal";
}
export const CHECKIN_EVERY_DAYS = 14;
/** Whole days since we last talked to the salon (since it was added, if never). */
export const daysSinceCheckin = (s: SalonFacts, nowIso: string) => days(s.checkin_at ?? s.created_at, Date.parse(nowIso));
export const checkinDue = (s: SalonFacts, nowIso: string) => daysSinceCheckin(s, nowIso) >= CHECKIN_EVERY_DAYS;
/** Days until the open need is due (negative = overdue); null when there is no date. `need_due` is a plain date. */
export function needDueIn(s: SalonFacts, nowIso: string): number | null {
  if (!s.need || !s.need_due) return null;
  const today = new Date(nowIso); today.setHours(0, 0, 0, 0);
  const [y, m, d] = s.need_due.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / D);
}
export const PILOT_ENDS_SOON_DAYS = 10;
/** Days left in the free pilot; null when not in a pilot. */
export function pilotDaysLeft(s: SalonFacts, nowIso: string): number | null {
  if (planOf(s) !== "pilot" || !s.trial_end) return null;
  return Math.max(0, Math.ceil((Date.parse(s.trial_end) - Date.parse(nowIso)) / D));
}

export const TEXTING: Record<Texting, [string, Health]> = {
  not_started: ["Not started", "setup"], waiting: ["Waiting 10DLC", "warn"], approved: ["Approved", "good"], off: ["Off", "setup"],
};
const TEXTING_SLOW_DAYS = 7; // carrier approval usually takes about a week

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Every open problem for one salon, worst first. */
export function alertsFor(s: SalonFacts, nowIso: string): Alert[] {
  const now = Date.parse(nowIso);
  const base = { salon_id: s.salon_id, salon: s.salon_name, owner: s.owner_name, phone: s.owner_phone };
  const out: Alert[] = [];
  const st = stripeState(s);
  if (st === "payouts_paused") out.push({ ...base, kind: "stripe_payouts", level: "bad", title: "Stripe paused payouts", why: "Card money still comes in, but it won’t reach the salon’s bank until the owner answers Stripe.", since: null });
  if (st === "charges_off" && isLive(s)) out.push({ ...base, kind: "stripe_charges", level: "bad", title: "Card payments are off", why: "Stripe turned off card payments. The desk can only take cash.", since: null });
  if (isLive(s) && s.devices > 0 && s.devices_online === 0 && s.device_last_seen && now - Date.parse(s.device_last_seen) > D)
    out.push({ ...base, kind: "devices_offline", level: "warn", title: "No salon device on for a day", why: `Last salon device was on ${plural(days(s.device_last_seen, now), "day")} ago. Tablet off or signed out?`, since: s.device_last_seen });
  if (isLive(s) && s.tickets_7d === 0 && days(s.created_at, now) >= 3)
    out.push({ ...base, kind: "no_tickets", level: "warn", title: "No tickets in 7 days", why: "Live salon but nothing rung up. Back on the old system?", since: s.last_ticket_at });
  if (s.owner_joined && s.setup_step < SETUP_DONE) {
    const idle = days(s.last_activity_at ?? s.created_at, now);
    if (idle >= 2) out.push({ ...base, kind: "setup_stuck", level: "warn", title: `Setup stuck on step ${s.setup_step + 1} of 10`, why: `No progress for ${plural(idle, "day")}. A quick call usually fixes it.`, since: s.last_activity_at });
  }
  if (s.texting === "waiting" && days(s.texting_at ?? null, now) >= TEXTING_SLOW_DAYS)
    out.push({ ...base, kind: "texting_waiting", level: "warn", title: "Texting not approved yet", why: `10DLC day ${days(s.texting_at ?? null, now)}. Reminders go by email until it is approved.`, since: s.texting_at ?? null });
  if (planOf(s) === "late")
    out.push({ ...base, kind: "plan_late", level: "warn", title: "Plan payment is late", why: "The salon’s card for the PolishOS plan didn’t go through.", since: null });
  if (!s.owner_joined && s.owner_name) {
    if (!s.invite_open) out.push({ ...base, kind: "invite_expired", level: "warn", title: "Invite expired", why: "The owner never joined. Make a new code and resend.", since: s.invited_at });
    else if (days(s.invited_at, now) >= 3) out.push({ ...base, kind: "owner_not_joined", level: "warn", title: "Owner hasn’t joined yet", why: `Invited ${plural(days(s.invited_at, now), "day")} ago.`, since: s.invited_at });
  }
  return out;
}

export function healthOf(s: SalonFacts, alerts: Alert[]): Health {
  if (alerts.some((a) => a.level === "bad")) return "bad";
  if (alerts.length) return "warn";
  return isLive(s) ? "good" : "setup";
}

/** Open alerts across salons (handled today are hidden), worst first. */
export function openAlerts(o: Overview): Alert[] {
  const done = new Set(o.handled.map((h) => `${h.salon_id}:${h.kind}`));
  return o.salons.flatMap((s) => alertsFor(s, o.now)).filter((a) => !done.has(`${a.salon_id}:${a.kind}`))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "bad" ? -1 : 1));
}

export type Totals = { salons: number; live: number; settingUp: number; ticketsToday: number; centsToday: number; ticketsWeekAgo: number };
export function totals(o: Overview): Totals {
  const t: Totals = { salons: o.salons.length, live: 0, settingUp: 0, ticketsToday: 0, centsToday: 0, ticketsWeekAgo: 0 };
  for (const s of o.salons) {
    if (isLive(s)) t.live++; else t.settingUp++;
    t.ticketsToday += s.tickets_today; t.centsToday += s.cents_today; t.ticketsWeekAgo += s.tickets_week_ago;
  }
  return t;
}

/** "+12% vs last Tue" style; null when last week had nothing. */
export function vsWeekAgo(now: number, then: number, weekday: string): string | null {
  if (!then) return null;
  const pct = Math.round(((now - then) / then) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs last ${weekday}`;
}

/* ---------- sample data (no Supabase / test version) ---------- */
export function sampleOverview(nowIso = new Date().toISOString()): Overview {
  const now = Date.parse(nowIso);
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const s = (p: Partial<SalonFacts> & Pick<SalonFacts, "salon_id" | "salon_name">): SalonFacts => ({
    state: "CA", created_at: ago(30 * D), setup_step: 9, time_zone: "America/Los_Angeles", owner_name: null, owner_phone: null,
    owner_joined: true, invited_at: ago(30 * D), invite_open: false, staff: 6, tickets_today: 0, cents_today: 0, tickets_week_ago: 0,
    tickets_7d: 0, last_ticket_at: null, stripe_linked: true, charges_enabled: true, payouts_enabled: true, details_submitted: true,
    devices: 2, devices_online: 2, device_last_seen: ago(60_000), last_activity_at: ago(H),
    plan_status: "trialing", plan_cycle: "monthly", trial_end: ago(-10 * D), texting: "approved", texting_at: ago(20 * D),
    plan_period_end: null, tickets_prev_21d: 0, checkin_at: null, checkin_by: null, checkin_mood: null, checkin_note: null, need: null, need_due: null, need_who: null, ...p,
  });
  return {
    me: "Elang", now: nowIso, archived: [], handled: [{ salon_id: "s-lotus", kind: "devices_offline", at: ago(2 * H), by: "Oliver" }],
    salons: [
      s({ salon_id: "s-happy", salon_name: "Happy Nails", owner_name: "Minh D.", owner_phone: "+14085550117", staff: 8, tickets_today: 29, cents_today: 155000, tickets_week_ago: 27, tickets_7d: 190, last_ticket_at: ago(H), payouts_enabled: false, plan_status: "past_due", trial_end: null, plan_period_end: ago(5 * D), tickets_prev_21d: 560, checkin_at: ago(3 * H), checkin_by: "Oliver", checkin_mood: "help", checkin_note: "Minh sends the bank paper tonight.", need: "Check Stripe is back on", need_due: new Date(now + (1) * D).toLocaleDateString("en-CA"), need_who: "Oliver" }),
      s({ salon_id: "s-kim", salon_name: "Kim’s Nails", owner_name: "Kim L.", owner_phone: "+14085550133", created_at: ago(5 * D), setup_step: 6, staff: 5, stripe_linked: true, details_submitted: false, charges_enabled: false, payouts_enabled: false, devices: 1, devices_online: 1, last_activity_at: ago(3 * D), trial_end: ago(-27 * D), texting: "not_started", checkin_at: ago(9 * D), checkin_by: "Elang", checkin_mood: "help", checkin_note: "Printer would not pair.", need: "Help pair the printer", need_due: new Date(now + (-2) * D).toLocaleDateString("en-CA"), need_who: "Elang" }),
      s({ salon_id: "s-vy", salon_name: "Nails by Vy", owner_name: "Vy T.", owner_phone: "+14085550188", created_at: ago(4 * D), invited_at: ago(4 * D), invite_open: true, owner_joined: false, setup_step: 0, staff: 1, stripe_linked: false, charges_enabled: false, payouts_enabled: false, details_submitted: false, devices: 0, devices_online: 0, device_last_seen: null, last_activity_at: null, plan_status: "none", plan_cycle: null, trial_end: null, texting: "not_started" }),
      s({ salon_id: "s-cosmo", salon_name: "Cosmo Nails", owner_name: "Tuan N.", owner_phone: "+18565550101", staff: 12, tickets_today: 58, cents_today: 341000, tickets_week_ago: 51, tickets_7d: 402, last_ticket_at: ago(10 * 60_000), devices: 4, devices_online: 4, plan_status: "active", trial_end: null, plan_period_end: ago(-14 * D), tickets_prev_21d: 900, checkin_at: ago(3 * D), checkin_by: "Elang", checkin_mood: "happy", checkin_note: "Loves the payout sheet." }),
      s({ salon_id: "s-lotus", salon_name: "Lotus Nails", owner_name: "Hoa T.", owner_phone: "+14085550110", staff: 9, tickets_today: 41, cents_today: 218400, tickets_week_ago: 38, tickets_7d: 280, last_ticket_at: ago(20 * 60_000), devices: 3, devices_online: 0, device_last_seen: ago(2 * D), tickets_prev_21d: 830, checkin_at: ago(21 * D), checkin_by: "Oliver", checkin_mood: "ok", checkin_note: "All fine after setup day." }),
      s({ salon_id: "s-bella", salon_name: "Bella Nails & Spa", owner_name: "Lan P.", owner_phone: "+15105550142", staff: 7, tickets_today: 22, cents_today: 126800, tickets_week_ago: 25, tickets_7d: 160, last_ticket_at: ago(30 * 60_000), trial_end: ago(-18 * D), texting: "waiting", texting_at: ago(9 * D), tickets_prev_21d: 900, checkin_at: ago(6 * D), checkin_by: "Elang", checkin_mood: "ok", checkin_note: "Fine. Asks when texts start.", need: "Tell Lan when 10DLC is in", need_due: new Date(now + (2) * D).toLocaleDateString("en-CA"), need_who: "Elang" }),
    ],
  };
}
