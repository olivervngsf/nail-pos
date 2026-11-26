// Send a receipt the desk asked for on the paid screen (Text / Email). The desk logs it first (log_receipt, through the
// outbox); this sends it once and records what happened on the receipts row (sent / skipped / failed).
//   Text: the one shared sender (sendText, kind receipt, clientKey receipt:<id>): the salon's own number, or a TEST
//   phone while the salon has none (TEXT_TEST_PHONES); STOP list respected. Email: Resend (sendEmail).
// Who: anyone signed in who can see that salon's receipts (members; RLS on receipts decides).
import { asServer, asUser, fail, originOf } from "@/lib/server/pay";
import { sendText } from "@/lib/server/sms";
import { sendEmail } from "@/lib/server/email";
import { receiptEmail, receiptSms, receiptUrl } from "@/lib/checkout/receiptSend";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Receipt not found.");
  const me = await asUser(req);
  if (!me) return fail(401, "Sign in first.");
  const { data: rec } = await me.from("receipts").select("id,salon_id,ticket_id,channel,sent_to,status").eq("id", id).maybeSingle();
  if (!rec) return fail(404, "Receipt not found.");
  if (rec.channel !== "text" && rec.channel !== "email") return Response.json({ status: "skipped" });
  if (rec.status === "sent") return Response.json({ status: "sent", duplicate: true });
  const db = asServer();
  if (!db) return Response.json({ status: "skipped", error: "texting not switched on" });
  const { data: t } = await db.from("tickets").select("number,status,total_cents,paid_at,created_at,receipt_code,salon:salons(name)")
    .eq("id", rec.ticket_id).eq("salon_id", rec.salon_id).maybeSingle();
  if (!t || (t.status !== "paid" && t.status !== "refunded")) return fail(409, "Only a paid ticket has a receipt.");
  const info = { salon: (t.salon as unknown as { name: string } | null)?.name ?? "", number: t.number, totalCents: Number(t.total_cents),
    at: t.paid_at ?? t.created_at, code: t.receipt_code as string };
  const origin = originOf(req), link = receiptUrl(origin, info.code);

  let status: "sent" | "skipped" | "failed" = "failed", error: string | undefined;
  try {
    if (!rec.sent_to) error = "no phone or email";
    else if (rec.channel === "text") {
      const r = await sendText(db, { clientKey: `receipt:${rec.id}`, kind: "receipt", to: rec.sent_to, body: receiptSms(info, link), salonId: rec.salon_id }, origin);
      status = r.status === "sent" || (r.status === "queued" && !r.error) ? "sent" : r.status === "skipped" || r.status === "blocked" ? "skipped" : "failed";
      error = r.error;
    } else {
      const [o, why] = await sendEmail(rec.sent_to, receiptEmail(info, link), info.salon);
      status = o === "sent" ? "sent" : o === "off" ? "skipped" : "failed";
      error = why;
    }
  } catch (e) { error = (e as Error).message; }
  await db.from("receipts").update({ status }).eq("id", rec.id);
  return Response.json({ status, error: error ?? null });
}
