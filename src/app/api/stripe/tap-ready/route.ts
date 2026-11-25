// Tap to Pay warm-up (iPhone app): before any ticket is charged, the app gets Tap to Pay ready so the first tap is
// fast (Apple's rule: prepare when the app opens and comes back to the screen). POST {salonId} → the salon's Stripe
// Terminal location + test mode. Desk roles only (owner, manager, front desk), same as charging a ticket.
import { asServer, asUser, ensureLocation, fail, getStripe, isDeskOf, testMode } from "@/lib/server/pay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await asUser(req);
  if (!sb) return fail(401, "Sign in first.");
  if (!getStripe() || !asServer()) return fail(503, "Card payments aren't switched on yet.");
  const { salonId } = (await req.json().catch(() => ({}))) as { salonId?: string };
  if (!salonId || !(await isDeskOf(sb, salonId))) return fail(403, "Only the front desk, a manager or the owner can take cards.");
  try {
    const { locationId } = await ensureLocation(salonId);
    return Response.json({ locationId, test: testMode() });
  } catch (e) {
    return fail(409, (e as Error).message);
  }
}
