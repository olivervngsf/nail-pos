// Salon Wi-Fi for clock-in. GET ?salon= → { here } (is this request coming from the salon's saved Wi-Fi?).
// POST { salonId, label } → owner/manager saves the internet address this request came from as the salon's Wi-Fi.
// Do it ON the salon Wi-Fi (e.g. from the front desk computer or the owner's phone while connected to it).
import { asServer, asUser, fail } from "@/lib/server/pay";
import { clientIp } from "@/lib/server/ip";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await asUser(req);
  if (!user) return fail(401, "Sign in first.");
  const salon = new URL(req.url).searchParams.get("salon");
  if (!salon) return fail(400, "bad request");
  const { data: rule } = await user.rpc("clock_phone_rule", { p_salon: salon });
  if (!rule) return fail(403, "not a member");
  const sb = asServer();
  if (!sb) return Response.json({ here: false, rule });
  const { data } = await sb.rpc("_clock_wifi_here", { p_salon: salon, p_ip: clientIp(req) });
  return Response.json({ here: !!data, rule });
}

export async function POST(req: Request) {
  const user = await asUser(req);
  if (!user) return fail(401, "Sign in first.");
  const { salonId, label } = (await req.json().catch(() => ({}))) as { salonId?: string; label?: string };
  if (!salonId) return fail(400, "bad request");
  const { data: me } = await user.auth.getUser();
  const sb = asServer();
  if (!sb || !me.user) return fail(503, "not_set_up");
  const { data, error } = await sb.rpc("_clock_wifi_add", { p_auth_user: me.user.id, p_salon: salonId, p_ip: clientIp(req), p_label: label ?? "" });
  if (error) return fail(500, error.message);
  if ((data as { error?: string })?.error) return fail(403, (data as { error: string }).error);
  return Response.json(data);
}
