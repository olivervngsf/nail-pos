// What happened to one text or email, in plain words + who made the rule behind it (Settings → Texting → Messages).
// One rule for every screen that shows a message status. Pure (tested in status.test.ts).
import type { Tone } from "@/lib/admin/signals";
import { explainTextError, localHour } from "./invite";

/** Who made the rule: government (FCC/TCPA + state laws), the phone carriers + Twilio, Stripe, or PolishOS. */
export type RuleOwner = "law" | "carriers" | "stripe" | "polishos";

export type MessageRow = {
  id: string; channel: "sms" | "email"; kind: string;
  status: "queued" | "sending" | "sent" | "delivered" | "failed" | "skipped" | "blocked";
  error: string | null; to: string; at: string; sendAt?: string | null;
};

/** key = i18n key under textlog.why; rule = who made it (null = nothing went wrong); detail = carrier's reason. */
export type MessageStatus = { tone: Tone; key: string; rule: RuleOwner | null; detail?: string | null };

export function messageStatus(r: MessageRow, now: Date, timeZone?: string | null): MessageStatus {
  const e = (r.error ?? "").toLowerCase();
  switch (r.status) {
    case "delivered": return { tone: "good", key: "delivered", rule: null };
    case "sent": return { tone: "good", key: r.channel === "email" ? "emailed" : "sent", rule: null };
    case "queued":
    case "sending": {
      if (e.startsWith("network")) return { tone: "watch", key: "retrying", rule: null };
      const due = r.sendAt ? new Date(r.sendAt) : null;
      if (due && due.getTime() > now.getTime()) return { tone: "watch", key: "scheduled", rule: null };
      const h = localHour(now, timeZone || "America/Los_Angeles");
      if (h < 8 || h >= 21) return { tone: "watch", key: "night", rule: "law" };
      return { tone: "watch", key: "sending", rule: null };
    }
    case "blocked":
      if (e.includes("stop")) return { tone: "bad", key: "stop", rule: "law" };
      if (e.includes("yes")) return { tone: "bad", key: "noYes", rule: "law" };
      if (e.includes("mobile")) return { tone: "bad", key: "notMobile", rule: "carriers" };
      return { tone: "bad", key: "other", rule: null, detail: r.error };
    case "skipped":
      if (e.includes("number not registered") || e.includes("texting number")) return { tone: "watch", key: "waitCarriers", rule: "carriers" };
      if (e.includes("email not switched on")) return { tone: "none", key: "emailOff", rule: "polishos" };
      if (e.includes("twilio") || e.includes("polishos number")) return { tone: "none", key: "textOff", rule: "polishos" };
      if (e.startsWith("booking") || e.startsWith("late")) return { tone: "none", key: "bookingGone", rule: "polishos" };
      if (e.includes("credit")) return { tone: "bad", key: "noCredit", rule: "polishos" };
      return { tone: "none", key: "skipped", rule: null, detail: r.error };
    case "failed":
      if (r.channel === "email") return { tone: "bad", key: "emailFailed", rule: null, detail: r.error };
      return { tone: "bad", key: "notDelivered", rule: "carriers", detail: explainTextError(r.error) ?? r.error };
    default: return { tone: "none", key: "skipped", rule: null };
  }
}

/** Which kinds of message there are (i18n key under textlog.kind). */
export function kindKey(kind: string): string {
  return ["invite", "salon_ready", "confirm", "reminder", "day_before", "two_hours", "receipt", "promo"].includes(kind) ? kind : "other";
}

/** Client texts on for this salon? Its own number is active; else the carriers are still checking (or not started). */
export function salonTexting(a: { number: string | null; texting: string }): "on" | "waiting" | "notStarted" {
  if (a.number) return "on";
  return a.texting === "waiting" || a.texting === "approved" ? "waiting" : "notStarted";
}
