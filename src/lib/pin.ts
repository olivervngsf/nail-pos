// PIN rules (owner sets in Settings → PIN rules): 6 or 10 digits, wrong-PIN lock, auto-lock. Each PIN keeps its own
// length, so after a rule change the old PIN works once and the faces screen asks for a new one (server: pin_set_new).
export type PinRules = {
  length: 6 | 10;
  lock_after: 3 | 5 | 10;
  lock_minutes: 1 | 5;
  idle_minutes: 1 | 2 | 5 | 10;
  text_owner: boolean;
  ask_discount: boolean;
  ask_refund: boolean;
  ask_void: boolean;
  ask_no_sale: boolean;
};

export const DEFAULT_RULES: PinRules = {
  length: 6, lock_after: 5, lock_minutes: 1, idle_minutes: 2, text_owner: true,
  ask_discount: true, ask_refund: true, ask_void: true, ask_no_sale: true,
};

/** Same check as the server (_pin_bad): right length, not one digit repeated, not a run like 123456 (runs allowed for 10 = phone numbers). */
export function pinProblem(pin: string, length: number): "length" | "same" | "run" | null {
  if (!new RegExp(`^\\d{${length}}$`).test(pin)) return "length";
  if (/^(\d)\1*$/.test(pin)) return "same";
  if (length < 10 && ("01234567890".includes(pin) || "09876543210".includes(pin))) return "run";
  return null;
}

/** Keypad length for one person: their own PIN's length if they have one, else the salon rule. */
export const keypadLength = (personLen: number | null | undefined, rules: Pick<PinRules, "length">) => personLen || rules.length;

const key = (salon: string) => `nailpos.pinrules.${salon}`;
export function cachedRules(salon: string | null | undefined): PinRules {
  if (!salon) return DEFAULT_RULES;
  try { const r = localStorage.getItem(key(salon)); return r ? { ...DEFAULT_RULES, ...(JSON.parse(r) as Partial<PinRules>) } : DEFAULT_RULES; } catch { return DEFAULT_RULES; }
}
export function saveRules(salon: string, r: Partial<PinRules>) {
  try {
    localStorage.setItem(key(salon), JSON.stringify({ ...DEFAULT_RULES, ...r }));
    localStorage.setItem("nailpos.pinrule", String(r.length ?? DEFAULT_RULES.length));
    localStorage.setItem("nailpos.idle", String((r.idle_minutes ?? DEFAULT_RULES.idle_minutes) * 60_000));
  } catch { /* storage blocked */ }
}

/* Keypad length per person on this device: remembered from the staff lists (desk_staff / today_staff carry pin_len). */
const LENS = "nailpos.pinlens";
const RULE = "nailpos.pinrule";
export function rememberPinLens(rows: { id: string; len: number | null | undefined }[], ruleLen?: number) {
  try {
    const cur = JSON.parse(localStorage.getItem(LENS) || "{}") as Record<string, number>;
    for (const r of rows) if (r.len) cur[r.id] = r.len; else delete cur[r.id];
    localStorage.setItem(LENS, JSON.stringify(cur));
    if (ruleLen) localStorage.setItem(RULE, String(ruleLen));
  } catch { /* storage blocked */ }
}
/** How many digits this person's PIN has (their own length, else the salon rule, else 6). */
export function pinLenFor(id?: string | null): number {
  try {
    const own = id ? (JSON.parse(localStorage.getItem(LENS) || "{}") as Record<string, number>)[id] : undefined;
    return own || Number(localStorage.getItem(RULE)) || DEFAULT_RULES.length;
  } catch { return DEFAULT_RULES.length; }
}
