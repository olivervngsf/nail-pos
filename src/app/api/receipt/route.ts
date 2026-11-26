// Client's digital receipt (QR on the paper receipt). No sign-in: the link is the ticket's receipt code
// (tickets.receipt_code, one-way from the ticket id), so a receipt never reveals the ticket id the staff slip uses.
// Shows only what's on the paper receipt: salon, ticket #, date, services + tech first name, totals, how paid.
// Never the client's phone, notes, card fee or staff pay.
import { asServer, fail } from "@/lib/server/pay";
import { isReceiptCode } from "@/lib/receipt-code";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").toLowerCase();
  if (!isReceiptCode(code)) return fail(404, "Receipt not found.");
  const db = asServer();
  if (!db) return fail(503, "Receipts aren't switched on yet.");
  const { data: t } = await db.from("tickets")
    .select("id,number,status,paid_at,created_at,subtotal_cents,discount_cents,tip_cents,total_cents,salon:salons(name,phone,address,slug,booking_settings),client:clients(name),ticket_lines(kind,name,amount_cents,removed_at,sort,staff:memberships(display_name)),payments(method,amount_cents,given_cents,change_cents,card_brand,card_last4,status,at)")
    .eq("receipt_code", code).maybeSingle();
  if (!t || (t.status !== "paid" && t.status !== "refunded")) return fail(404, "Receipt not found.");
  type L = { kind: string; name: string; amount_cents: number; removed_at: string | null; sort: number; staff: { display_name: string } | null };
  const lines = ((t.ticket_lines ?? []) as unknown as L[]).filter((l) => !l.removed_at).sort((a, b) => a.sort - b.sort)
    .map((l) => ({ kind: l.kind, name: l.name, cents: Number(l.amount_cents), tech: l.staff?.display_name?.split(" ")[0] ?? null }));
  const pay = ((t.payments ?? []) as { method: string; amount_cents: number; given_cents: number | null; change_cents: number | null; card_brand: string | null; card_last4: string | null; at: string }[])
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  // Loyalty: what this visit earned / used and the balance after (same ledger the desk sees).
  const { data: pts } = await db.rpc("ticket_points", { p_ticket: t.id });
  const points = pts && (pts.earned || pts.used) ? { earned: Number(pts.earned), used: Number(pts.used), balance: Number(pts.balance), kind: pts.kind, rewardPoints: Number(pts.rewardPoints), rewardCents: Number(pts.rewardCents) } : null;
  const salon = t.salon as unknown as { name: string; phone: string | null; address: string | null; slug: string | null; booking_settings: { on?: boolean } | null } | null;
  // Booking page link (Book again / see the salon) only when the salon's booking page is on.
  const bookSlug = salon?.slug && salon.booking_settings?.on !== false ? salon.slug : null;
  return Response.json({
    salon: salon?.name ?? "", salonPhone: salon?.phone ?? null, salonAddress: salon?.address ?? null, bookSlug,
    number: t.number, status: t.status, at: t.paid_at ?? t.created_at,
    client: (t.client as unknown as { name: string } | null)?.name?.split(" ")[0] ?? null,
    lines, subtotal: Number(t.subtotal_cents), discount: Number(t.discount_cents), tip: Number(t.tip_cents), total: Number(t.total_cents),
    points,
    pay: pay ? { method: pay.method, cents: Number(pay.amount_cents), given: pay.given_cents, change: pay.change_cents, brand: pay.card_brand, last4: pay.card_last4 } : null,
  }, { headers: { "cache-control": "no-store" } });
}
