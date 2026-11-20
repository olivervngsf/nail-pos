// Server-only: our two Stripe webhooks, made by the app itself (Admin → System → "Set up Stripe webhooks") with the
// app's own Stripe key, so nobody copies secrets by hand.
//   payments = salon card payments on their Connect accounts → /api/stripe/webhook   (env STRIPE_WEBHOOK_SECRET)
//   billing  = plans + text credit on OUR account            → /api/billing/webhook  (env STRIPE_BILLING_WEBHOOK_SECRET)
// The signing secret Stripe shows once at creation is kept in platform_secrets (server only). A Vercel env var, when
// set, still works too: a message is accepted if it is signed with either.
import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HookKind = "payments" | "billing";
type Spec = { path: string; connect: boolean; env: string; events: Stripe.WebhookEndpointCreateParams.EnabledEvent[]; about: string };

export const HOOKS: Record<HookKind, Spec> = {
  payments: {
    path: "/api/stripe/webhook", connect: true, env: "STRIPE_WEBHOOK_SECRET",
    about: "PolishOS: salon card payments (Connect)",
    events: ["payment_intent.succeeded", "payment_intent.payment_failed", "checkout.session.completed", "charge.refunded", "charge.updated", "account.updated"],
  },
  billing: {
    path: "/api/billing/webhook", connect: false, env: "STRIPE_BILLING_WEBHOOK_SECRET",
    about: "PolishOS: salon plans + text credit",
    events: [
      "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.trial_will_end",
      "customer.subscription.paused", "customer.subscription.resumed",
      "invoice.paid", "invoice.payment_failed", "invoice.payment_succeeded", "invoice.finalized", "invoice.updated", "invoice.voided",
      "checkout.session.completed", "payment_intent.succeeded", "customer.updated", "payment_method.attached",
    ],
  },
};

const key = (k: HookKind) => `stripe_webhook_${k}`;
type Saved = { id: string; secret: string; url: string };

async function saved(db: SupabaseClient, k: HookKind): Promise<Saved | null> {
  const { data } = await db.from("platform_secrets").select("value").eq("name", key(k)).maybeSingle<{ value: Saved }>();
  return data?.value ?? null;
}

/** Check a Stripe message against every secret we have for this webhook (Vercel env first, then the saved one). */
export async function verifyEvent(st: Stripe, db: SupabaseClient, k: HookKind, body: string, sig: string): Promise<Stripe.Event | null> {
  const secrets = [process.env[HOOKS[k].env], (await saved(db, k))?.secret].filter((s): s is string => !!s);
  for (const s of secrets) {
    try { return st.webhooks.constructEvent(body, sig, s); } catch { /* try the next one */ }
  }
  return null;
}

export type HookStatus = { kind: HookKind; url: string; on: boolean; endpointId: string | null; events: number; missing: string[]; secret: "env" | "saved" | "none" };

/** What Stripe has for our webhook URLs right now. */
export async function hookStatus(st: Stripe, db: SupabaseClient, origin: string): Promise<HookStatus[]> {
  const list = (await st.webhookEndpoints.list({ limit: 100 })).data;
  return Promise.all((Object.keys(HOOKS) as HookKind[]).map(async (k) => {
    const url = origin + HOOKS[k].path;
    const ep = list.find((e) => e.url === url);
    const s = await saved(db, k);
    const have = new Set(ep?.enabled_events ?? []);
    return {
      kind: k, url, on: ep?.status === "enabled", endpointId: ep?.id ?? null, events: ep?.enabled_events.length ?? 0,
      missing: ep ? (have.has("*") ? [] : HOOKS[k].events.filter((e) => !have.has(e))) : HOOKS[k].events,
      secret: process.env[HOOKS[k].env] ? "env" : s && ep && s.id === ep.id ? "saved" : "none",
    };
  }));
}

/** Make (or fix) both webhooks on this site's address and keep their secrets. Safe to tap again. */
export async function setupHooks(st: Stripe, db: SupabaseClient, origin: string): Promise<HookStatus[]> {
  const list = (await st.webhookEndpoints.list({ limit: 100 })).data;
  for (const k of Object.keys(HOOKS) as HookKind[]) {
    const spec = HOOKS[k], url = origin + spec.path;
    const s = await saved(db, k);
    const same = list.filter((e) => e.url === url);
    const mine = same.find((e) => s && e.id === s.id);
    if (mine) {
      // We hold its secret: just make sure it listens for every event and is on.
      await st.webhookEndpoints.update(mine.id, { enabled_events: spec.events, disabled: false, description: spec.about });
      continue;
    }
    // Made by hand before (secret unknown to us) or never made: replace it with one whose secret we keep.
    // Skip replacing when a Vercel env secret exists for it, since that one may be the hand-made endpoint's secret.
    if (same.length && process.env[spec.env]) {
      for (const e of same) await st.webhookEndpoints.update(e.id, { enabled_events: spec.events, disabled: false });
      continue;
    }
    const ep = await st.webhookEndpoints.create({ url, enabled_events: spec.events, connect: spec.connect, description: spec.about, metadata: { app: "polishos", kind: k } });
    const { error } = await db.from("platform_secrets").upsert({ name: key(k), value: { id: ep.id, secret: ep.secret, url }, updated_at: new Date().toISOString() });
    if (error) { await st.webhookEndpoints.del(ep.id).catch(() => null); throw new Error(error.message); }
    for (const e of same) await st.webhookEndpoints.del(e.id).catch(() => null);
  }
  return hookStatus(st, db, origin);
}
