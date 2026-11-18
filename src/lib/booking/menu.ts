// Add a service to the salon's menu from the desk (one-time service → "Save to menu").
// Needs an owner/manager OK (approve_discount purpose 'menu'); the server checks it, uses it once and logs who approved.
import { rpc } from "@/lib/auth";

export type NewMenuService = { name: string; cat: string; minutes: number; cents: number };

/** Parse the custom-service form. Null when name or price can't be read. Minutes default 30, at least 5. */
export function readCustom(f: { name: string; price: string; min: string }): { name: string; minutes: number; cents: number } | null {
  const name = f.name.trim().replace(/\s+/g, " ");
  const cents = Math.round(parseFloat(f.price.replace(/[^0-9.]/g, "")) * 100);
  if (!name || !Number.isFinite(cents) || cents < 0) return null;
  return { name, minutes: Math.min(600, Math.max(5, parseInt(f.min, 10) || 30)), cents };
}

/** Same name already on the menu (any case, extra spaces ignored)? */
export function onMenu(name: string, services: { name: string }[]): boolean {
  const n = name.trim().replace(/\s+/g, " ").toLowerCase();
  return services.some((s) => s.name.trim().replace(/\s+/g, " ").toLowerCase() === n);
}

/** Saves it and returns the new service id. Test copy: a made-up id, nothing sent. */
export async function addToMenu(mode: "demo" | "live", salonId: string, s: NewMenuService, approvalId: string | undefined): Promise<string> {
  if (mode === "demo") return crypto.randomUUID();
  return rpc<string>("menu_add_service", { p: { salonId, approvalId, name: s.name, cat: s.cat, minutes: s.minutes, cents: s.cents } });
}
