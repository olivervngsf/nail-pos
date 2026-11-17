// Runs the salon-wall SQL tests against a database (rolls back; leaves no data).
// Needs DATABASE_URL (Supabase: Project Settings > Database > connection string). CI uses a GitHub secret.
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set: skipping salon-wall tests");
  process.exit(0);
}
const dir = new URL("../supabase/tests/", import.meta.url);
const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await client.connect();
let failed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    const res = await client.query(readFileSync(new URL(f, dir), "utf8"));
    const rows = (Array.isArray(res) ? res : [res]).flatMap((r) => r.rows ?? []);
    console.log(`✓ ${f}`, rows.map((r) => r.result).filter(Boolean).join(" "));
  } catch (e) {
    failed++;
    console.error(`✗ ${f}: ${e.message}`);
    await client.query("rollback").catch(() => {});
  }
}
await client.end();
process.exit(failed ? 1 : 0);
