// Short service codes for fast booking at the desk ("P1 G3" + Enter adds both), group colors, and a forgiving time parser.
// Codes come from the menu order: one letter per group + its place in the group, so they stay the same until the owner reorders.

export type Coded<S> = S & { code: string };

const PREFIX: Record<string, string> = {
  Pedicures: "P", Manicures: "M", "Gel color": "G", "Add-ons": "A", Enhancements: "E", Dipping: "D", Waxing: "W", Custom: "C",
};

/** Group colors: [soft background, strong text]. Text colors pass 4.5:1 on white. */
export const CAT_COLOR: Record<string, [string, string]> = {
  Pedicures: ["#EAF4FB", "#1C6A9C"], Manicures: ["#FCEFF5", "#A61E64"], "Gel color": ["#F3EEFC", "#6741D9"], "Add-ons": ["#F2F2F5", "#5E5E66"],
  Enhancements: ["#FFF3E6", "#A35200"], Dipping: ["#EAF6EF", "#1F7A3E"], Waxing: ["#FBF5E3", "#7A5E00"],
};
export const catColor = (cat: string): [string, string] => CAT_COLOR[cat] ?? ["#EEF1F4", "#3B4A5A"];

/** Give every service a code (P1, P2, G1…). Unknown groups get their first free letter. */
export function withCodes<S extends { cat: string }>(services: S[]): Coded<S>[] {
  const used = new Set(Object.values(PREFIX));
  const pre: Record<string, string> = { ...PREFIX };
  const n: Record<string, number> = {};
  return services.map((s) => {
    if (!pre[s.cat]) {
      const letters = (s.cat.toUpperCase().replace(/[^A-Z]/g, "") + "XYZQ").split("");
      const free = letters.find((l) => !used.has(l)) ?? "X";
      used.add(free);
      pre[s.cat] = free;
    }
    const p = pre[s.cat];
    n[p] = (n[p] ?? 0) + 1;
    return { ...s, code: `${p}${n[p]}` };
  });
}

/** "p1 g3" / "P1,G3" → those services, in order. Empty if any word isn't a code (then it's a name search). */
export function codeHits<S extends { code: string }>(q: string, coded: S[]): S[] {
  const words = q.toUpperCase().split(/[\s,+]+/).filter(Boolean);
  if (!words.length) return [];
  const by = new Map(coded.map((s) => [s.code, s]));
  const hits = words.map((w) => by.get(w));
  return hits.every(Boolean) ? (hits as S[]) : [];
}

/**
 * Typed start time → minutes since midnight, snapped to 5 min. Salon hours, so "2:30" means 2:30 PM.
 * Accepts 2:30, 230, 230p, 2:30 pm, 14:30, 9a. Returns null if it can't be read or is outside open..close.
 */
export function parseTime(text: string, open = 8 * 60, close = 21 * 60): number | null {
  const m = text.trim().toLowerCase().replace(/[\s.]/g, "").match(/^(\d{1,2})(?::?(\d{2}))?(a|p|am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  const ap = m[3]?.[0];
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (!ap && h < 8) h += 12;
  const t = Math.round((h * 60 + min) / 5) * 5;
  return t >= open && t <= close ? t : null;
}
