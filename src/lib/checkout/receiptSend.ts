// What a receipt says by text and by email (the desk taps Text / Email on the paid screen). Pure (tested).
// The link is the client's digital receipt /r/<receipt code>: never the ticket id. Client-facing = English, plain ASCII.
import { formatCents } from "@/lib/money";

export type ReceiptInfo = { salon: string; number: number | null; totalCents: number; at: string; code: string };

export const receiptUrl = (origin: string, code: string) => `${origin}/r/${code}`;

export function receiptSms(r: ReceiptInfo, link: string): string {
  return `${r.salon}: Thank you! Your receipt${r.number ? ` #${r.number}` : ""} (${formatCents(r.totalCents)}): ${link} Reply STOP to opt out.`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function receiptEmail(r: ReceiptInfo, link: string): { subject: string; text: string; html: string } {
  const day = new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const subject = `Your receipt from ${r.salon}${r.number ? ` (#${r.number})` : ""}`;
  const text = `Thank you for visiting ${r.salon}.\n\nTotal: ${formatCents(r.totalCents)} on ${day}\nSee your receipt: ${link}\n`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">`
    + `<p>Thank you for visiting <b>${esc(r.salon)}</b>.</p>`
    + `<p style="font-size:22px;font-weight:700;margin:12px 0">${formatCents(r.totalCents)}</p>`
    + `<p style="color:#666">${esc(day)}${r.number ? ` &middot; Receipt #${r.number}` : ""}</p>`
    + `<p><a href="${esc(link)}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">See your receipt</a></p></div>`;
  return { subject, text, html };
}

export type ReceiptOutcome = { status: "sent" | "skipped" | "failed" | "queued" | "demo"; error?: string | null };

/** Phone as ••7011, email as o•••@gmail.com: enough for staff to recognise it, never the whole thing. */
export function maskTo(channel: "text" | "email", to: string): string {
  if (channel === "text") return `••${to.replace(/\D/g, "").slice(-4)}`;
  const [u, d] = to.split("@");
  return `${(u ?? "").slice(0, 1)}•••@${d ?? ""}`;
}

/** Which plain-words line the paid screen shows after a text/email receipt (i18n key under checkout.rcpt). */
export function receiptLine(channel: "text" | "email", r: ReceiptOutcome): { key: string; tone: "good" | "watch" | "bad" | "none" } {
  const e = (r.error ?? "").toLowerCase();
  switch (r.status) {
    case "sent": return { key: channel === "text" ? "texted" : "emailed", tone: "good" };
    case "queued": return { key: "queued", tone: "watch" };
    case "demo": return { key: "demo", tone: "none" };
    case "skipped":
      if (e.includes("stop")) return { key: "stop", tone: "bad" };
      if (e.includes("mobile")) return { key: "notMobile", tone: "bad" };
      return { key: channel === "text" ? "textOff" : "emailOff", tone: "none" };
    default: return { key: "failed", tone: "bad" };
  }
}
