import { describe, expect, it } from "vitest";
import { manageUrl, noticeEmail, noticeSms, type Notice } from "./notice";

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
