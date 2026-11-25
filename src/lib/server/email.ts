// The one way PolishOS sends an email to a salon's client (server only): Resend, from "<Salon> via PolishOS".
// Needs RESEND_API_KEY (sender BOOKING_EMAIL_FROM, default PolishOS <no-reply@mail.polishosapp.com>); without it = "off".
export type EmailOutcome = ["sent" | "off" | "failed", string?];

export async function sendEmail(to: string, m: { subject: string; text: string; html: string }, salonName: string): Promise<EmailOutcome> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return ["off", "email not switched on"];
  const from = process.env.BOOKING_EMAIL_FROM || "PolishOS <no-reply@mail.polishosapp.com>";
  const sender = from.replace(/^[^<]*</, `${salonName.replace(/[<>"]/g, "")} via PolishOS <`);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: sender, to: [to], subject: m.subject, text: m.text, html: m.html }),
  });
  return r.ok ? ["sent"] : ["failed", `resend ${r.status}: ${(await r.text()).slice(0, 200)}`];
}
