import { describe, expect, it } from "vitest";
import { explainTextError, inviteBody, inviteEndsBody, inviteEndsDue, localHour, noAccents } from "./invite";
import { textParts } from "./parts";

const link = "https://polishosapp.com/join/AB12CD34";

describe("inviteBody", () => {
  it("English names the owner, salon, link and STOP", () => {
    const b = inviteBody({ salon: "Lotus Nails", owner: "Mai Tran", link });
    expect(b).toBe(`PolishOS: Mai at Lotus Nails added you to the team. Join and set your PIN: ${link} Reply STOP to stop.`);
    expect(textParts(b).parts).toBe(1);
  });
  it("Vietnamese has no accents so it stays one plain text part", () => {
    const b = inviteBody({ salon: "Tiệm Hoa Sen", owner: "Đào", link, lang: "vi" });
    expect(b).toContain("Dao o tiem Tiem Hoa Sen da them ban");
    expect(textParts(b).plain).toBe(true);
    expect(textParts(b).parts).toBe(1);
  });
  it("works without an owner name", () => {
    expect(inviteBody({ salon: "Lotus", link })).toMatch(/^PolishOS: Lotus added you/);
  });
});

describe("noAccents", () => {
  it("drops Vietnamese marks", () => expect(noAccents("Nguyễn Thị Đẹp")).toBe("Nguyen Thi Dep"));
});

describe("explainTextError", () => {
  it("explains an unregistered number", () => expect(explainTextError("twilio 30034")).toMatch(/isn't registered.*code 30034/));
  it("reads a code from the sender's own error", () => expect(explainTextError("21610: Attempt to send to unsubscribed")).toMatch(/STOP/));
  it("passes unknown text through", () => expect(explainTextError("network: down")).toBe("network: down"));
  it("nothing for no error", () => expect(explainTextError(null)).toBeNull());
});

describe("inviteEndsBody", () => {
  it("English: salon, ends tomorrow, link, STOP, one part", () => {
    const b = inviteEndsBody({ salon: "Lotus Nails", link });
    expect(b).toBe(`PolishOS: your invite to join Lotus Nails ends tomorrow. Join and set your PIN: ${link} Reply STOP to stop.`);
    expect(textParts(b).parts).toBe(1);
  });
  it("Vietnamese without accents, one plain part", () => {
    const b = inviteEndsBody({ salon: "Tiệm Hoa Sen", link, lang: "vi" });
    expect(b).toContain("tiem Tiem Hoa Sen het han ngay mai");
    expect(textParts(b).plain).toBe(true);
    expect(textParts(b).parts).toBe(1);
  });
});

describe("inviteEndsDue", () => {
  // 2026-11-25 18:00 UTC = 10 AM in Los Angeles
  const now = new Date("2026-11-25T18:00:00Z");
  const inHours = (h: number) => new Date(now.getTime() + h * 3600_000);
  it("sends when the invite ends within a day, in the daytime", () => {
    expect(inviteEndsDue({ expiresAt: inHours(20), now, timeZone: "America/Los_Angeles" })).toBe(true);
    expect(inviteEndsDue({ expiresAt: inHours(24), now, timeZone: "America/Los_Angeles" })).toBe(true);
  });
  it("waits while more than a day is left", () => {
    expect(inviteEndsDue({ expiresAt: inHours(30), now, timeZone: "America/Los_Angeles" })).toBe(false);
  });
  it("skips an invite ending within the hour or already ended", () => {
    expect(inviteEndsDue({ expiresAt: inHours(0.5), now, timeZone: "America/Los_Angeles" })).toBe(false);
    expect(inviteEndsDue({ expiresAt: inHours(-2), now, timeZone: "America/Los_Angeles" })).toBe(false);
  });
  it("never texts at night where the salon is", () => {
    const night = new Date("2026-11-26T06:00:00Z"); // 10 PM in Los Angeles
    expect(inviteEndsDue({ expiresAt: new Date(night.getTime() + 10 * 3600_000), now: night, timeZone: "America/Los_Angeles" })).toBe(false);
    // ...but it is 1 AM in New York 3 hours later, also night; 9 AM New York is fine
    const nyMorning = new Date("2026-11-26T14:00:00Z");
    expect(inviteEndsDue({ expiresAt: new Date(nyMorning.getTime() + 5 * 3600_000), now: nyMorning, timeZone: "America/New_York" })).toBe(true);
  });
  it("reads the local hour, bad time zone falls back to UTC", () => {
    expect(localHour(now, "America/Los_Angeles")).toBe(10);
    expect(localHour(now, "Not/AZone")).toBe(18);
  });
});
