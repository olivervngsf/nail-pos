// "Add to calendar" file for a booking (.ics). One template for every salon; the owner's own
// calendar note (parking, what to bring…) slots in from booking_settings.calendar_note.
// Times use the salon's time zone (TZID), so 11:00 AM at the salon stays 11:00 AM in any calendar.

export type IcsBooking = {
  uid: string;                 // first appointment id → re-download updates instead of duplicating
  salon: { name: string; address: string | null; phone: string | null; tz: string };
  day: string;                 // YYYY-MM-DD (salon day)
  start: number;               // minutes from midnight, salon time
  minutes: number;             // longest guest
  when: string;                // "Tue, Nov 17 · 11:00 AM"
  firstName: string;
  lines: string[];             // "Gel manicure · Kim"
  total: string;               // "$65" or "from $65"
  manageUrl: string;           // change / cancel link
  cancelHours: number;
  ownerNote?: string;          // owner text (parking, arrive early, …)
  alarmMin?: number;           // reminder before, minutes (default 60, 0 = none)
};

/** RFC 5545 text: escape \ ; , and newlines. */
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold lines over 75 bytes (continuation starts with a space). */
export function fold(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Salon wall time "20261117T110000" (day rollover safe). */
export function local(day: string, min: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 0, min));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`;
}

export function bookingIcs(b: IcsBooking, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const desc = [
    `Hi ${b.firstName}, see you ${b.when}.`,
    "",
    ...b.lines,
    `Est. total: ${b.total} (pay at the salon)`,
    "",
    `Change or cancel (up to ${b.cancelHours}h before):`,
    b.manageUrl,
    b.salon.phone ? `Call: ${b.salon.phone}` : "",
    b.ownerNote?.trim() ? `\n${b.ownerNote.trim()}` : "",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
  const rows = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EO Collective//PolishOS//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.uid}@polishosapp.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${b.salon.tz}:${local(b.day, b.start)}`,
    `DTEND;TZID=${b.salon.tz}:${local(b.day, b.start + Math.max(b.minutes, 15))}`,
    `SUMMARY:${icsText(`${b.salon.name} – ${b.lines.map((l) => l.split(" · ")[0]).join(", ")}`)}`,
    b.salon.address ? `LOCATION:${icsText(`${b.salon.name}, ${b.salon.address}`)}` : "",
    `DESCRIPTION:${icsText(desc)}`,
    `URL:${b.manageUrl}`,
    "STATUS:CONFIRMED", "TRANSP:OPAQUE",
    ...((b.alarmMin ?? 60) > 0 ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(`${b.salon.name} at ${b.when.split(" · ").pop()}`)}`,
      `TRIGGER:-PT${b.alarmMin ?? 60}M`, "END:VALARM"] : []),
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return rows.map(fold).join("\r\n") + "\r\n";
}
