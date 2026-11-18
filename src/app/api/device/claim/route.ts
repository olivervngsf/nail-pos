// QR device set-up (board 5.4): the tablet sends the 8-letter code from the owner's phone. We make the device its own
// login (never the owner's), use the code once, and send back that login so the tablet can sign in. Code = 10 min, one use.
import { asServer, fail } from "@/lib/server/pay";

export const runtime = "nodejs";
const clean = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function POST(req: Request) {
  const { code = "" } = (await req.json().catch(() => ({}))) as { code?: string };
  const c = clean(code);
  if (c.length !== 8) return fail(400, "bad_code");
  const sb = asServer();
  if (!sb) return fail(503, "not_set_up");

  const { data: open } = await sb.from("device_codes").select("code").eq("code", c).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!open) return fail(404, "bad_code");

  const email = `device-${crypto.randomUUID()}@devices.polishosapp.com`;
  const password = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const made = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { device: true } });
  if (made.error || !made.data.user) return fail(500, made.error?.message ?? "no_user");

  const { data: device, error } = await sb.rpc("_device_claim", { p_code: c, p_auth_user: made.data.user.id });
  if (error) {
    await sb.auth.admin.deleteUser(made.data.user.id);
    return fail(409, "bad_code");
  }
  return Response.json({ email, password, device });
}
