"use client";
// Browser side of texting: send a staff invite text, and follow one text until the carrier says delivered or not.
import { api } from "@/lib/api";

export type SendReply = { id?: string; status: string; error?: string; why?: string | null; duplicate?: boolean };
export type TextState = { status: string; why?: string | null };

/** Text the invite for this code (owner/manager). Throws the route's plain-words error. */
export const textInvite = (code: string) => api<SendReply>("/api/invite/text", { code });

/** Ask every 3 s (up to ~45 s) how the text ended; calls back on each change, stops at delivered/failed. */
export function followText(id: string, onState: (s: TextState) => void): () => void {
  let stop = false, n = 0, last = "";
  const tick = async () => {
    if (stop) return;
    try {
      const r = await api<TextState>(`/api/sms/check?id=${encodeURIComponent(id)}`);
      if (r.status !== last) { last = r.status; onState(r); }
      if (r.status === "delivered" || r.status === "failed") return;
    } catch { /* keep trying */ }
    if (++n < 15) setTimeout(() => void tick(), 3000);
  };
  setTimeout(() => void tick(), 2000);
  return () => { stop = true; };
}

/** One line for a send result or a later state. */
export function textLine(s: { status: string; why?: string | null; error?: string }): string {
  switch (s.status) {
    case "delivered": return "Delivered to the phone.";
    case "sent": case "queued": return "Sent. Waiting for the carrier…";
    case "failed": return `Not delivered. ${s.why ?? s.error ?? ""}`.trim();
    case "skipped": return `Not sent: ${s.why ?? s.error ?? "texting isn't switched on yet"}.`;
    case "blocked": return `Not sent: ${s.why ?? s.error ?? "blocked"}.`;
    default: return s.status;
  }
}

/** Text a personal "make your PIN" link (code from pin_link_make) to that person (owner/manager). */
export const textPinLink = (code: string) => api<SendReply>("/api/pin/text", { code });
