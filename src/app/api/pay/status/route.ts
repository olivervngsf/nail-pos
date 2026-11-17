// Desk asks "is it paid yet?" every few seconds. Checks Stripe and records the payment once it's through.
import { asUser, fail, settle } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const id = new URL(req.url).searchParams.get("id");
  // RLS: only members of the salon can see the pay request.
  const { data: pr } = await sb.from("pay_requests").select("id,status,error").eq("id", id).maybeSingle();
  if (!pr) return fail(404, "No such payment.");
  try {
    return Response.json(await settle(pr.id));
  } catch (e) {
    return Response.json({ status: pr.status, error: (e as Error).message });
  }
}
