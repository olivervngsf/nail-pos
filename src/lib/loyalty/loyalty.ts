"use client";
// Loyalty (M12): the salon's rule + a client's points. Points are written only on the server when a ticket is paid
// (ledger); this file only reads them and works out "ready". Test copy: a sample rule + Lan with 105 points.
import { rpc } from "@/lib/auth";

export type LoyaltyRule = { on: boolean; kind: "points" | "visits"; pointsPerDollar: number; rewardPoints: number; rewardCents: number };
export type ClientLoyalty = { clientId?: string; points: number; kind: "points" | "visits"; pointsPerDollar: number; rewardPoints: number; rewardCents: number; ready: boolean };

export const DEMO_RULE: LoyaltyRule = { on: true, kind: "points", pointsPerDollar: 1, rewardPoints: 100, rewardCents: 1000 };
const DEMO_KEY = "nailpos.demoLoyalty.v1";
export function demoRule(): LoyaltyRule { try { return { ...DEMO_RULE, ...JSON.parse(localStorage.getItem(DEMO_KEY) || "{}") }; } catch { return DEMO_RULE; } }
export function saveDemoRule(r: LoyaltyRule) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(r)); } catch { /* */ } }

/** Points this paid amount earns (same rule as the server: service price after discounts/reward, never tips or gift cards). */
export const pointsFor = (r: Pick<LoyaltyRule, "kind" | "pointsPerDollar">, serviceCents: number) =>
  r.kind === "visits" ? 1 : Math.max(0, Math.floor((serviceCents / 100) * r.pointsPerDollar));
/** How far to the next reward (0 = ready). */
export const toNext = (points: number, rewardPoints: number) => Math.max(0, rewardPoints - points);

export async function clientLoyalty(live: boolean, salonId: string, phone: string, clientId?: string): Promise<ClientLoyalty | null> {
  if (!live) {
    const r = demoRule();
    if (!r.on || phone !== "+14085550142") return r.on ? { points: 0, kind: r.kind, pointsPerDollar: r.pointsPerDollar, rewardPoints: r.rewardPoints, rewardCents: r.rewardCents, ready: false } : null;
    return { points: 105, kind: r.kind, pointsPerDollar: r.pointsPerDollar, rewardPoints: r.rewardPoints, rewardCents: r.rewardCents, ready: 105 >= r.rewardPoints };
  }
  return rpc<ClientLoyalty | null>("loyalty_for_client", { p_salon: salonId, p_phone: phone, p_client: clientId ?? null });
}
