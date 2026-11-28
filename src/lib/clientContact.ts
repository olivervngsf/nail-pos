// Call / Text a client without showing the number (Oliver, Nov 26). Only the owner sees a client's full phone;
// the owner picks per salon which other roles get a Call and a Text button (Settings → Call + text clients,
// contact_settings_get / contact_settings_save). Each tap is logged by client_contact_log. Pure parts tested.
import { useEffect, useState } from "react";
import { rpc, type Role } from "@/lib/auth";

export type Way = "call" | "text";
export type ContactSettings = { call: Role[]; text: Role[] };
export const OTHER_ROLES: Role[] = ["manager", "front_desk", "tech"];
export const DEFAULT_CONTACT: ContactSettings = { call: ["manager", "front_desk"], text: ["manager", "front_desk"] };

/** May this role use the Call / Text button? The owner always may. */
export const canContact = (s: ContactSettings, role: Role, way: Way) => role === "owner" || s[way].includes(role);

/** Only the owner sees a client's full phone number; everyone else the last 4. */
export const seesFullPhone = (role: Role) => role === "owner";

/** The server hides a client's phone/email from everyone but the owner ("••7011", "l•••@gmail.com"). */
export const isMasked = (v?: string | null) => !!v && v.includes("•");

/** "+16125457011" from any US phone the client gave. */
export const dialNumber = (phone: string) => "+1" + phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/** Link that opens the phone app / messages app. `?&body=` works on both iPhone and Android. */
export const telHref = (phone: string) => `tel:${dialNumber(phone)}`;
export const smsHref = (phone: string, body: string) => `sms:${dialNumber(phone)}?&body=${encodeURIComponent(body)}`;

/** Prefilled reminder text (staff can change it in their messages app before sending). */
export function reminderBody(o: { first: string; salon: string; when: string }, lang: "en" | "vi" = "en"): string {
  const name = o.first.trim() || (lang === "vi" ? "bạn" : "there");
  return lang === "vi"
    ? `Chào ${name}, ${o.salon} nhắc lịch hẹn của bạn: ${o.when}. Muốn đổi giờ, cứ nhắn lại hoặc gọi tiệm nhé.`
    : `Hi ${name}, a reminder from ${o.salon}: your appointment is ${o.when}. Reply or call us to change it.`;
}

const KEY = (salon: string) => `nailpos.contact.${salon}`;
function cached(salon: string): ContactSettings | null {
  try { const v = localStorage.getItem(KEY(salon)); return v ? (JSON.parse(v) as ContactSettings) : null; } catch { return null; }
}
/** Keep the salon's pick on this device too, so the buttons work offline. */
export function rememberContact(salon: string, s: ContactSettings) {
  try { localStorage.setItem(KEY(salon), JSON.stringify(s)); } catch { /* storage blocked */ }
}

/** The salon's Call / Text setting (device copy first, then the server). Test copy = the default. */
export function useContactSettings(salonId: string, demo: boolean): ContactSettings {
  const [s, setS] = useState<ContactSettings>(DEFAULT_CONTACT);
  useEffect(() => {
    if (demo || !salonId) return;
    const c = cached(salonId);
    if (c) setS(c);
    void rpc<ContactSettings>("contact_settings_get", { p_salon: salonId })
      .then((x) => { setS(x); rememberContact(salonId, x); }).catch(() => null);
  }, [salonId, demo]);
  return s;
}

/** Log one tap (who, which client, which booking). Never blocks the call/text: offline it just isn't logged. */
export function logContact(o: { salonId: string; clientId?: string; apptId?: string; way: Way; by?: string; demo: boolean }) {
  if (o.demo) return;
  void dialFor(o).catch(() => null);
}

/** The number to call / text when this device only has ••7011: the server hands it out only to a role the owner
 *  switched on, and logs the tap. Needs internet. */
export async function dialFor(o: { salonId: string; clientId?: string; apptId?: string; way: Way; by?: string }): Promise<string> {
  const r = await rpc<{ phone?: string }>("client_contact_log", { p_salon: o.salonId, p_client: o.clientId ?? null, p_appt: o.apptId ?? null, p_way: o.way, p_by: o.by ?? null });
  return r?.phone ?? "";
}
