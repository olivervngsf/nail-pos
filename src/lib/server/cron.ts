// Who may run a scheduled job (/api/cron/*): GitHub Actions "Scheduled texts" with CRON_SECRET (Vercel env), or the
// database's own once-a-minute job (pg_cron → pg_net) with the token it keeps in platform_secrets 'db_cron'.
// A GitHub call also (re)registers this site's address with the database, so the minute job starts by itself:
// no hand setup per salon or per environment (migration 20270117000001_reminder_settings).
import type { SupabaseClient } from "@supabase/supabase-js";

export async function cronAuth(req: Request, db: SupabaseClient, origin: string): Promise<"github" | "db" | null> {
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!got) return null;
  const secret = process.env.CRON_SECRET;
  const { data } = await db.from("platform_secrets").select("value").eq("name", "db_cron").maybeSingle();
  const saved = (data?.value ?? null) as { url?: string; token?: string } | null;
  if (secret && got === secret) {
    // Only a real https site registers (never localhost or a preview on the test database by mistake).
    if (/^https:\/\/[a-z0-9.-]+$/.test(origin) && saved?.url !== origin) await db.rpc("db_cron_register", { p_url: origin });
    return "github";
  }
  if (saved?.token && got === saved.token) return "db";
  return null;
}
