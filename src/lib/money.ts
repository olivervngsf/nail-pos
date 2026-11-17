// Money is always integer cents (6500 = $65.00). Round once, at the edge, never twice.

/** 6500 → "$65.00"; -1000 → "−$10.00" */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`cents must be an integer, got ${cents}`);
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** "65", "65.5", "$1,065.50" → cents. Returns null when not a money amount. */
export function parseDollars(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [d, c = ""] = s.split(".");
  return Number(d) * 100 + Number(c.padEnd(2, "0"));
}

/** Percent of an amount in cents, rounded half up to the cent (20% of $65 = 1300). */
export function percentOf(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}

/** Stripe-style card fee: pct% + fixed cents, rounded once. 2.7% + 5¢ on $83 = 229. */
export function cardFee(cents: number, pct: number, fixedCents: number): number {
  return Math.round((cents * pct) / 100) + fixedCents;
}

/** Split an amount into parts by weights without losing a cent (leftover cents go to the first parts). */
export function splitCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("weights must add up to more than 0");
  const raw = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - raw.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % raw.length, left--) raw[i]++;
  return raw;
}
