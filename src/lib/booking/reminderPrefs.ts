// When booking reminders go out (Settings → Booking reminders). Pure (tested in reminderPrefs.test.ts).
// The database applies the same choice to every reminder (trigger _reminder_timing), so these are just the picks.
export const FIRST_HOURS = [0, 12, 24, 48] as const;   // first reminder: off / hours before the booking
export const SECOND_HOURS = [0, 1, 2, 3] as const;     // second reminder
export type ReminderPrefs = { first: number; second: number; testUntil: string | null; timeZone?: string | null };

export const DEFAULT_PREFS: ReminderPrefs = { first: 24, second: 2, testUntil: null };

/** "24h before" / "Off" (hours written without a space, house style). */
export function hoursLabel(h: number, lang: "en" | "vi" = "en"): string {
  if (!h) return lang === "vi" ? "Tắt" : "Off";
  return lang === "vi" ? `${h}h trước` : `${h}h before`;
}

/** Test mode still on? (24h window set by the server.) */
export function testOn(p: Pick<ReminderPrefs, "testUntil">, now = new Date()): boolean {
  return !!p.testUntil && new Date(p.testUntil).getTime() > now.getTime();
}

/** One line for the owner: what a client gets after booking. */
export function plan(p: ReminderPrefs, lang: "en" | "vi" = "en", now = new Date()): string {
  const parts = [p.first ? hoursLabel(p.first, lang) : null, p.second ? hoursLabel(p.second, lang) : null].filter(Boolean) as string[];
  const base = lang === "vi"
    ? (parts.length ? `Khách nhận xác nhận ngay, rồi nhắc lịch ${parts.join(" và ")}.` : "Khách chỉ nhận xác nhận, không nhắc lịch.")
    : (parts.length ? `Clients get a confirmation right away, then a reminder ${parts.join(" and ")}.` : "Clients get the confirmation only, no reminders.");
  return testOn(p, now) ? base + (lang === "vi" ? " Đang thử: nhắc lần 2 gửi 3 phút sau khi đặt." : " Testing: the 2nd reminder goes 3 minutes after booking.") : base;
}
