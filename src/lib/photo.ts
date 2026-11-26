"use client";
// My profile photo (Nov 26, Oliver: "users can upload a profile photo"). One square photo per login, shown wherever
// my initials show (profile, Settings, the profile pop-up, the left menu). File: Storage bucket "profile-photos" at
// <auth user id>/<random>.jpg (public read, only the owner writes; migration 20270123000001_profile_photos); the link is
// kept on the login (user_metadata.photo_url) and copied to this device so it shows offline. Test copy: device only.
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { SMS_ON } from "@/lib/auth";

const KEY = "nailpos.photo";
const EVT = "nailpos:photo";
const SIZE = 512; // px, square

const cached = (): string => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const keep = (url: string) => {
  try { if (url) localStorage.setItem(KEY, url); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(EVT, { detail: url }));
};

/** The signed-in person's photo link ("" = none → show initials). Follows changes made anywhere on this device. */
export function useMyPhoto(): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(cached());
    const on = (e: Event) => setUrl((e as CustomEvent<string>).detail ?? cached());
    window.addEventListener(EVT, on);
    if (SMS_ON) {
      const sb = getSupabase();
      void sb?.auth.getUser().then(({ data }) => {
        const u = (data.user?.user_metadata?.photo_url as string | undefined) ?? "";
        if (u !== cached()) keep(u);
      }).catch(() => { /* offline: keep the device copy */ });
    }
    return () => window.removeEventListener(EVT, on);
  }, []);
  return url;
}

/** Centre-crop to a square JPEG (512 px) so every avatar is light and round-ready. */
async function square(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = Math.min(SIZE, s);
  c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, c.width, c.height);
  return c;
}

/** Upload a new photo for me; returns its link. Needs internet (test copy: stays on this device). */
export async function setMyPhoto(file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error("photo");
  const c = await square(file);
  if (!SMS_ON) { const url = c.toDataURL("image/jpeg", 0.8); keep(url); return url; }
  const sb = getSupabase();
  if (!sb || (typeof navigator !== "undefined" && !navigator.onLine)) throw new Error("offline");
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error("signin");
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("photo"))), "image/jpeg", 0.85));
  const path = `${u.user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from("profile-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  const url = sb.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;
  const old = (u.user.user_metadata?.photo_url as string | undefined) ?? "";
  const { error: e2 } = await sb.auth.updateUser({ data: { photo_url: url } });
  if (e2) throw new Error(e2.message);
  keep(url);
  const oldPath = old.split("/profile-photos/")[1];
  if (oldPath) void sb.storage.from("profile-photos").remove([oldPath]); // tidy up; a miss leaves an unused file only
  return url;
}

/** Back to initials. */
export async function removeMyPhoto(): Promise<void> {
  if (!SMS_ON) { keep(""); return; }
  const sb = getSupabase();
  if (!sb) throw new Error("offline");
  const { data: u } = await sb.auth.getUser();
  const old = (u.user?.user_metadata?.photo_url as string | undefined) ?? "";
  const { error } = await sb.auth.updateUser({ data: { photo_url: null } });
  if (error) throw new Error(error.message);
  keep("");
  const oldPath = old.split("/profile-photos/")[1];
  if (oldPath) void sb.storage.from("profile-photos").remove([oldPath]);
}
