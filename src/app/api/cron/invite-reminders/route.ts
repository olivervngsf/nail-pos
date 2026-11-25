// Hourly job (GitHub Actions "Scheduled texts" calls it): text "your invite ends tomorrow" ONCE to staff who got an
// invite text but haven't joined, about a day before the invite ends. Only 9 AM–8 PM salon time (inviteEndsDue).
// Goes through the one sender (sendText): PolishOS number, STOP list, never twice (clientKey invite-end:<code>).
// Needs CRON_SECRET (Vercel + GitHub repo secret): the caller sends "Authorization: Bearer <CRON_SECRET>".
import { asServer, fail, originOf } from "@/lib/server/pay";
import { sendText } from "@/lib/server/sms";
import { inviteEndsBody, inviteEndsDue } from "@/lib/texting/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  code: string; salon_id: string; expires_at: string; used_at: string | null;
  memberships: { phone: string | null; language: string | null; person_id: string | null; archived_at: string | null } | null;
  salons: { name: string; time_zone: string | null } | null;
};

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(503, "CRON_SECRET not set.");
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "Not allowed.");
  const db = asServer();
  if (!db) return fail(503, "Server key missing.");

  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const { data, error } = await db.from("invites")
    .select("code,salon_id,expires_at,used_at,memberships(phone,language,person_id,archived_at),salons(name,time_zone)")
    .is("used_at", null).gt("expires_at", now.toISOString()).lte("expires_at", soon)
    .returns<Row[]>();
  if (error) return fail(500, error.message);

  // Only people who already got the first invite text (we never start a conversation with this reminder).
  const codes = (data ?? []).map((r) => r.code);
  const { data: firsts } = codes.length
    ? await db.from("text_messages").select("client_key").in("client_key", codes.map((c) => `invite:${c}`)).in("status", ["sent", "delivered"])
    : { data: [] as { client_key: string }[] };
  const texted = new Set((firsts ?? []).map((t) => t.client_key.slice("invite:".length)));

  const origin = originOf(req);
  const out = { checked: codes.length, sent: 0, later: 0, skipped: 0, failed: 0 };
  for (const r of data ?? []) {
    const m = r.memberships;
    if (!m || m.archived_at || m.person_id || !m.phone || !texted.has(r.code)) { out.skipped++; continue; }
    if (!inviteEndsDue({ expiresAt: r.expires_at, now, timeZone: r.salons?.time_zone })) { out.later++; continue; }
    const res = await sendText(db, {
      clientKey: `invite-end:${r.code}`, kind: "invite", to: m.phone, salonId: r.salon_id,
      body: inviteEndsBody({ salon: r.salons?.name ?? "", link: `${origin}/join/${r.code}`, lang: m.language }),
    }, origin);
    if (res.duplicate) out.skipped++;
    else if (res.status === "sent" || res.status === "queued") out.sent++;
    else if (res.status === "failed") out.failed++;
    else out.skipped++;
  }
  return Response.json(out);
}

export const GET = run;
export const POST = run;
