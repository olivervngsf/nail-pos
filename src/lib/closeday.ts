// Close day + payout sheet (M10): shapes from the server (day_summary, payout_sheet), drawer counting, payroll CSV,
// and sample data for the test copy (sign-in off). Money in integer cents everywhere.

export const BILLS = [100, 50, 20, 10, 5, 1] as const;
export type Counts = Partial<Record<(typeof BILLS)[number], number>>;

/** Cash counted in the drawer: bills (whole dollars) + loose coins in cents. */
export function countCents(counts: Counts, coinsCents = 0): number {
  return BILLS.reduce((a, b) => a + b * 100 * Math.max(0, Math.floor(counts[b] ?? 0)), 0) + Math.max(0, Math.round(coinsCents));
}

export type OpenTicket = { id: string; number: number; client: string | null; total_cents: number; created_at: string; staff: string | null; services: string | null };
export type TipRow = { id: string; name: string; card_cents: number; cash_cents: number; fee_cents: number; total_cents: number };
export type DayClose = { day: string; start_cents: number; cash_expected_cents: number; cash_counted_cents: number; cash_removed_cents: number;
  diff_reason: string; card_stripe_cents: number | null; closed_at: string; left_open: { id: string; number: number; reason: string }[] };
export type DaySummary = {
  day: string;
  open: OpenTicket[];
  sales: { tickets: number; services_cents: number; discount_cents: number; gift_sold_cents: number; tips_cents: number; total_cents: number };
  paid: { card_count: number; card_cents: number; cash_count: number; cash_cents: number; gift_cents: number; fee_cents: number; extra_count: number; extra_cents: number };
  refunds: { count: number; cents: number; cash_cents: number; card_cents: number };
  cash: { start_cents: number; taken_cents: number; refunded_cents: number; expected_cents: number };
  card_cents: number;
  tips: TipRow[];
  closed: DayClose | null;
  unmatched_cents: number;
};

export type PayoutRow = {
  membership_id: string; name: string; role: string; pay_type: "commission" | "hourly" | "booth_rent" | null; commission_pct: number | null;
  hourly_cents: number | null; check_pct: number; tickets: number; services_cents: number; minutes: number; pay_cents: number;
  tips_card_cents: number; tips_cash_cents: number; tip_fee_cents: number; total_cents: number; check_cents: number; cash_cents: number;
};

/** Numbers from the server arrive as strings for bigint columns; make them numbers. */
export function nums<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && k !== "name" ? Number(v) : v])) as T;
}

/** Day as YYYY-MM-DD in the device's own calendar. */
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}
/** Monday of the week that holds `day`. */
export function weekStart(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return addDays(day, -((dt.getDay() + 6) % 7));
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollars = (c: number) => (c / 100).toFixed(2);

/** Payroll export: one row per person, plain dollars, ready to paste into Gusto / QuickBooks (or hand to the accountant). */
export function payoutCsv(rows: PayoutRow[], from: string, to: string): string {
  const head = ["Name", "Pay type", "Period start", "Period end", "Hours", "Services", "Commission %", "Commission / wages", "Card tips", "Cash tips",
    "Card fee on tips", "Total pay", "By check", "In cash"];
  const lines = rows.map((r) => [r.name, r.pay_type ?? "", from, to, (r.minutes / 60).toFixed(2), dollars(r.services_cents), r.pay_type === "commission" ? String(r.commission_pct ?? 0) : "",
    dollars(r.pay_cents), dollars(r.tips_card_cents), dollars(r.tips_cash_cents), dollars(r.tip_fee_cents), dollars(r.total_cents), dollars(r.check_cents), dollars(r.cash_cents)]);
  return [head, ...lines].map((l) => l.map(csvCell).join(",")).join("\n") + "\n";
}

/* ---------- test copy (sign-in off) ---------- */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function demoDay(day: string): DaySummary {
  const tips: TipRow[] = [["Kim", 7400, 1600], ["Ngọc", 5200, 2000], ["Tuyết", 3800, 1200]].map(([name, card, cash], i) => (
    { id: id(1 + i), name: name as string, card_cents: card as number, cash_cents: cash as number, fee_cents: 0, total_cents: (card as number) + (cash as number) }));
  return {
    day,
    open: [
      { id: id(501), number: 1041, client: "Hailey", total_cents: 5500, created_at: `${day}T12:45:00`, staff: "Kim", services: "Fill + paint" },
      { id: id(502), number: 1042, client: "Rosa", total_cents: 4500, created_at: `${day}T12:50:00`, staff: "Tuyết", services: "Gel" },
    ],
    sales: { tickets: 39, services_cents: 164200, discount_cents: 3800, gift_sold_cents: 10000, tips_cents: 22800, total_cents: 193200 },
    paid: { card_count: 28, card_cents: 146200, cash_count: 11, cash_cents: 41000, gift_cents: 6000, fee_cents: 4362, extra_count: 0, extra_cents: 0 },
    refunds: { count: 0, cents: 0, cash_cents: 0, card_cents: 0 },
    cash: { start_cents: 15000, taken_cents: 41000, refunded_cents: 0, expected_cents: 56000 },
    card_cents: 146200,
    tips,
    closed: null,
    unmatched_cents: 0,
  };
}
export function demoPayout(): PayoutRow[] {
  const base = (n: number, name: string, svc: number, tc: number, tk: number, check: number): PayoutRow => {
    const pay = Math.round(svc * 0.6), total = pay + tc + tk, ck = Math.round(total * check / 100);
    return { membership_id: id(n), name, role: "tech", pay_type: "commission", commission_pct: 60, hourly_cents: null, check_pct: check, tickets: Math.round(svc / 4500),
      services_cents: svc, minutes: 0, pay_cents: pay, tips_card_cents: tc, tips_cash_cents: tk, tip_fee_cents: 0, total_cents: total, check_cents: ck, cash_cents: total - ck };
  };
  return [base(1, "Kim", 186000, 41000, 9000, 60), base(2, "Ngọc", 154000, 33000, 12000, 100), base(3, "Tuyết", 120000, 24000, 8000, 50)];
}
