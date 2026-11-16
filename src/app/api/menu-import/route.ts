// Reads a salon's service menu from a website link or a photo and returns a clean list (name, minutes, price).
// Signed-in owners only (Supabase session token). Needs ANTHROPIC_API_KEY in Vercel; without it the app
// falls back to the nail template.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const Menu = z.object({
  services: z.array(
    z.object({
      category: z.string().describe("Menu section, e.g. Pedicures, Gel color, Enhancements, Waxing, Add-ons"),
      name: z.string().describe("Service name as the salon writes it"),
      minutes: z.number().int().describe("Duration in minutes; estimate a typical nail-salon time if not shown"),
      minutes_guessed: z.boolean().describe("true when minutes were not on the menu and you estimated them"),
      price_dollars: z.number().describe("Price in US dollars; for 'from $X' or a range use the lowest price"),
    }),
  ),
  note: z.string().describe("One short sentence for the owner if something was unclear, else empty"),
});

const PROMPT = `You read a US nail salon's service menu and list every service a client can book or buy.
- Keep the salon's own service names and section names.
- Include add-ons (French tip, nail art, removal). Skip non-services: hours, policies, gift card text, staff bios.
- One row per service. If a service has sizes (short/long) or variants with different prices, make one row each.
- Prices in dollars. "From $45" or "$45-55" means 45. Skip items with no price at all.
- Minutes: use the menu's time if shown; otherwise estimate a typical time and set minutes_guessed true.`;

const isPrivateHost = (h: string) =>
  /^(localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i.test(h);

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

  const body = (await req.json().catch(() => ({}))) as { url?: string; image?: string; mediaType?: string };
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];

  if (body.url) {
    let u: URL;
    try { u = new URL(/^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`); } catch { return fail(400, "That doesn't look like a web address."); }
    if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) return fail(400, "That doesn't look like a public web address.");
    let html = "";
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; NailPOS menu reader)" }, signal: AbortSignal.timeout(12_000), redirect: "follow" });
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
