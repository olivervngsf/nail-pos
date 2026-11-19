// Is the app up? Used by the uptime check (.github/workflows/uptime.yml) every 10 minutes.
// Says only up/down per part: no data, no keys. 200 = all good, 503 = something is down.
export const dynamic = "force-dynamic";

async function db(): Promise<"ok" | "down" | "off"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return "off";
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    return r.ok ? "ok" : "down";
  } catch { return "down"; }
}

export async function GET() {
  const database = await db();
  const ok = database !== "down";
  return Response.json(
    { ok, app: "ok", database, at: new Date().toISOString(), version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev" },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
