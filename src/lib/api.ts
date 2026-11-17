"use client";
// Call our own server routes as the signed-in person (bearer token). Throws the route's plain-words error.
import { getSupabase } from "@/lib/supabase/client";

export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("Sign in first.");
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong. Try again.");
  return data as T;
}
