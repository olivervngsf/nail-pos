import { describe, expect, it } from "vitest";
import { DEFAULT_CONTACT, canContact, dialNumber, reminderBody, seesFullPhone, smsHref, telHref } from "./clientContact";

describe("client contact", () => {
  it("owner always may; others by the salon's pick", () => {
    const s = { call: ["manager" as const], text: [] };
    expect(canContact(s, "owner", "text")).toBe(true);
    expect(canContact(s, "manager", "call")).toBe(true);
    expect(canContact(s, "manager", "text")).toBe(false);
    expect(canContact(s, "front_desk", "call")).toBe(false);
    expect(canContact(DEFAULT_CONTACT, "tech", "call")).toBe(false);
    expect(canContact(DEFAULT_CONTACT, "front_desk", "text")).toBe(true);
  });
  it("only the owner sees the full phone", () => {
    expect(seesFullPhone("owner")).toBe(true);
    expect(seesFullPhone("manager")).toBe(false);
  });
  it("makes dial + message links", () => {
    expect(dialNumber("(612) 545-7011")).toBe("+16125457011");
    expect(dialNumber("1-612-545-7011")).toBe("+16125457011");
    expect(telHref("6125457011")).toBe("tel:+16125457011");
    expect(smsHref("6125457011", "Hi Lan")).toBe("sms:+16125457011?&body=Hi%20Lan");
  });
  it("writes the reminder in the client's words", () => {
    expect(reminderBody({ first: "Lan", salon: "Lotus Nails", when: "Tue, Dec 1 at 12:00 PM" }))
      .toBe("Hi Lan, a reminder from Lotus Nails: your appointment is Tue, Dec 1 at 12:00 PM. Reply or call us to change it.");
    expect(reminderBody({ first: "", salon: "Lotus", when: "today 3:00 PM" }, "vi")).toContain("Chào bạn");
  });
});
