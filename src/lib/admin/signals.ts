// Founder Admin · salon health table (Admin Texting board, tab 4 "Health table", Oliver Nov 20).
// One row per salon, one word + one icon per check: Stripe · Devices · Speed · Talks · Bills · Texting.
// Icon tones (never colour alone, StatusIcon draws a shape too): good = blue ✓, watch = yellow !, bad = red ✕, none = dashed ring.
import {
  alertsFor, checkinDue, daysSinceCheckin, healthOf, isLive, pilotDay, pilotDaysLeft, planOf, stripeState,
  PILOT_ENDS_SOON_DAYS, type Health, type SalonFacts,
} from "./health";

export type Tone = "good" | "watch" | "bad" | "none";
export type Cell = { tone: Tone; word: string; tip: string };
export const COLUMNS = ["stripe", "devices", "speed", "talks", "bills", "texting"] as const;
export type Column = (typeof COLUMNS)[number];
export const COLUMN_LABEL: Record<Column, string> = { stripe: "Stripe", devices: "Devices", speed: "Speed", talks: "Talks", bills: "Bills", texting: "Texting" };
export const TONE_LABEL: Record<Tone, string> = { bad: "Needs us now", watch: "Watch", good: "Good", none: "Not set up" };

const H = 3600_000, D = 24 * H;
const RANK: Record<Tone, number> = { bad: 3, watch: 2, good: 1, none: 0 };
export const worst = (tones: Tone[]): Tone => tones.reduce<Tone>((a, b) => (RANK[b] > RANK[a] ? b : a), "none");
export const isOff = (t: Tone) => t === "bad" || t === "watch";
const fromHealth: Record<Health, Tone> = { bad: "bad", warn: "watch", good: "good", setup: "none" };

/** "5 min ago" / "3h ago" / "2 days ago". */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  const d = Math.round(m / 1440);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
const hours = (ms: number) => `${Math.max(1, Math.floor(ms / H))}h`;

/** Stripe: is card money reaching us? Quiet = the salon rang up tickets for hours but Stripe sent nothing. */
export function stripeCell(s: SalonFacts, nowIso: string): Cell {
  const now = Date.parse(nowIso);
  const st = stripeState(s);
  if (st === "none") return { tone: "none", word: "Not linked", tip: "Stripe not linked yet" };
  if (st === "needs_info") return { tone: "watch", word: "Needs info", tip: "Stripe needs more info from the owner" };
  if (st === "charges_off") return { tone: "bad", word: "Cards off", tip: "Stripe turned off card payments: cash only" };
  if (st === "payouts_paused") return { tone: "bad", word: "Payouts paused", tip: "Owner must answer Stripe before money reaches the bank" };
  const last = s.stripe_last_at ? Date.parse(s.stripe_last_at) : null;
  const lastTicket = s.last_ticket_at ? Date.parse(s.last_ticket_at) : null;
  if (isLive(s) && last && lastTicket && s.tickets_today >= 3 && now - last > 3 * H && lastTicket - last > H)
    return { tone: "watch", word: `Quiet ${hours(now - last)}`, tip: `Tickets today but no Stripe message since ${ago(s.stripe_last_at, now)}` };
  return { tone: "good", word: "OK", tip: last ? `Last Stripe message ${ago(s.stripe_last_at, now)}` : "Cards + payouts on" };
}

/** Devices: how many salon devices are on now. All off for a day = red. */
export function devicesCell(s: SalonFacts, nowIso: string): Cell {
  const now = Date.parse(nowIso);
  if (!s.devices) return isLive(s) ? { tone: "watch", word: "None", tip: "No salon device set up" } : { tone: "none", word: "—", tip: "No salon device yet" };
  const word = `${s.devices_online} of ${s.devices}`;
  if (s.devices_online === s.devices) return { tone: "good", word, tip: "All on now" };
  const seen = s.device_last_seen ? Date.parse(s.device_last_seen) : null;
  if (s.devices_online === 0) {
    if (!seen) return { tone: "watch", word, tip: "Never turned on" };
    return now - seen > D && isLive(s)
      ? { tone: "bad", word, tip: `None on since ${ago(s.device_last_seen, now)}` }
      : { tone: "watch", word, tip: `Last on ${ago(s.device_last_seen, now)}` };
  }
  // Some on, some off: only worth a look while the salon is busy (a ticket in the last 2 hours).
  const busy = s.last_ticket_at && now - Date.parse(s.last_ticket_at) < 2 * H;
  return { tone: busy ? "watch" : "good", word, tip: `${s.devices - s.devices_online} off now` };
}

/** Speed: average page load on the salon's devices (last 2 days) + errors. */
export function speedCell(s: SalonFacts): Cell {
  if (!s.speed_loads) return { tone: "none", word: "—", tip: "No speed data yet" };
  const ms = s.speed_ms ?? 0, err = s.speed_errors ?? 0;
  const word = `${(ms / 1000).toFixed(1)}s`;
  const tip = `Screens load in ${word} on average${err ? ` · ${err} error${err === 1 ? "" : "s"}` : ""} · last 2 days`;
  if (ms > 3000 || err >= 5) return { tone: "bad", word, tip };
  if (ms > 2000 || err > 0) return { tone: "watch", word, tip };
  return { tone: "good", word, tip };
}

/** Talks: when we last checked in with the salon, and how it was. */
export function talksCell(s: SalonFacts, nowIso: string): Cell {
  if (!s.checkin_at) {
    if (!s.owner_joined) return { tone: "none", word: "—", tip: "Owner not joined yet" };
    return checkinDue(s, nowIso) ? { tone: "watch", word: "Never", tip: "No check-in yet: say hello" } : { tone: "none", word: "Never", tip: "No check-in yet" };
  }
  const n = daysSinceCheckin(s, nowIso);
  const word = n <= 0 ? "Today" : `${n} day${n === 1 ? "" : "s"}`;
  const mood = s.checkin_mood === "happy" ? "Happy" : s.checkin_mood === "ok" ? "OK" : s.checkin_mood === "help" ? "Needs help" : "";
  const tip = `${s.checkin_by ?? "Admin"}${mood ? ` · ${mood}` : ""}${s.checkin_note ? ` · ${s.checkin_note}` : ""}`;
  if (s.checkin_mood === "help" || n >= 21) return { tone: "bad", word, tip };
  if (checkinDue(s, nowIso)) return { tone: "watch", word, tip: `Check-in due · ${tip}` };
  return { tone: "good", word, tip };
}

/** Bills: their plan with us. */
export function billsCell(s: SalonFacts, nowIso: string): Cell {
  const p = planOf(s);
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (p === "late") return { tone: "bad", word: "Late", tip: "Plan payment didn’t go through" };
  if (p === "paid") return { tone: "good", word: "Paid", tip: s.plan_period_end ? `Next bill ${date(s.plan_period_end)}` : "Paying" };
  if (p === "pilot") {
    const left = pilotDaysLeft(s, nowIso);
    if (left !== null && left <= PILOT_ENDS_SOON_DAYS) return { tone: "watch", word: `Pilot ${left}d left`, tip: "Pilot ends soon: ask to stay" };
    return { tone: "none", word: "Pilot", tip: `Pilot day ${pilotDay(s, nowIso) ?? 1} of 30` };
  }
  return { tone: "none", word: "No plan", tip: "Starts at setup" };
}

/** Texting: carrier paperwork + how sending goes (30 days). */
export function textingCell(s: SalonFacts, nowIso: string): Cell {
  const now = Date.parse(nowIso);
  const t = s.texting ?? "not_started";
  const sent = s.texts_30d ?? 0, failed = s.texts_failed_30d ?? 0;
  if (t === "waiting") {
    const d = s.texting_at ? Math.floor((now - Date.parse(s.texting_at)) / D) : 0;
    return { tone: d >= 21 ? "bad" : "watch", word: "Waiting", tip: `Carriers reviewing · ${d} day${d === 1 ? "" : "s"}` };
  }
  if (t === "approved") {
    const pct = sent ? Math.round((failed / sent) * 100) : 0;
    const tip = `${sent.toLocaleString("en-US")} sent in 30 days${failed ? ` · ${failed} failed` : ""}${s.promos_30d ? ` · ${s.promos_30d} promo` : ""}`;
    if (sent >= 20 && pct >= 5) return { tone: "watch", word: `${pct}% failed`, tip };
    return { tone: "good", word: "Live", tip };
  }
  return { tone: "none", word: t === "off" ? "Off" : "Not yet", tip: t === "off" ? "Texting turned off" : "Not started" };
}

export type HealthRow = { s: SalonFacts; tone: Tone; why: string; cells: Record<Column, Cell> };

/** One table row: every check + the salon's overall tone (worst of its alerts and its checks) + one short reason. */
export function healthRow(s: SalonFacts, nowIso: string): HealthRow {
  const cells: Record<Column, Cell> = {
    stripe: stripeCell(s, nowIso), devices: devicesCell(s, nowIso), speed: speedCell(s),
    talks: talksCell(s, nowIso), bills: billsCell(s, nowIso), texting: textingCell(s, nowIso),
  };
  const alerts = alertsFor(s, nowIso);
  const cellTones = COLUMNS.map((c) => cells[c].tone);
  const tone = worst([fromHealth[healthOf(s, alerts)], ...cellTones]);
  const off = COLUMNS.filter((c) => isOff(cells[c].tone)).sort((a, b) => RANK[cells[b].tone] - RANK[cells[a].tone]);
  // The reason: a red alert first, then the worst checks, then any other alert.
  const why = alerts.find((a) => a.level === "bad")?.title
    ?? (off.length ? off.slice(0, 2).map((c) => `${COLUMN_LABEL[c]}: ${cells[c].tip}`).join(" · ") : alerts[0]?.title)
    ?? (!s.owner_joined ? "Owner not joined yet" : isLive(s) ? "All good" : `Setup step ${Math.min(s.setup_step + 1, 10)} of 10`);
  return { s, tone, why, cells };
}

/** Worst first, then by name. */
export function healthRows(salons: SalonFacts[], nowIso: string): HealthRow[] {
  return salons.map((s) => healthRow(s, nowIso)).sort((a, b) => RANK[b.tone] - RANK[a.tone] || a.s.salon_name.localeCompare(b.s.salon_name));
}

/** A card per column: how many salons are off on it, worst tone, their names. */
export function columnSummary(rows: HealthRow[], c: Column): { tone: Tone; off: HealthRow[]; ok: number } {
  const off = rows.filter((r) => isOff(r.cells[c].tone));
  return { tone: off.length ? worst(off.map((r) => r.cells[c].tone)) : rows.some((r) => r.cells[c].tone === "good") ? "good" : "none", off, ok: rows.filter((r) => r.cells[c].tone === "good").length };
}
