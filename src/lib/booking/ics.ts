// "Add to calendar" file for a booking. Times are the salon's wall-clock time with the salon's time zone (TZID),
// so phones show "9:30 AM" in the salon's zone instead of a UTC/GMT time.

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-11-19" + 570 min → "20261119T093000" (wall time, no zone). */
export const icsLocal = (day: string, min: number) => {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 0, min));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
};
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function bookingIcs(b: { day: string; start: number; minutes: number; timeZone?: string | null; title: string; location?: string | null; uid: string; now?: Date }) {
  const tz = b.timeZone || "America/Los_Angeles";
  const now = (b.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PolishOS//Booking//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${b.uid}@polishosapp.com`, `DTSTAMP:${now}`,
    `DTSTART;TZID=${tz}:${icsLocal(b.day, b.start)}`, `DTEND;TZID=${tz}:${icsLocal(b.day, b.start + b.minutes)}`,
    `SUMMARY:${esc(b.title)}`, ...(b.location ? [`LOCATION:${esc(b.location)}`] : []),
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
