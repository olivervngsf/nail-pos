// Week starts on (Nov 26, Oliver): each salon picks Monday (default) or Sunday in Settings → Salon info.
// Saved on the salon (week_start_get / week_start_save); every device keeps a copy so it works offline.
// One rule for every "this week" (payout sheet, earnings, time clock, timesheet, tech schedule), the calendar's
// week + month views and every date picker.
export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday
const KEY = "nailpos.weekStart";
export const WEEK_START_EVT = "nailpos:weekstart";

export function getWeekStart(): WeekStart {
  try { return typeof window !== "undefined" && localStorage.getItem(KEY) === "0" ? 0 : 1; } catch { return 1; }
}
export function setWeekStartLocal(v: WeekStart) {
  try { localStorage.setItem(KEY, String(v)); } catch { /* private mode: default Monday */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WEEK_START_EVT));
}
/** Days to step back from a weekday (0 = Sun … 6 = Sat) to the start of its week. */
export const backDays = (dow: number, ws: WeekStart = getWeekStart()) => (dow - ws + 7) % 7;
/** Weekdays in display order, as JS day numbers (Monday first → [1,2,3,4,5,6,0]). */
export const weekdayOrder = (ws: WeekStart = getWeekStart()) => Array.from({ length: 7 }, (_, i) => (ws + i) % 7);
