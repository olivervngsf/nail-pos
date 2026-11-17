// Test target for the offline queue (/kit "Offline test"). Counts the clientIds applied per tag,
// so a resend of the same action is applied once. Real features write to Supabase the same way.
const seen = new Map<string, Set<string>>();
const bucket = (tag: string) => seen.get(tag) ?? seen.set(tag, new Set()).get(tag)!;

export async function POST(req: Request) {
  const { clientId, tag = "kit" } = (await req.json()) as { clientId?: string; tag?: string };
  if (!clientId) return Response.json({ error: "clientId required" }, { status: 400 });
  const b = bucket(tag);
  const duplicate = b.has(clientId);
  b.add(clientId);
  return Response.json({ ok: true, duplicate, applied: b.size });
}

export async function GET(req: Request) {
  const tag = new URL(req.url).searchParams.get("tag") ?? "kit";
  return Response.json({ applied: bucket(tag).size });
}
