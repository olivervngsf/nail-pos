import { describe, expect, it } from "vitest";
import { maskTo, receiptEmail, receiptLine, receiptSms, receiptUrl } from "./receiptSend";
import { onTestList, testPhones } from "@/lib/texting/sms";

const r = { salon: "Lotus Demo Nails", number: 1284, totalCents: 11520, at: "2026-11-26T20:00:00Z", code: "0123456789abcdef" };

describe("receipt by text / email", () => {
  it("text = salon, total, receipt link (never the ticket id), STOP line, plain ASCII", () => {
    const s = receiptSms(r, receiptUrl("https://polishosapp.com", r.code));
    expect(s).toBe("Lotus Demo Nails: Thank you! Your receipt #1284 ($115.20): https://polishosapp.com/r/0123456789abcdef Reply STOP to opt out.");
    expect(/^[\x20-\x7e]*$/.test(s)).toBe(true);
  });
  it("email has the total and the link, escapes the salon name", () => {
    const e = receiptEmail({ ...r, salon: "Mai & <Co>" }, "https://x/r/abc");
    expect(e.subject).toBe("Your receipt from Mai & <Co> (#1284)");
    expect(e.html).toContain("Mai &amp; &lt;Co&gt;");
    expect(e.text).toContain("$115.20");
    expect(e.html).toContain('href="https://x/r/abc"');
  });
});

describe("test phones (before go-live)", () => {
  it("reads a comma list into E.164", () => {
    expect(testPhones("(408) 555-0100, +18777804236 ;bad")).toEqual(["+14085550100", "+18777804236"]);
    expect(testPhones(undefined)).toEqual([]);
  });
  it("only confirm / reminder / receipt, only to a listed phone, never promos", () => {
    const list = "+14085550100";
    expect(onTestList("confirm", "+14085550100", list)).toBe(true);
    expect(onTestList("receipt", "+14085550100", list)).toBe(true);
    expect(onTestList("promo", "+14085550100", list)).toBe(false);
    expect(onTestList("reminder", "+14085550199", list)).toBe(false);
    expect(onTestList("reminder", "+14085550100", "")).toBe(false);
  });
});

describe("what the paid screen says after Text / Email", () => {
  it("masks the contact", () => {
    expect(maskTo("text", "+16125457011")).toBe("••7011");
    expect(maskTo("email", "oliver@gmail.com")).toBe("o•••@gmail.com");
  });
  it("one plain line per outcome", () => {
    expect(receiptLine("text", { status: "sent" })).toEqual({ key: "texted", tone: "good" });
    expect(receiptLine("email", { status: "sent" })).toEqual({ key: "emailed", tone: "good" });
    expect(receiptLine("text", { status: "skipped", error: "salon's texting number not registered yet" }).key).toBe("textOff");
    expect(receiptLine("text", { status: "skipped", error: "replied STOP" }).key).toBe("stop");
    expect(receiptLine("text", { status: "queued" }).key).toBe("queued");
    expect(receiptLine("text", { status: "failed", error: "x" }).tone).toBe("bad");
  });
});
