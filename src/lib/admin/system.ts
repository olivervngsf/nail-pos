// Founder Admin · System tab (board A6, System Design "Running smooth"): our own platform's health, for Oliver + Elang only.
// Facts come from admin_system() (migration admin_system). Pure helpers here, tested in system.test.ts.

export type CheckStatus = "ok" | "warn" | "bad" | "not_set";
export type CheckRow = { key: string; status: CheckStatus; note: string; at: string | null; by: string | null };
export type Cost = { name: string; cents: number };
export type SystemFacts = {
  now: string;
  stripe: { day: number; week: number; payWeek: number; payMatched: number; last: string | null };
  admins: { name: string; twoStep: boolean }[];
  texting: { waiting: number; waitingNames: string[]; approved: number };
  salons: number;
  checks: CheckRow[];
  month: string;
  costs: Cost[];
  lastCosts: Cost[];
};
/** One line on the "Running smooth" list. `auto` = worked out from the database (can't be ticked by hand). */
export type Check = { key: string; title: string; how: string; status: CheckStatus; note: string; at: string | null; by: string | null; auto: boolean };

/** Hand-ticked checks, in the System Design "Running smooth" order: what to check + how. */
export const MANUAL: { key: string; title: string; how: string; maxDays?: number }[] = [
  { key: "backups", title: "Backups", how: "Supabase daily backups on (paid plan) + point-in-time for the live project" },
  { key: "restore_test", title: "Restore test", how: "Restore last night's backup into a spare project and open a salon. Every 3 months.", maxDays: 92 },
  { key: "data_walls", title: "Data walls test", how: "Salon-wall SQL tests pass on every change (CI) and on the live project" },
  { key: "live_db", title: "Live database up to date", how: "Actions → Live database ran after the last change to main" },
  { key: "sentry", title: "Sentry alerts", how: "App errors reach us by email; no new error types this week" },
  { key: "uptime", title: "Uptime checks", how: "polishosapp.com + Stripe webhook checked every minute, alerts to both phones" },
  { key: "spending_alerts", title: "Spending alerts", how: "Budget alerts on Vercel, Supabase, Twilio, Anthropic" },
  { key: "secrets", title: "Secrets", how: "Keys only in Vercel + Supabase, 2-step + password manager on every account" },
];

export const STATUS_LABEL: Record<CheckStatus, string> = { ok: "OK", warn: "Check", bad: "Problem", not_set: "Not set" };
const DAY = 86_400_000;

/** The full Running smooth list: hand-ticked lines (a restore test older than 3 months turns to "Check") + live facts. */
export function checks(f: SystemFacts): Check[] {
  const now = Date.parse(f.now);
  const out: Check[] = MANUAL.map((m) => {
    const row = f.checks.find((c) => c.key === m.key);
    let status: CheckStatus = row?.status ?? "not_set";
    const stale = !!(m.maxDays && row?.at && now - Date.parse(row.at) > m.maxDays * DAY);
    if (stale && status === "ok") status = "warn";
    return { key: m.key, title: m.title, how: m.how, status, note: stale ? `${row!.note ? `${row!.note} · ` : ""}over ${Math.round(m.maxDays! / 30)} months ago: do it again` : row?.note ?? "",
      at: row?.at ?? null, by: row?.by ?? null, auto: false };
  });
  const missing = f.admins.filter((a) => !a.twoStep).map((a) => a.name);
  out.push({ key: "two_step", title: "2-step login (admins)", how: "Every admin signs in with an authenticator app (/me → Sign in)",
    status: !f.admins.length ? "not_set" : missing.length ? "warn" : "ok",
    note: f.admins.map((a) => `${a.name} ${a.twoStep ? "✓" : "✗"}`).join(" · "), at: null, by: null, auto: true });
  out.push({ key: "texting", title: "Texting 10DLC", how: "Each salon's text number registered with the carriers (set per salon on its page)",
    status: f.texting.waiting ? "warn" : f.texting.approved ? "ok" : "not_set",
    note: f.texting.waiting ? `${f.texting.waiting} waiting (${f.texting.waitingNames.join(", ")})` : f.texting.approved ? `${f.texting.approved} approved` : "No salon texting yet",
    at: null, by: null, auto: true });
  out.push({ key: "stripe", title: "Stripe messages", how: "Card payment messages reach us and match a ticket",
    status: f.stripe.payWeek > f.stripe.payMatched ? "warn" : f.stripe.week ? "ok" : "not_set",
    note: f.stripe.week ? `${f.stripe.payMatched} of ${f.stripe.payWeek} payments matched · 7 days` : "No messages in 7 days (webhook secret set?)",
    at: f.stripe.last, by: null, auto: true });
  return out;
}

/** Worst first: problems, then checks to do, then not set, then OK. */
export function sortChecks(list: Check[]): Check[] {
  const rank: Record<CheckStatus, number> = { bad: 0, warn: 1, not_set: 2, ok: 3 };
  return [...list].sort((a, b) => rank[a.status] - rank[b.status]);
}

export const totalCents = (c: Cost[]) => c.reduce((n, x) => n + x.cents, 0);

/** "Live · all normal" / "2 to check" / "1 problem" for the page header. */
export function summary(list: Check[]): { level: "good" | "warn" | "bad"; text: string } {
  const bad = list.filter((c) => c.status === "bad").length, warn = list.filter((c) => c.status === "warn" || c.status === "not_set").length;
  if (bad) return { level: "bad", text: `${bad} problem${bad === 1 ? "" : "s"}` };
  if (warn) return { level: "warn", text: `${warn} to check` };
  return { level: "good", text: "All normal" };
}

/** Test copy (no admin login): the board's sample numbers. */
export function sampleSystem(now = new Date()): SystemFacts {
  const ago = (d: number) => new Date(now.getTime() - d * DAY).toISOString();
  const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return {
    now: now.toISOString(), salons: 6,
    stripe: { day: 41, week: 1284, payWeek: 612, payMatched: 612, last: ago(0.01) },
    admins: [{ name: "Oliver", twoStep: true }, { name: "Elang", twoStep: true }],
    texting: { waiting: 1, waitingNames: ["Lily Nails"], approved: 4 },
    checks: [
      { key: "backups", status: "ok", note: "daily + point-in-time", at: ago(2), by: "Oliver" },
      { key: "restore_test", status: "ok", note: "restore took 4 min", at: ago(17), by: "Oliver" },
      { key: "data_walls", status: "ok", note: "every change · 2 fake salons", at: ago(1), by: "Oliver" },
      { key: "sentry", status: "ok", note: "7 errors · 0 new types", at: ago(1), by: "Elang" },
      { key: "uptime", status: "ok", note: "app + Stripe webhook · 99.98%", at: ago(1), by: "Elang" },
    ],
    month,
    costs: [{ name: "Twilio (texts + numbers)", cents: 3100 }, { name: "Supabase", cents: 2500 }, { name: "Vercel", cents: 2000 }, { name: "Domain + email", cents: 800 }],
    lastCosts: [],
  };
}
