// Every minute (the database's own job, see src/lib/server/cron.ts) + the half-hourly GitHub "Scheduled texts" job: booking reminders 1 day and 2 hours before, by email and/or text,
// to the contact typed for that booking. The database hands out only what is due, once, never at night, never for a
// canceled booking (booking_reminders_claim). Email: Resend. Text: sendText (salon's own number + recorded yes only;
// until the salon has a number it is logged as skipped). Needs CRON_SECRET like /api/cron/invite-reminders.
import { asServer, fail, originOf } from "@/lib/server/pay";
import { sendEmail } from "@/lib/server/email";
import { sendText } from "@/lib/server/sms";
import { cronAuth } from "@/lib/server/cron";
import { manageUrl, reminderEmail, reminderSms, type Notice, type ReminderKind } from "@/lib/booking/notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Due = { id: number; channel: "email" | "sms"; to: string | null; kind: ReminderKind; token: string; notice: (Notice & { salon: Notice["salon"] & { id: string } }) | null };

async function run(req: Request) {
  const db = asServer();
  if (!db) return fail(503, "Server key missing.");
  if (!(await cronAuth(req, db, originOf(req)))) return fail(401, "Not allowed.");

  const { data, error } = await db.rpc("booking_reminders_claim", { p_limit: 100 });
  if (error) return fail(500, error.message);
  const origin = originOf(req);
  const out = { due: 0, sent: 0, off: 0, failed: 0 };
  for (const d of (data ?? []) as Due[]) {
    out.due++;
    let status: "sent" | "skipped" | "failed" = "failed", why: string | undefined;
    try {
      const n = d.notice;
      if (!n || !d.to) { status = "skipped"; why = !n ? "booking gone" : "no address"; }
      else if (d.channel === "email") {
        const [o, e] = await sendEmail(d.to, reminderEmail(n, manageUrl(origin, d.token), d.kind), n.salon.name);
        status = o === "off" ? "skipped" : o; why = e;
      } else {
        const r = await sendText(db, { clientKey: `booking-reminder:${d.id}`, kind: "reminder", to: d.to, salonId: n.salon.id, body: reminderSms(n, manageUrl(origin, d.token), d.kind) }, origin);
        status = r.status === "sent" || (r.status === "queued" && !r.error) ? "sent" : r.status === "failed" ? "failed" : "skipped"; why = r.error;
      }
    } catch (e) { why = (e as Error).message; }
    if (status === "sent") out.sent++; else if (status === "skipped") out.off++; else out.failed++;
    await db.rpc("booking_notice_done", { p_id: d.id, p_status: status, p_error: why ?? null });
  }
  return Response.json(out);
}

export const GET = run;
export const POST = run;
