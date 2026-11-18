// What a booking needs a tech to be good at, from the services picked (facts only: the desk still decides who).
// Skills are the ones the owner ticks per person in Settings → Team (SKILLS in src/lib/team.ts).

const BY_CAT: Record<string, string> = {
  Pedicures: "Pedicure", "Gel color": "Gel", Dipping: "Dip", Enhancements: "Acrylic", Waxing: "Waxing", Lashes: "Lashes",
};

const BY_NAME: [RegExp, string][] = [
  [/\bnail art\b|\bdesign\b/, "Nail art"], [/\bacrylic\b|\bfull set\b|\bfill\b/, "Acrylic"], [/\bdip\b|\bsns\b/, "Dip"],
  [/\bpedicure\b/, "Pedicure"], [/\bgel\b/, "Gel"], [/\bwax/, "Waxing"], [/\blash/, "Lashes"],
];

/** Skills one service needs (a gel pedicure needs Gel and Pedicure); empty when any tech can do it. */
export function skillsFor(s: { cat?: string; name: string }): string[] {
  const n = s.name.toLowerCase();
  const hit = BY_NAME.filter(([re]) => re.test(n)).map(([, k]) => k);
  const cat = s.cat && BY_CAT[s.cat];
  return [...new Set(cat ? [cat, ...hit] : hit)];
}

/** Skills a list of services needs, once each, in order. */
export function skillsNeeded(services: { cat?: string; name: string }[]): string[] {
  return [...new Set(services.flatMap(skillsFor))];
}

/** Which of the needed skills this tech has, and which they don't. */
export function skillMatch(have: string[] | undefined, need: string[]) {
  const h = new Set((have ?? []).map((x) => x.toLowerCase()));
  const yes = need.filter((n) => h.has(n.toLowerCase()));
  return { yes, no: need.filter((n) => !yes.includes(n)), all: need.length > 0 && yes.length === need.length };
}
