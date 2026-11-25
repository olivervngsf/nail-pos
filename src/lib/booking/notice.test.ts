import { describe, expect, it } from "vitest";
import { manageUrl, noticeEmail, noticeSms, reminderEmail, reminderSms, type Notice } from "./notice";

const one: Notice = {
  salon: { name: "Lotus Nails & Spa", phone: "+14085550100", address: "1550 S Bascom Ave, Campbell", slug: "lotus", cancelHours: 2 },
  name: "Lan", day: "2026-11-19", start: 13 * 60 + 15,
  guests: [{ name: "Lan", staff: "Kim", minutes: 45, services: [{ name: "Regular spa pedicure", minutes: 45, cents: 3800 }] }],
};
const link = manageUrl("https://polishosapp.com", "084f465d63984d23ae69958d04fca647");

describe("booking confirmation", () => {
  it("text: salon, when, tech, link, STOP; plain letters only; at most 2 text parts", () => {
    const s = noticeSms(one, link);
    expect(s).toContain("Lotus Nails & Spa: You're booked Thu, Nov 19 at 1:15 PM with Kim.");
    expect(s).toContain(link);
    expect(s).toContain("Reply STOP");
    expect(/^[\x20-\x7e]*$/.test(s)).toBe(true);
    expect(s.length).toBeLessThanOrEqual(306);
  });

  it("email: subject, time range, service + price, total, address, phone, change link", () => {
    const m = noticeEmail(one, link);
    expect(m.subject).toBe("You're booked at Lotus Nails & Spa: Thu, Nov 19 at 1:15 PM");
    expect(m.text).toContain("Thursday, November 19 at 1:15 PM – 2:00 PM with Kim");
    expect(m.text).toContain("- Regular spa pedicure (Kim)  $38.00");
    expect(m.text).toContain("Total: $38.00");
    expect(m.text).toContain("Call: (408) 555-0100");
    expect(m.text).toContain(`Change or cancel (free up to 2 hours before): ${link}`);
    expect(m.html).toContain(`href="${link}"`);
    expect(m.html).toContain("Lotus Nails &amp; Spa");
  });

  it("group: each guest named; a typed name can't inject HTML", () => {
    const g: Notice = { ...one, name: "<b>Sara</b>", guests: [one.guests[0], { name: "Ana", staff: "Tuyet", minutes: 60, services: [{ name: "Gel manicure", minutes: 60, cents: 4500 }] }] };
    const m = noticeEmail(g, link);
    expect(m.text).toContain("- Ana: Gel manicure (Tuyet)  $45.00");
    expect(m.text).toContain("Total: $83.00");
    expect(m.text).toContain("– 2:15 PM with Kim & Tuyet");
    expect(m.html).not.toContain("<b>Sara</b>");
    expect(m.html).toContain("&lt;b&gt;Sara&lt;/b&gt;");
  });
});

describe("booking reminders", () => {
  it("day before: tomorrow, when, tech, link, STOP, plain, at most 2 parts", () => {
    const s = reminderSms(one, link, "day_before");
    expect(s).toBe(`Lotus Nails & Spa: Reminder, see you tomorrow Thu, Nov 19 at 1:15 PM with Kim. Change or cancel: ${link} Reply STOP to opt out.`);
    expect(/^[\x20-\x7e]*$/.test(s)).toBe(true);
    expect(s.length).toBeLessThanOrEqual(306);
  });
  it("2 hours: today, time, link", () => {
    expect(reminderSms(one, link, "two_hours")).toBe(`Lotus Nails & Spa: See you today at 1:15 PM with Kim. Running late or can't come? ${link} Reply STOP to opt out.`);
  });
  it("email: reminder subject + greeting, same booking details and link", () => {
    const d = reminderEmail(one, link, "day_before");
    expect(d.subject).toBe("Reminder: Lotus Nails & Spa tomorrow, Thu, Nov 19 at 1:15 PM");
    expect(d.text).toContain("Hi Lan, see you tomorrow at Lotus Nails & Spa.");
    expect(d.text).toContain("- Regular spa pedicure (Kim)  $38.00");
    expect(d.html).toContain("See you tomorrow, Lan");
    expect(d.html).toContain(link);
    const t = reminderEmail(one, link, "two_hours");
    expect(t.subject).toBe("See you today at 1:15 PM: Lotus Nails & Spa");
    expect(t.html).toContain("See you today, Lan");
  });
});
