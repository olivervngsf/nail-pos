import { describe, expect, it } from "vitest";
import { kindKey, messageStatus, salonTexting, type MessageRow } from "./status";

const now = new Date("2026-11-25T18:00:00Z"); // 10 AM in Los Angeles
const row = (p: Partial<MessageRow>): MessageRow => ({ id: "t1", channel: "sms", kind: "confirm", status: "sent", error: null, to: "••1234", at: now.toISOString(), ...p });
const st = (p: Partial<MessageRow>, n = now) => messageStatus(row(p), n, "America/Los_Angeles");

describe("messageStatus", () => {
  it("good: delivered, sent, emailed", () => {
    expect(st({ status: "delivered" })).toEqual({ tone: "good", key: "delivered", rule: null });
    expect(st({ status: "sent" }).key).toBe("sent");
    expect(st({ status: "sent", channel: "email" }).key).toBe("emailed");
  });
  it("waiting: scheduled for later, at night (law), retrying", () => {
    expect(st({ status: "queued", sendAt: "2026-11-26T18:00:00Z" })).toMatchObject({ tone: "watch", key: "scheduled" });
    expect(st({ status: "queued", sendAt: "2026-11-26T10:00:00Z" }, new Date("2026-11-26T11:00:00Z"))).toMatchObject({ tone: "watch", key: "night", rule: "law" }); // 3 AM LA
    expect(st({ status: "queued", sendAt: "2026-11-25T17:00:00Z" })).toMatchObject({ key: "sending" });
    expect(st({ status: "queued", error: "network: timeout" }).key).toBe("retrying");
  });
  it("not sent because of the law: STOP, no recorded yes", () => {
    expect(st({ status: "blocked", error: "replied STOP" })).toMatchObject({ tone: "bad", key: "stop", rule: "law" });
    expect(st({ status: "blocked", error: "no recorded yes to texts from this client" })).toMatchObject({ tone: "bad", key: "noYes", rule: "law" });
  });
  it("carriers: salon number not approved yet, not a mobile, not delivered with the reason", () => {
    expect(st({ status: "skipped", error: "salon's texting number not registered yet" })).toMatchObject({ tone: "watch", key: "waitCarriers", rule: "carriers" });
    expect(st({ status: "blocked", error: "not a mobile number" })).toMatchObject({ key: "notMobile", rule: "carriers" });
    const f = st({ status: "failed", error: "30006: landline" });
    expect(f).toMatchObject({ tone: "bad", key: "notDelivered", rule: "carriers" });
    expect(f.detail).toMatch(/landline/i);
  });
  it("ours: email/texting not switched on, booking canceled", () => {
    expect(st({ status: "skipped", channel: "email", error: "email not switched on" })).toMatchObject({ tone: "none", key: "emailOff", rule: "polishos" });
    expect(st({ status: "skipped", error: "texting not switched on (no Twilio settings)" })).toMatchObject({ key: "textOff", rule: "polishos" });
    expect(st({ status: "skipped", error: "booking canceled, moved or starting now" }).key).toBe("bookingGone");
    expect(st({ status: "skipped", error: "late: the 2-hour reminder covers it" }).key).toBe("bookingGone");
  });
  it("email that bounced", () => expect(st({ status: "failed", channel: "email", error: "resend 422" })).toMatchObject({ tone: "bad", key: "emailFailed" }));
});

describe("kindKey + salonTexting", () => {
  it("known kinds pass, others = other", () => {
    expect(kindKey("day_before")).toBe("day_before");
    expect(kindKey("weird")).toBe("other");
  });
  it("on with an active number, else waiting / not started", () => {
    expect(salonTexting({ number: "+14085550100", texting: "approved" })).toBe("on");
    expect(salonTexting({ number: null, texting: "waiting" })).toBe("waiting");
    expect(salonTexting({ number: null, texting: "not_started" })).toBe("notStarted");
  });
});
