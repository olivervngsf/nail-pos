// Client's digital receipt (QR on the paper receipt). No sign-in: the link is the ticket's random id.
// Shows only what's on the paper receipt: salon, ticket #, date, services + tech first name, totals, how paid.
// Never the client's phone, notes, card fee or staff pay.
import { asServer, fail } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "Receipt not found.");
  const db = asServer();
  if (!db) return fail(503, "Receipts aren't switched on yet.");
  const { data: t } = await db.from("tickets")
    .select("number,status,paid_at,created_at,subtotal_cents,discount_cents,tip_cents,total_cents,salon:salons(name,phone,address),client:clients(name),ticket_lines(kind,name,amount_cents,removed_at,sort,staff:memberships(display_name)),payments(method,amount_cents,given_cents,change_cents,card_brand,card_last4,status,at)")
    .eq("id", id).maybeSingle();
  if (!t || (t.status !== "paid" && t.status !== "refunded")) return fail(404, "Receipt not found.");
  type L = { kind: string; name: string; amount_cents: number; removed_at: string | null; sort: number; staff: { display_name: string } | null };
  const lines = ((t.ticket_lines ?? []) as unknown as L[]).filter((l) => !l.removed_at).sort((a, b) => a.sort - b.sort)
    .map((l) => ({ kind: l.kind, name: l.name, cents: Number(l.amount_cents), tech: l.staff?.display_name?.split(" ")[0] ?? null }));
  const pay = ((t.payments ?? []) as { method: string; amount_cents: number; given_cents: number | null; change_cents: number | null; card_brand: string | null; card_last4: string | null; at: string }[])
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const salon = t.salon as unknown as { name: string; phone: string | null; address: string | null } | null;
  return Response.json({
    salon: salon?.name ?? "", salonPhone: salon?.phone ?? null, salonAddress: salon?.address ?? null,
    number: t.number, status: t.status, at: t.paid_at ?? t.created_at,
    client: (t.client as unknown as { name: string } | null)?.name?.split(" ")[0] ?? null,
    lines, subtotal: Number(t.subtotal_cents), discount: Number(t.discount_cents), tip: Number(t.tip_cents), total: Number(t.total_cents),
    pay: pay ? { method: pay.method, cents: Number(pay.amount_cents), given: pay.given_cents, change: pay.change_cents, brand: pay.card_brand, last4: pay.card_last4 } : null,
  }, { headers: { "cache-control": "no-store" } });
}
