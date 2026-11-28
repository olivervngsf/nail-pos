// Notifications (Settings → Safety + records → Notifications; board Notifications.dc.html): what can alert the owner
// + managers, grouped like the board, which are live, the defaults, and the alert email. The database queues alerts
// (salons.notify_settings, notify_queue, migration 20270202000001); /api/cron/notify sends them every minute.
export type Channel = { email: boolean; text: boolean };
export type NotifySettings = { to: string[]; summary: boolean; on: Record<string, Partial<Channel>> };
export type NotifyPerson = { id: string; name: string; role: "owner" | "manager"; email: boolean; phone: boolean };

export const GROUPS = ["money", "safety", "team", "devices"] as const;
export type Group = (typeof GROUPS)[number];
/** Every alert on the board. `live` = sent now; the rest keep their switch and start in a later build. */
export const KINDS: { key: string; group: Group; live: boolean }[] = [
  { key: "refund_big", group: "money", live: true },
  { key: "discount_big", group: "money", live: true },
  { key: "drawer_off", group: "money", live: true },
  { key: "pin_locked", group: "safety", live: true },
  { key: "new_signin", group: "safety", live: false },
  { key: "clock_refused", group: "safety", live: true },
  { key: "meal_missed", group: "team", live: false },
  { key: "overtime", group: "team", live: false },
  { key: "forgot_clockout", group: "team", live: false },
  { key: "license", group: "team", live: false },
  { key: "device_off", group: "devices", live: false },
  { key: "plan_failed", group: "devices", live: true },
  { key: "credit_low", group: "devices", live: true },
];
const TEXT_BY_DEFAULT = new Set(["refund_big", "pin_locked", "new_signin", "plan_failed"]);

/** Same rule as the database (_notify_default + saved choice). */
export function channelOf(s: NotifySettings | null | undefined, key: string): Channel {
  const d = { email: true, text: TEXT_BY_DEFAULT.has(key) };
  return { ...d, ...(s?.on?.[key] ?? {}) };
}
export const emptySettings = (): NotifySettings => ({ to: [], summary: true, on: {} });

/** Who gets alerts: picked people, or (nobody picked) the owner + every manager. */
export const recipientsOf = (s: NotifySettings, people: NotifyPerson[]) =>
  s.to.length ? people.filter((p) => s.to.includes(p.id)) : people;

const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
/** The alert email: one line on top, a short note, a link to the Activity log. */
export function alertEmail(salon: string, title: string, body: string, origin: string) {
  const link = `${origin}/settings/activity`;
  return {
    subject: `${salon}: ${title}`,
    text: `${title}\n\n${body}\n\nActivity log: ${link}\n\nYou get this because you're the owner or a manager at ${salon}. Change alerts in Settings → Notifications.`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1c1c1e;max-width:520px">
<p style="font-size:17px;font-weight:600;margin:0 0 8px">${esc(title)}</p><p style="margin:0 0 16px;color:#3a3a3c">${esc(body)}</p>
<p style="margin:0 0 24px"><a href="${esc(link)}" style="color:#1c1c1e;font-weight:600">Open the Activity log</a></p>
<p style="margin:0;font-size:12px;color:#8e8e93">You get this because you're the owner or a manager at ${esc(salon)}. Change alerts in Settings → Notifications.</p></div>`,
  };
}
/** The alert text (short: one part when possible). */
export const alertText = (salon: string, title: string) => `${salon}: ${title}. Details in PolishOS → Activity log.`;

export function demoNotify(): { settings: NotifySettings; people: NotifyPerson[] } {
  return {
    settings: emptySettings(),
    people: [
      { id: "m-owner", name: "Mai Nguyen", role: "owner", email: true, phone: true },
      { id: "m-bao", name: "Bao Tran", role: "manager", email: false, phone: true },
    ],
  };
}
