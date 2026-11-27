// Staff invite text + plain-words reasons for Twilio delivery errors. Pure (no "use client"): used by server routes,
// the admin test card and Settings → Team. Tested in invite.test.ts.

/** The invite text. Vietnamese is sent WITHOUT accents (1 text part instead of 2-3; carriers often garble accents). */
export function inviteBody(p: { salon: string; owner?: string | null; link: string; lang?: string | null }): string {
  const salon = p.salon.trim() || "your salon";
  const who = (p.owner ?? "").trim().split(/\s+/)[0];
  if (p.lang === "vi") {
    const by = who ? `${noAccents(who)} o ` : "";
    return `PolishOS: ${by}tiem ${noAccents(salon)} da them ban vao nhom. Bam link de tham gia va tao ma PIN: ${p.link} Tra loi STOP de ngung.`;
  }
  const by = who ? `${who} at ` : "";
  return `PolishOS: ${by}${salon} added you to the team. Join and set your PIN: ${p.link} Reply STOP to stop.`;
}

/** The "make your PIN" text for someone who joined but has no PIN (cleared or never made). Same rules as inviteBody. */
export function pinLinkBody(p: { salon: string; link: string; lang?: string | null }): string {
  const salon = p.salon.trim() || "your salon";
  if (p.lang === "vi") return `PolishOS: tiem ${noAccents(salon)} nho ban tao ma PIN moi. Bam link (dung 1 lan, 7 ngay): ${p.link} Tra loi STOP de ngung.`;
  return `PolishOS: ${salon} asks you to make your PIN. Tap your link (works once, 7 days): ${p.link} Reply STOP to stop.`;
}

/** "Your invite ends tomorrow" (sent once, about a day before an unused staff invite ends; campaign sample #3 style).
 *  Same rules as inviteBody: starts "PolishOS:", Vietnamese without accents, ends with STOP. */
export function inviteEndsBody(p: { salon: string; link: string; lang?: string | null }): string {
  const salon = p.salon.trim() || "your salon";
  if (p.lang === "vi") return `PolishOS: loi moi vao nhom tiem ${noAccents(salon)} het han ngay mai. Bam link de tham gia va tao ma PIN: ${p.link} Tra loi STOP de ngung.`;
  return `PolishOS: your invite to join ${salon} ends tomorrow. Join and set your PIN: ${p.link} Reply STOP to stop.`;
}

/** Is it time to send the "ends tomorrow" text? The invite ends in more than 1h and at most 24h, and it is
 *  9 AM–8 PM where the salon is (no texts at night; the hourly job tries again in the morning). */
export function inviteEndsDue(p: { expiresAt: string | Date; now: Date; timeZone?: string | null }): boolean {
  const left = new Date(p.expiresAt).getTime() - p.now.getTime();
  if (!(left > 60 * 60 * 1000 && left <= 24 * 60 * 60 * 1000)) return false;
  const hour = localHour(p.now, p.timeZone || "America/Los_Angeles");
  return hour >= 9 && hour < 20;
}

export function localHour(at: Date, timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(at);
    return Number(h) % 24;
  } catch {
    return at.getUTCHours();
  }
}

export function noAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Twilio error code (from "twilio 30034", "30034: ...", or a number) → why the text didn't arrive, in plain words. */
export function explainTextError(err: string | number | null | undefined): string | null {
  if (err == null || err === "") return null;
  const code = String(err).match(/\b(\d{5})\b/)?.[1];
  const why: Record<string, string> = {
    "30034": "The sending number isn't registered with the carriers yet (A2P 10DLC). Texts start once the campaign is approved.",
    "30032": "The toll-free number isn't verified yet.",
    "30007": "The carrier filtered it as spam.",
    "30003": "The phone is off or out of service.",
    "30005": "That number doesn't exist or is no longer in service.",
    "30006": "That's a landline or can't get texts.",
    "30008": "The carrier didn't say why. Try again later.",
    "21610": "This person replied STOP. They have to reply START first.",
    "21608": "Trial account: Twilio only texts numbers verified in the console.",
    "21211": "That isn't a valid phone number.",
  };
  if (code && why[code]) return `${why[code]} (code ${code})`;
  return code ? `Twilio code ${code}` : String(err);
}
