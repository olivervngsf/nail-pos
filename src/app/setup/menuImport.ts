"use client";
// Calls /api/menu-import with the owner's session. Photos are shrunk on the device first (max 1600 px JPEG).
import { getSupabase } from "@/lib/supabase/client";
import type { Service } from "@/lib/onboarding/data";

export async function shrinkPhoto(file: File): Promise<{ image: string; mediaType: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  return { image: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}

export async function importMenu(input: { url: string } | { image: string; mediaType: string }): Promise<{ services: Service[]; note: string }> {
  const sb = getSupabase();
  const token = (await sb?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("Sign in first.");
  const r = await fetch("/api/menu-import", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "Couldn't read the menu.");
  return {
    services: (data.services as Omit<Service, "id" | "on">[]).map((s) => ({ ...s, id: crypto.randomUUID(), on: true })),
    note: data.note ?? "",
  };
}
