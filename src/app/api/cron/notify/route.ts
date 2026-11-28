// Every minute (the database's own job, _cron_ping): send owner/manager alerts queued by the database (notify_queue,
// migration 20270202000001). Email by Resend to each recipient with an email; text on the salon's own number
// (sendText kind "other"; skipped until the salon has a number). Each alert is handed out once (notify_claim).
import { asServer, fail, originOf } from "@/lib/server/pay";
import { sendEmail } from "@/lib/server/email";
import { sendText } from "@/lib/server/sms";
import { cronAuth } from "@/lib/server/cron";
import { alertEmail, alertText } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Due = { id: number; salon_id: string; salon_name: string; kind: string; title: string; body: string; email: boolean; text: boolean;
  recipients: { name: string; email: string | null; phone: string | null }[] };

async function run(req: Request) {
  const db = asServer();
  if (!db) return fail(503, "Server key missing.");
  const origin = originOf(req);
  if (!(await cronAuth(req, db, origin))) return fail(401, "Not allowed.");
  const { data, error } = await db.rpc("notify_claim", { p_limit: 50 });
  if (error) return fail(500, error.message);
  const out = { due: 0, sent: 0, skipped: 0, failed: 0 };
  for (const d of (data ?? []) as Due[]) {
    out.due++;
    const results: { to: string; via: "email" | "text"; status: string; why?: string }[] = [];
    for (const r of d.recipients ?? []) {
      if (d.email && r.email) {
        try {
          const [o, why] = await sendEmail(r.email, alertEmail(d.salon_name, d.title, d.body, origin), d.salon_name);
          results.push({ to: r.name, via: "email", status: o, why });
        } catch (e) { results.push({ to: r.name, via: "email", status: "failed", why: (e as Error).message }); }
      }
      if (d.text && r.phone) {
        try {
          const t = await sendText(db, { clientKey: `alert:${d.id}:${r.phone}`, kind: "other", to: r.phone, salonId: d.salon_id, body: alertText(d.salon_name, d.title) }, origin);
          results.push({ to: r.name, via: "text", status: t.status, why: t.error });
        } catch (e) { results.push({ to: r.name, via: "text", status: "failed", why: (e as Error).message }); }
      }
    }
    const status = results.some((x) => x.status === "sent" || x.status === "queued") ? "sent"
      : results.some((x) => x.status === "failed") ? "failed" : "skipped";
    out[status === "sent" ? "sent" : status === "failed" ? "failed" : "skipped"]++;
    await db.rpc("notify_done", { p_id: d.id, p_status: status, p_result: { results } });
  }
  return Response.json(out);
}

export const GET = run;
export const POST = run;
