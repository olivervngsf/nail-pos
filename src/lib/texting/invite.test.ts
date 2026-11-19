import { describe, expect, it } from "vitest";
import { explainTextError, inviteBody, noAccents } from "./invite";
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
