// Reads a salon's service menu from a website link or a photo and returns a clean list (name, minutes, price).
// Signed-in owners/managers (or a new owner still in setup) only, 10 reads a day each (Supabase session token). Needs ANTHROPIC_API_KEY in Vercel; without it the app
// falls back to the nail template.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { asServer } from "@/lib/server/pay";
import { safeFetch } from "@/lib/server/safeFetch";

export const runtime = "nodejs";
export const maxDuration = 60;

const Menu = z.object({
  services: z.array(
    z.object({
      category: z.string().describe("Menu section, e.g. Pedicures, Gel color, Enhancements, Waxing, Add-ons"),
      name: z.string().describe("Service name as the salon writes it"),
      minutes: z.number().int().describe("Duration in minutes; estimate a typical nail-salon time if not shown"),
      minutes_guessed: z.boolean().describe("true when minutes were not on the menu and you estimated them"),
      price_dollars: z.number().describe("Price in US dollars; for 'from $X', '$X+' or a range use the lowest price"),
      price_from: z.boolean().describe("true when the price is a starting price: shown as '$45+', 'from $45', '$45 and up' or a range"),
    }),
  ),
  note: z.string().describe("One short sentence for the owner if something was unclear, else empty"),
});

const PROMPT = `You read a US nail salon's service menu and list every service a client can book or buy.
- Keep the salon's own service names and section names.
- Include add-ons (French tip, nail art, removal). Skip non-services: hours, policies, gift card text, staff bios.
- One row per service. If a service has sizes (short/long) or variants with different prices, make one row each.
- Prices in dollars. "$45+", "From $45", "$45 and up" or "$45-55" all mean 45 with price_from true. Skip items with no price at all.
- Minutes: use the menu's time if shown; otherwise estimate a typical time and set minutes_guessed true.`;

const PER_DAY = 10;
// Fallback when the server key isn't set: per running server only (resets on deploy).
const memo = new Map<string, number[]>();

function pageText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|section|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#36;|&dollar;/g, "$").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim()
    .slice(0, 80_000);
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  // Who is asking: signed-in users only, so strangers can't spend our AI credit.
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return fail(401, "Sign in first.");
  const { data: who } = await createClient(url, key).auth.getUser(token);
  if (!who.user) return fail(401, "Sign in first.");
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "Menu reading isn't switched on yet. Use the nail template for now.");

  // Owners/managers (or someone with no salon yet, i.e. an owner in setup). Techs and front desk can't spend AI credit.
  const asThem = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: ms } = await asThem.rpc("my_memberships");
  const roles = ((ms ?? []) as { role: string }[]).map((m) => m.role);
  if (roles.length && !roles.some((r) => r === "owner" || r === "manager")) return fail(403, "Only the owner or a manager can read a menu.");

  // Daily limit per person.
  const uid = who.user.id, dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const db = asServer();
  if (db) {
    const { count } = await db.from("ai_calls").select("id", { count: "exact", head: true }).eq("auth_user_id", uid).gte("at", dayAgo);
    if ((count ?? 0) >= PER_DAY) return fail(429, "That's today's limit for menu reading. Try again tomorrow, or use the nail template.");
    await db.from("ai_calls").insert({ auth_user_id: uid, kind: "menu-import" });
  } else {
    const recent = (memo.get(uid) ?? []).filter((t) => t > Date.now() - 86_400_000);
    if (recent.length >= PER_DAY) return fail(429, "That's today's limit for menu reading. Try again tomorrow, or use the nail template.");
    memo.set(uid, [...recent, Date.now()]);
  }

  const body = (await req.json().catch(() => ({}))) as { url?: string; image?: string; mediaType?: string };
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];

  if (body.url) {
    let u: URL;
    try { u = new URL(/^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`); } catch { return fail(400, "That doesn't look like a web address."); }
    if (!/^https?:$/.test(u.protocol)) return fail(400, "That doesn't look like a public web address.");
    let html = "";
    try {
      const r = await safeFetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; NailPOS menu reader)" }, signal: AbortSignal.timeout(12_000) });
      if (!r.ok) return fail(400, `Couldn't open that page (error ${r.status}).`);
      html = (await r.text()).slice(0, 2_000_000);
    } catch { return fail(400, "Couldn't open that page. Check the address, or use a photo of your menu."); }
    const text = pageText(html);
    if (text.length < 150 || !/\$\s?\d/.test(text)) return fail(422, "No prices found on that page (it may load prices in a way we can't read). Try a photo of your menu.");
    content.push({ type: "text", text: `Menu page ${u.href}:\n\n${text}` });
  } else if (body.image && /^image\/(jpeg|png|webp|gif)$/.test(body.mediaType ?? "")) {
    if (body.image.length > 6_000_000) return fail(413, "That photo is too big. Try again (we shrink it automatically).");
    content.push({ type: "image", source: { type: "base64", media_type: body.mediaType as "image/jpeg", data: body.image } });
    content.push({ type: "text", text: "This is a photo of the salon's price board or menu." });
  } else {
    return fail(400, "Send a website link or a photo.");
  }

  try {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Menu) },
      system: PROMPT,
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return fail(422, "Couldn't read that menu. Try a clearer photo or the nail template.");
    // ALL-CAPS menus read badly on screens: "REGULAR SPA PEDICURE" → "Regular Spa Pedicure". Mixed case is kept as written.
    const nice = (t: string) => t.replace(/\b[A-Z][A-Z']{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
    const services = res.parsed_output.services
      .filter((s) => s.name.trim() && s.price_dollars >= 0)
      .map((s) => ({
        cat: nice(s.category.trim()) || "Services",
        name: nice(s.name.trim()),
        minutes: Math.min(300, Math.max(5, Math.round(s.minutes / 5) * 5)),
        priceCents: Math.round(s.price_dollars * 100),
        priceFrom: s.price_from,
        flag: s.minutes_guessed,
      }));
    if (!services.length) return fail(422, "No services found. Try a photo of your menu or the nail template.");
    return Response.json({ services, note: res.parsed_output.note });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(429, "Busy right now. Try again in a minute.");
    if (e instanceof Anthropic.APIError) return fail(502, `Menu reading failed (${e.status}). Try again or use the nail template.`);
    throw e;
  }
}
