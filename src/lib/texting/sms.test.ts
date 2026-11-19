import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { e164, helpReply, keyword, twilioSignature, twiml, validTwilio } from "./sms";

describe("keyword", () => {
  it("knows STOP / START / HELP, any case, trailing dot", () => {
    expect(keyword("stop")).toBe("stop");
    expect(keyword(" STOP. ")).toBe("stop");
    expect(keyword("Unsubscribe")).toBe("stop");
    expect(keyword("start")).toBe("start");
    expect(keyword("help?")).toBe("help");
  });
  it("Vietnamese without or with accents", () => {
    expect(keyword("dừng")).toBe("stop");
    expect(keyword("DUNG")).toBe("stop");
    expect(keyword("hủy")).toBe("stop");
    expect(keyword("giúp")).toBe("help");
  });
  it("only the whole reply counts", () => {
    expect(keyword("don't stop")).toBeNull();
    expect(keyword("see you at 3")).toBeNull();
    expect(keyword("")).toBeNull();
  });
});

describe("e164", () => {
  it("US formats", () => {
    expect(e164("(408) 555-0100")).toBe("+14085550100");
    expect(e164("14085550100")).toBe("+14085550100");
    expect(e164("+1 408 555 0100")).toBe("+14085550100");
  });
  it("rejects junk", () => {
    expect(e164("555-0100")).toBeNull();
    expect(e164("")).toBeNull();
  });
});

describe("Twilio signature", () => {
  const url = "https://polishosapp.com/api/sms/inbound";
  const params = { From: "+14085550100", To: "+14085550199", Body: "STOP", MessageSid: "SM123" };
  it("matches HMAC-SHA1 of url + sorted name/value pairs", () => {
    const want = createHmac("sha1", "tok").update(url + "BodySTOPFrom+14085550100MessageSidSM123To+14085550199").digest("base64");
    expect(twilioSignature(url, params, "tok")).toBe(want);
  });
  it("accepts the right one, refuses changed body, wrong token, missing header", () => {
    const sig = twilioSignature(url, params, "tok");
    expect(validTwilio(url, params, "tok", sig)).toBe(true);
    expect(validTwilio(url, { ...params, Body: "START" }, "tok", sig)).toBe(false);
    expect(validTwilio(url, params, "other", sig)).toBe(false);
    expect(validTwilio(url, params, "tok", null)).toBe(false);
  });
});

describe("replies", () => {
  it("HELP names the sender and how to stop", () => {
    expect(helpReply("Lotus Nails")).toMatch(/^Lotus Nails: .*Reply STOP to stop\.$/);
  });
  it("TwiML escapes text, empty when no reply", () => {
    expect(twiml()).toContain("<Response></Response>");
    expect(twiml("A & B <x>")).toContain("<Message>A &amp; B &lt;x&gt;</Message>");
  });
});
