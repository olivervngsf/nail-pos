// What a booking confirmation says, by email and by text. Pure text building (tested); sending lives in
// src/app/api/book/notify. Client-facing = English. Texts stay plain ASCII and short (1–2 text parts).
import { formatCents } from "@/lib/money";
import { fmtPhone } from "@/lib/onboarding/data";
import { fmtMin, fromDayKey } from "./grid";

export type NoticeGuest = { name: string; staff: string | null; minutes: number; services: { name: string; minutes: number; cents: number }[] };
export type Notice = {
  salon: { name: string; phone: string | null; address: string | null; slug: string; cancelHours: number };
  name: string; day: string; start: number; guests: NoticeGuest[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const whenOf = (n: Notice, long = true) =>
  `${fromDayKey(n.day).toLocaleDateString("en-US", long ? { weekday: "long", month: "long", day: "numeric" } : { weekday: "short", month: "short", day: "numeric" })} at ${fmtMin(n.start)}`;
const totalOf = (n: Notice) => n.guests.reduce((a, g) => a + g.services.reduce((b, s) => b + s.cents, 0), 0);
const techsOf = (n: Notice) => [...new Set(n.guests.map((g) => g.staff).filter(Boolean))] as string[];
export const manageUrl = (origin: string, token: string) => `${origin}/b/${token}`;

/** Text message: salon, when, tech, change/cancel link. Reply STOP line is required on the first text. */
export function noticeSms(n: Notice, link: string): string {
  const techs = techsOf(n);
  return `${n.salon.name}: You're booked ${whenOf(n, false)}${techs.length ? ` with ${techs.join(" & ")}` : ""}. Change or cancel: ${link} Reply STOP to opt out.`;
}

export function noticeEmail(n: Notice, link: string): { subject: string; text: string; html: string } {
  const techs = techsOf(n), total = totalOf(n), group = n.guests.length > 1;
  const longest = Math.max(0, ...n.guests.map((g) => g.minutes));
  const subject = `You're booked at ${n.salon.name}: ${whenOf(n, false)}`;
  const lines = n.guests.flatMap((g, i) => g.services.map((s) => ({ who: group ? g.name || `Guest ${i + 1}` : "", name: s.name, tech: g.staff, cents: s.cents })));
  const text = [
    `Hi ${n.name}, you're booked at ${n.salon.name}.`, "",
    `${whenOf(n)} – ${fmtMin(n.start + longest)}${techs.length ? ` with ${techs.join(" & ")}` : ""}`, "",
    ...lines.map((l) => `- ${l.who ? `${l.who}: ` : ""}${l.name}${l.tech ? ` (${l.tech})` : ""}  ${formatCents(l.cents)}`),
    ...(total ? [`Total: ${formatCents(total)} (tip and any card fee are added at the salon)`] : []), "",
    ...(n.salon.address ? [`${n.salon.name}, ${n.salon.address}`] : []),
    ...(n.salon.phone ? [`Call: ${fmtPhone(n.salon.phone)}`] : []), "",
    `Change or cancel (free up to ${n.salon.cancelHours} hours before): ${link}`,
  ].join("\n");
  const row = (a: string, b: string) => `<tr><td style="padding:6px 0;color:#16161a">${a}</td><td style="padding:6px 0;text-align:right;color:#16161a;white-space:nowrap">${b}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:#16161a">
<div style="max-width:480px;margin:0 auto;padding:28px 16px">
<p style="margin:0 0 4px;font-size:14px;color:#5c5c5e">${esc(n.salon.name)}</p>
<h1 style="margin:0 0 16px;font-size:24px;letter-spacing:-0.02em">You're booked, ${esc(n.name)}</h1>
<div style="background:#fff;border-radius:16px;padding:20px">
<p style="margin:0;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#5c5c5e">${esc(fromDayKey(n.day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</p>
<p style="margin:2px 0;font-size:24px;font-weight:700;letter-spacing:-0.02em">${fmtMin(n.start)} – ${fmtMin(n.start + longest)}</p>
${techs.length ? `<p style="margin:0 0 14px;font-size:14px;color:#5c5c5e">with ${esc(techs.join(" & "))}</p>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px dashed #e3e3e8;font-size:15px">
${lines.map((l) => row(`${l.who ? `<span style="color:#5c5c5e">${esc(l.who)}: </span>` : ""}${esc(l.name)}`, formatCents(l.cents))).join("")}
${total ? `<tr><td style="padding:10px 0 0;border-top:1px solid #e3e3e8;font-size:17px">Total</td><td style="padding:10px 0 0;border-top:1px solid #e3e3e8;text-align:right;font-size:17px;font-weight:700">${formatCents(total)}</td></tr>` : ""}
</table>
${total ? `<p style="margin:8px 0 0;font-size:13px;color:#5c5c5e">Tip and any card fee are added at the salon.</p>` : ""}
${n.salon.address ? `<p style="margin:14px 0 0;padding-top:14px;border-top:1px dashed #e3e3e8;font-size:14px"><b>${esc(n.salon.name)}</b><br><span style="color:#5c5c5e">${esc(n.salon.address)}</span></p>` : ""}
</div>
<p style="margin:16px 0 0"><a href="${esc(link)}" style="display:block;background:#16161a;color:#fff;text-decoration:none;text-align:center;font-weight:600;font-size:15px;padding:13px 16px;border-radius:12px">Change or cancel this booking</a></p>
<p style="margin:12px 0 0;font-size:13px;color:#5c5c5e;text-align:center">Free to change or cancel up to ${n.salon.cancelHours} hours before.${n.salon.phone ? ` Questions? Call ${esc(fmtPhone(n.salon.phone))}.` : ""}</p>
</div></body></html>`;
  return { subject, text, html };
}

export type ReminderKind = "day_before" | "two_hours";

/** Reminder text, 1 day or 2 hours before. Plain letters, short, salon name first, change/cancel link. */
export function reminderSms(n: Notice, link: string, kind: ReminderKind): string {
  const techs = techsOf(n), with_ = techs.length ? ` with ${techs.join(" & ")}` : "";
  return kind === "day_before"
    ? `${n.salon.name}: Reminder, see you tomorrow ${whenOf(n, false)}${with_}. Change or cancel: ${link} Reply STOP to opt out.`
    : `${n.salon.name}: See you today at ${fmtMin(n.start)}${with_}. Running late or can't come? ${link} Reply STOP to opt out.`;
}

/** Reminder email = the booking email with a reminder subject + greeting. */
export function reminderEmail(n: Notice, link: string, kind: ReminderKind): { subject: string; text: string; html: string } {
  const m = noticeEmail(n, link);
  const soon = kind === "day_before" ? "tomorrow" : "today";
  const greet = `Hi ${n.name}, see you ${soon} at ${n.salon.name}.`;
  return {
    subject: kind === "day_before" ? `Reminder: ${n.salon.name} tomorrow, ${whenOf(n, false)}` : `See you today at ${fmtMin(n.start)}: ${n.salon.name}`,
    text: m.text.replace(`Hi ${n.name}, you're booked at ${n.salon.name}.`, greet),
    html: m.html.replace(`You're booked, ${esc(n.name)}`, `See you ${soon}, ${esc(n.name)}`),
  };
}
