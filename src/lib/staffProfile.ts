"use client";
// Tech profiles on the salon page (board "Tech Profiles": C = team row + quick sheet on the booking page, B = full page).
// A tech fills in their own (tech app → Me → My profile); the owner sees everyone in Settings → Tech profiles, asks for
// updates and OKs new work photos. Clients see first names only, never a phone or last name.
// Database: migration 20270201000001_tech_profiles (staff_profiles, staff_photos, book_team, staff_profile_*).
// Test copy (no Supabase, or the "demo" salon): sample profiles kept on this device.
import { rpc, SMS_ON } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { DEMO_DESK } from "@/lib/desk";
import { SKILLS } from "@/lib/team";

export const BEST_AT = SKILLS;
export const LANGUAGES = ["Vietnamese", "English", "Spanish", "Chinese", "Korean"] as const;
export const ABOUT_MAX = 120;
export const PHOTO_MAX = 12;

export type PhotoStatus = "waiting" | "shown" | "hidden";
export type StaffPhoto = { id: string; path: string; label: string; status: PhotoStatus; at?: string };
/** One person's profile as the tech / owner sees it. */
export type StaffProfile = {
  membershipId: string; name: string; role: string;
  about: string; bestAt: string[]; languages: string[]; years: number | null; photo: string | null;
  updatedAt: string | null; updatedBy: string | null; askedAt: string | null; photos: StaffPhoto[];
  photoOk?: boolean; canOk?: boolean;
};
/** One tech as a client sees them on the booking page. */
export type TeamMember = {
  id: string; name: string; about?: string; bestAt?: string[]; languages?: string[]; years?: number | null;
  photo?: string | null; photos?: { path: string; label: string }[];
};
export type TeamList = { profilesOn: boolean; photoOk: boolean; people: StaffProfile[] };

/** What the owner's list shows for a person: waiting photos first, then live, asked, not started. */
export type ProfileState = "waiting" | "live" | "asked" | "none";
export function profileState(p: Pick<StaffProfile, "about" | "bestAt" | "photos" | "photo" | "askedAt">): ProfileState {
  if (p.photos.some((f) => f.status === "waiting")) return "waiting";
  if (p.about.trim() || p.bestAt.length || p.photo || p.photos.some((f) => f.status === "shown")) return "live";
  return p.askedAt ? "asked" : "none";
}
const RANK: Record<ProfileState, number> = { waiting: 0, asked: 1, none: 2, live: 3 };
export const byState = (a: StaffProfile, b: StaffProfile) => RANK[profileState(a)] - RANK[profileState(b)] || a.name.localeCompare(b.name);

/** First word of a name: all a client ever sees. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
/** Has the client side anything to show beyond a name? */
export const hasProfile = (m: TeamMember) => !!(m.about?.trim() || m.bestAt?.length || m.photo || m.photos?.length);

/** Same rules as the database (_clean_list): trimmed, no blanks, no repeats (any case), first ones kept, capped. */
export function cleanList(xs: readonly string[], max: number, len: number): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of xs) {
    const v = x.trim().slice(0, len); const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k); out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
export const cleanAbout = (s: string) => s.trim().slice(0, ABOUT_MAX);
export const toggle = (xs: readonly string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

export function staffPhotoUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("data:")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return path.startsWith("demo:") || !base ? "" : `${base}/storage/v1/object/public/staff-photos/${path}`;
}
/** Soft colour for a placeholder tile (demo photos / no photo yet). */
export const TILE = ["#C9A79A", "#B07C8E", "#8C9C88", "#D7B88F", "#6E7A8C", "#A3B5C9"];
export const AVATAR_TINT = ["#EADFD8", "#DDE6DA", "#DCE3EE", "#EEE3D3", "#E6E0EE"];
export const tint = (i: number) => AVATAR_TINT[i % AVATAR_TINT.length];

// ---- Test copy ----------------------------------------------------------------------------------------------------
const DEMO_KEY = "nailpos.demoProfiles.v1";
const SAMPLE: Record<string, Partial<StaffProfile>> = {
  Kim: { about: "Detail work is my favorite. Bring a photo and we'll make it yours.", bestAt: ["Nail art", "Gel", "Dip"], languages: ["Vietnamese", "English"], years: 8,
    photos: [{ id: "d1", path: "demo:1", label: "Ombre", status: "shown" }, { id: "d2", path: "demo:2", label: "Cat eye", status: "shown" },
      { id: "d3", path: "demo:3", label: "Floral", status: "shown" }, { id: "d4", path: "demo:4", label: "Chrome", status: "waiting" }] },
  "Tuyết": { about: "Relaxing spa pedicures, every time.", bestAt: ["Pedicure", "Acrylic"], languages: ["Vietnamese"], years: 12,
    photos: [{ id: "d5", path: "demo:5", label: "Spa pedi", status: "shown" }] },
};
export const demoMode = (salonId?: string | null) => !SMS_ON || !getSupabase() || salonId === DEMO_DESK.salonId;

function demoAll(): StaffProfile[] {
  let saved: Record<string, StaffProfile> = {};
  try { saved = JSON.parse(localStorage.getItem(DEMO_KEY) ?? "{}"); } catch { /* storage blocked */ }
  return DEMO_DESK.staff.filter((s) => s.role === "tech").map((s) => saved[s.id] ?? {
    membershipId: s.id, name: s.name, role: "tech", about: "", bestAt: [], languages: [], years: null, photo: null,
    updatedAt: null, updatedBy: null, askedAt: null, photos: [], ...SAMPLE[s.name],
  });
}
function demoKeep(p: StaffProfile) {
  try {
    const all = JSON.parse(localStorage.getItem(DEMO_KEY) ?? "{}") as Record<string, StaffProfile>;
    all[p.membershipId] = p; localStorage.setItem(DEMO_KEY, JSON.stringify(all));
  } catch { /* storage blocked */ }
}
const demoSettings = () => { try { return { profilesOn: true, photoOk: true, ...JSON.parse(localStorage.getItem(`${DEMO_KEY}.s`) ?? "{}") }; } catch { return { profilesOn: true, photoOk: true }; } };

/** Clients' view of a demo salon: shown photos only, first names. */
export function demoTeam(): { on: boolean; team: TeamMember[] } {
  const s = demoSettings();
  return { on: s.profilesOn, team: demoAll().map((p) => s.profilesOn
    ? { id: p.membershipId, name: firstName(p.name), about: p.about, bestAt: p.bestAt, languages: p.languages, years: p.years, photo: p.photo,
        photos: p.photos.filter((f) => f.status === "shown").map(({ path, label }) => ({ path, label })) }
    : { id: p.membershipId, name: firstName(p.name) }) };
}

// ---- Calls --------------------------------------------------------------------------------------------------------
export async function loadTeam(slug: string, demo: boolean): Promise<{ on: boolean; team: TeamMember[] } | null> {
  if (demo) return demoTeam();
  return rpc<{ on: boolean; team: TeamMember[] } | null>("book_team", { p_slug: slug });
}
export async function listProfiles(salonId: string): Promise<TeamList> {
  if (demoMode(salonId)) return { ...demoSettings(), people: demoAll() };
  return rpc<TeamList>("staff_profiles_list", { p_salon: salonId });
}
export async function getProfile(salonId: string, membershipId: string): Promise<StaffProfile> {
  if (demoMode(salonId)) {
    const p = demoAll().find((x) => x.membershipId === membershipId) ?? demoAll()[0];
    return { ...p, photoOk: demoSettings().photoOk, canOk: false };
  }
  return rpc<StaffProfile>("staff_profile_get", { p_salon: salonId, p_membership: membershipId });
}
export type ProfileEdit = { about: string; bestAt: string[]; languages: string[]; years: number | null; photo: string | null };
export async function saveProfile(salonId: string, membershipId: string, e: ProfileEdit): Promise<StaffProfile> {
  const clean = { about: cleanAbout(e.about), bestAt: cleanList(e.bestAt, 8, 24), languages: cleanList(e.languages, 6, 20), years: e.years, photo: e.photo };
  if (demoMode(salonId)) {
    const p = { ...(await getProfile(salonId, membershipId)), ...clean, updatedAt: new Date().toISOString(), updatedBy: "You", askedAt: null };
    demoKeep(p); return p;
  }
  return rpc<StaffProfile>("staff_profile_save", { p_salon: salonId, p_membership: membershipId, p: { ...clean, years: clean.years ?? null } });
}
export async function askUpdate(salonId: string, membershipId: string) {
  if (demoMode(salonId)) { const p = await getProfile(salonId, membershipId); demoKeep({ ...p, askedAt: new Date().toISOString() }); return; }
  await rpc("staff_profile_ask", { p_salon: salonId, p_membership: membershipId });
}
export async function decidePhoto(salonId: string, membershipId: string, photoId: string, show: boolean) {
  if (demoMode(salonId)) {
    const p = await getProfile(salonId, membershipId);
    demoKeep({ ...p, photos: p.photos.map((f) => (f.id === photoId ? { ...f, status: show ? "shown" : "hidden" } : f)) }); return;
  }
  await rpc("staff_photo_decide", { p_id: photoId, p_show: show });
}
export async function removePhoto(salonId: string, membershipId: string, photoId: string) {
  if (demoMode(salonId)) { const p = await getProfile(salonId, membershipId); demoKeep({ ...p, photos: p.photos.filter((f) => f.id !== photoId) }); return; }
  await rpc("staff_photo_remove", { p_id: photoId });
}
export async function saveProfileSettings(salonId: string, s: { profilesOn?: boolean; photoOk?: boolean }) {
  if (demoMode(salonId)) { const v = { ...demoSettings(), ...s }; try { localStorage.setItem(`${DEMO_KEY}.s`, JSON.stringify(v)); } catch { /* */ } return v; }
  return rpc<{ profilesOn: boolean; photoOk: boolean }>("staff_profile_settings_save", { p_salon: salonId, p: s });
}

/** Shrink a picture before upload: avatar = 512 px square, work photo = longest side 1080 px. JPEG. */
async function shrink(file: File, square: boolean): Promise<HTMLCanvasElement> {
  if (!/^image\//.test(file.type)) throw new Error("photo");
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  if (square) {
    const s = Math.min(bmp.width, bmp.height); c.width = c.height = Math.min(512, s);
    c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, c.width, c.height);
  } else {
    const k = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  }
  return c;
}
/** Upload a picture into this person's folder; returns its storage path (test copy: a data URL on the device). */
export async function uploadPicture(salonId: string, membershipId: string, file: File, square: boolean): Promise<string> {
  const c = await shrink(file, square);
  if (demoMode(salonId)) return c.toDataURL("image/jpeg", 0.8);
  const sb = getSupabase();
  if (!sb || (typeof navigator !== "undefined" && !navigator.onLine)) throw new Error("offline");
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("photo"))), "image/jpeg", 0.85));
  const path = `${salonId}/${membershipId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from("staff-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}
/** A new work photo: shown at once or waiting for the owner's OK (the server decides). */
export async function addWorkPhoto(salonId: string, membershipId: string, file: File, label = ""): Promise<{ ok: boolean; status?: PhotoStatus; reason?: string }> {
  const path = await uploadPicture(salonId, membershipId, file, false);
  const id = crypto.randomUUID();
  if (demoMode(salonId)) {
    const p = await getProfile(salonId, membershipId);
    if (p.photos.filter((f) => f.status !== "hidden").length >= PHOTO_MAX) return { ok: false, reason: "too_many" };
    const status: PhotoStatus = demoSettings().photoOk ? "waiting" : "shown";
    demoKeep({ ...p, photos: [...p.photos, { id, path, label, status }] });
    return { ok: true, status };
  }
  return rpc("staff_photo_add", { p_salon: salonId, p_membership: membershipId, p_id: id, p_path: path, p_label: label });
}
