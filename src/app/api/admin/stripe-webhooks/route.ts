// Founder Admin → System: see and set up our two Stripe webhooks (payments + billing) with the app's own Stripe key.
// Platform admins only. Setup runs only on the real site address (not preview links or this computer), so Stripe
// never sends messages to a preview that goes away.
import { asServer, asUser, fail, getStripe, originOf, testMode } from "@/lib/server/pay";
import { hookStatus, setupHooks } from "@/lib/server/webhooks";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  const { data: admin } = await sb.rpc("is_platform_admin");
  if (!admin) return fail(403, "Platform admins only.");
  const st = getStripe(), db = asServer();
  if (!st || !db) return fail(503, "Stripe or the server key isn't set in Vercel.");
  const { action = "status" } = (await req.json().catch(() => ({}))) as { action?: "status" | "setup" };
  const origin = originOf(req);
  const host = new URL(origin).hostname;
  const realSite = !host.endsWith(".vercel.app") && host !== "localhost" && !host.startsWith("127.");
  try {
    if (action === "setup") {
      if (!realSite) return fail(400, `Open this on the real site (polishosapp.com), not ${host}.`);
      return Response.json({ test: testMode(), realSite, hooks: await setupHooks(st, db, origin) });
    }
    return Response.json({ test: testMode(), realSite, hooks: await hookStatus(st, db, origin) });
  } catch (e) {
    return fail(502, (e as { message?: string }).message ?? "Stripe didn't answer. Try again.");
  }
}
