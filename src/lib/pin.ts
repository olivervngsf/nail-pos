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
  try { localStorage.setItem(key(salon), JSON.stringify({ ...DEFAULT_RULES, ...r })); } catch { /* storage blocked */ }
}
