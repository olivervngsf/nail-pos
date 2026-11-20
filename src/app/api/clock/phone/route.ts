// Clock in/out from a person's OWN phone. The salon's clock-in rule decides (Settings → Clock-in):
// off = salon devices only · qr = scan the QR on the salon's time clock · wifi = on the salon's own Wi-Fi · qr_or_wifi.
// Checked on the server (`_clock_phone`) with the address the server saw, so it can't be done from home. Every try is logged.
import { asServer, asUser, fail } from "@/lib/server/pay";
import { clientIp } from "@/lib/server/ip";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await asUser(req);
  if (!user) return fail(401, "Sign in first.");
  const { salonId, kind, code } = (await req.json().catch(() => ({}))) as { salonId?: string; kind?: string; code?: string };
  if (!salonId || (kind !== "in" && kind !== "out")) return fail(400, "bad request");
  const { data: me } = await user.auth.getUser();
  const { data: twoStep } = await user.rpc("two_step_needed");
  if (twoStep) return fail(403, "Enter your 2-step code first.");
  const sb = asServer();
  if (!sb || !me.user) return fail(503, "not_set_up");
  const { data, error } = await sb.rpc("_clock_phone", { p_auth_user: me.user.id, p_salon: salonId, p_kind: kind, p_ip: clientIp(req), p_code: code ?? "" });
  if (error) return fail(500, error.message);
  return Response.json(data);
}
