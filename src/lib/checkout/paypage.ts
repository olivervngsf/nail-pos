// Client pay page (pay link / QR): the two layouts an owner can pick, and the tip maths both the page and the server use.
import { splitCents } from "@/lib/money";

/** "receipt" = bill first, then tip. "quick" = everything in one card. */
export type PayLayout = "receipt" | "quick";
export const PAY_LAYOUTS: PayLayout[] = ["receipt", "quick"];
export const asLayout = (v: unknown): PayLayout => (v === "quick" ? "quick" : "receipt");

/** How one tip is shared when two or more techs worked on the ticket. */
export type TipSplit = "service" | "even";
export const asSplit = (v: unknown): TipSplit => (v === "even" ? "even" : "service");

/** One service on the pay page: what, who (first name only), how much. */
export type PayLine = { name: string; tech: string | null; cents: number };
/** One tech on the ticket with the total of their services. */
export type PayTech = { name: string; cents: number };

/** First name only: the pay page is public, so never a last name. */
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** Service lines → techs in ticket order, each with their service total. `key` tells two people apart (same first name). */
export function techTotals<K>(lines: { key: K | null; name: string; cents: number }[]): { key: K; name: string; cents: number }[] {
  const out: { key: K; name: string; cents: number }[] = [];
  for (const l of lines) {
    if (l.key == null) continue;
    const hit = out.find((t) => t.key === l.key);
    if (hit) hit.cents += l.cents; else out.push({ key: l.key, name: l.name, cents: l.cents });
  }
  return out;
}

/** Who gets how much of the tip. Same rule on the page and on the server, so the client sees what the tech gets. */
export function tipShares(tipCents: number, techCents: number[], split: TipSplit): number[] {
  if (!techCents.length) return [];
  if (tipCents <= 0) return techCents.map(() => 0);
  return splitCents(tipCents, techCents.map((c) => (split === "even" ? 1 : c || 1)));
}

/** "Vy" · "Kim and Vy" · null when there is nobody or more than two (the page then says "your nail techs"). */
export function techNames(techs: PayTech[], and: string): string | null {
  const names = techs.map((t) => t.name).filter(Boolean);
  if (names.length !== techs.length || !names.length || names.length > 2) return null;
  return names.join(` ${and} `);
}
