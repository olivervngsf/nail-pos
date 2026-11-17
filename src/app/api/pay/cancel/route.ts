// Desk cancels a card payment that's waiting (wrong amount, client changed mind): clears the reader, expires the pay page.
// If the client already paid, that payment is recorded and the answer is "paid".
import { asUser, fail, stopTry } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  // RLS: only desk staff of the salon see the pay request.
  const { data: pr } = await sb.from("pay_requests").select("id,status").eq("id", id).maybeSingle();
  if (!pr) return fail(404, "No such payment.");
  if (pr.status !== "pending") return Response.json({ status: pr.status });
  try {
    return Response.json({ status: await stopTry(pr.id) });
  } catch (e) {
    return fail(503, (e as Error).message);
  }
}
