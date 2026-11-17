"use client";
// Clients + client history (M6). Live = Supabase functions (client_list, client_profile, …); every staff member of the
// salon (techs too, on their phone) reads the same profile. Test copy = sample clients on this device.
import { useEffect, useState } from "react";
import { SMS_ON, getDevice, isSignedIn, myMemberships, rpc, type Role } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { DEMO_DESK } from "@/lib/desk";

export type ClientFilter = "all" | "regular" | "lost" | "new" | "bday" | "gift";
export type ClientRow = {
  id: string; name: string; phone: string | null; tag: "regular" | "lost" | "new" | null; visits: number; last_visit: string | null;
  usual_service: string | null; usual_staff: string | null; gap_days: number | null; care: boolean; gift_cents: number;
};
export type ClientList = { counts: Record<ClientFilter, number>; rows: ClientRow[] };
export type Visit = {
  ticket_id: string; number: number; at: string; status: string;
  services: { name: string; cents: number; minutes: number | null; staff: string | null }[] | null;
  subtotal: number; discount: number; tip: number; total: number;
  payments: { method: string; cents: number; fee: number; brand: string | null; last4: string | null }[] | null;
};
export type Profile = {
  id: string; name: string; phone: string | null; email: string | null; language: "en" | "vi"; texts_ok: boolean; birthday: string | null; since: string;
  notes: string; care: string; shape: string; colors: string; usual_staff_id: string | null; usual_staff: string | null; usual_service: string | null;
  tag: ClientRow["tag"];
  stats: { visits: number; spent: number; avg: number; avg_tip: number; gap_days: number | null; last_visit: string | null };
  gift_cards: { last4: string; balance_cents: number; sold_at: string | null }[];
  notes_log: { id: string; body: string; ticket_id: string | null; by: string | null; at: string }[];
  photos: { id: string; path: string; ticket_id: string | null; at: string; by: string | null; url?: string }[];
  visits: Visit[];
};
export type Who = { mode: "demo" | "live"; salonId: string; salonName: string; role: Role; name: string };

/** Who is looking (any role: desk, owner, tech). */
export function useWho() {
  const [who, setWho] = useState<Who | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!SMS_ON) { setWho({ mode: "demo", salonId: DEMO_DESK.salonId, salonName: DEMO_DESK.salonName, role: "front_desk", name: DEMO_DESK.me.display_name }); return; }
    void (async () => {
      try {
        if (!(await isSignedIn())) { location.replace("/login"); return; }
        const list = await myMemberships();
        const saved = getDevice()?.salonId ?? (() => { try { return localStorage.getItem("nailpos.salon"); } catch { return null; } })();
        const m = list.find((x) => x.salon_id === saved) ?? list[0];
        if (!m) { setErr("You're not in a salon yet."); return; }
        setWho({ mode: "live", salonId: m.salon_id, salonName: m.salon_name, role: m.role, name: m.display_name });
      } catch (e) { setErr(navigator.onLine ? (e as Error).message : "offline"); }
    })();
  }, []);
  return { who, err };
}
export const isDesk = (r: Role) => r !== "tech";

/* ---------- test copy ---------- */
const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const DEMO: Profile[] = [
  mk("c1", "Lan Tran", "+14085550142", "regular", 10, 28, "Gel color manicure", "Kim", { care: "Sensitive skin: no strong acetone soak.", shape: "Almond · short", colors: "OPI Bubble Bath, nudes", notes: "Likes quiet; prefers the window chair.", birthdayMonthNow: true, gift: 3000 }),
  mk("c2", "Jen Park", "+14085550131", "lost", 49, 21, "Spa pedicure", "Ngọc", { notes: "Usually every 3 weeks." }),
  mk("c3", "Thu Le", "+14085550166", "lost", 57, 28, "Gel color manicure", "Tuyết", {}),
  mk("c4", "Mai Pham", "+14085550170", "regular", 0, 14, "Acrylic full set", "Kim", { gift: 5000 }),
  mk("c5", "Sara Lopez", "+14085550155", "new", 2, null, "Pedicure + design", "Tuyết", {}),
];
function mk(id: string, name: string, phone: string, tag: ClientRow["tag"], lastDays: number, gap: number | null, svc: string, staff: string,
  o: { care?: string; shape?: string; colors?: string; notes?: string; birthdayMonthNow?: boolean; gift?: number }): Profile {
  const n = gap ? 6 : 1;
  const visits: Visit[] = Array.from({ length: n }, (_, i) => ({
    ticket_id: `${id}-v${i}`, number: 1040 - i * 7, at: day(lastDays + i * (gap ?? 0)), status: "paid",
    services: [{ name: svc, cents: 4500, minutes: 45, staff }], subtotal: 4500, discount: 0, tip: 900, total: 5400,
    payments: [i % 2 ? { method: "cash", cents: 5400, fee: 0, brand: null, last4: null } : { method: "card_reader", cents: 5400, fee: 151, brand: "visa", last4: "4242" }],
  }));
  const bday = o.birthdayMonthNow ? `2000-${String(new Date().getMonth() + 1).padStart(2, "0")}-20` : null;
  return {
    id, name, phone, email: null, language: "en", texts_ok: true, birthday: bday, since: day(lastDays + n * (gap ?? 0) + 200), notes: o.notes ?? "", care: o.care ?? "",
    shape: o.shape ?? "", colors: o.colors ?? "", usual_staff_id: null, usual_staff: staff, usual_service: svc, tag,
    stats: { visits: n, spent: n * 4500, avg: 4500, avg_tip: 900, gap_days: gap, last_visit: day(lastDays) },
    gift_cards: o.gift ? [{ last4: "4821", balance_cents: o.gift, sold_at: day(45) }] : [],
    notes_log: id === "c1" ? [{ id: "n1", body: "Nude pink (OPI Bubble Bath), short almond. Skin a bit red at cuticles: gentle remover next time.", ticket_id: "c1-v0", by: staff, at: day(lastDays) }] : [],
    photos: [], visits,
  };
}
const DKEY = "nailpos.demoClients.v1";
function demoAll(): Profile[] { try { const r = localStorage.getItem(DKEY); if (r) return JSON.parse(r); } catch { /* */ } return DEMO; }
function demoPut(p: Profile) { const all = demoAll(); const i = all.findIndex((x) => x.id === p.id); if (i >= 0) all[i] = p; else all.unshift(p); try { localStorage.setItem(DKEY, JSON.stringify(all)); } catch { /* */ } }
const thisMonth = (d: string | null) => !!d && Number(d.slice(5, 7)) === new Date().getMonth() + 1;

/* ---------- reads ---------- */
export async function listClients(who: Who, filter: ClientFilter, q: string): Promise<ClientList> {
  if (who.mode === "live") return rpc<ClientList>("client_list", { p_salon: who.salonId, p_filter: filter, p_q: q });
  const all = demoAll();
  const ql = q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
  const match = (p: Profile) => !ql || p.name.toLowerCase().includes(ql) || (qd.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(qd));
  const ok: Record<ClientFilter, (p: Profile) => boolean> = {
    all: () => true, regular: (p) => p.tag === "regular" || p.tag === "lost", lost: (p) => p.tag === "lost", new: (p) => p.tag === "new",
    bday: (p) => thisMonth(p.birthday), gift: (p) => p.gift_cards.some((g) => g.balance_cents > 0),
  };
  const counts = Object.fromEntries(Object.entries(ok).map(([k, f]) => [k, all.filter(f).length])) as Record<ClientFilter, number>;
  const rows = all.filter((p) => ok[filter](p) && match(p)).map((p) => ({
    id: p.id, name: p.name, phone: p.phone, tag: p.tag, visits: p.stats.visits, last_visit: p.stats.last_visit, usual_service: p.usual_service,
    usual_staff: p.usual_staff, gap_days: p.stats.gap_days, care: !!p.care, gift_cents: p.gift_cards.reduce((a, g) => a + g.balance_cents, 0),
  }));
  return { counts, rows };
}

export async function getProfile(who: Who, id: string): Promise<Profile> {
  if (who.mode === "demo") { const p = demoAll().find((x) => x.id === id); if (!p) throw new Error("not found"); return p; }
  const p = await rpc<Profile>("client_profile", { p_client: id });
  const sb = getSupabase();
  if (sb && p.photos.length) {
    const { data } = await sb.storage.from("client-photos").createSignedUrls(p.photos.map((x) => x.path), 3600);
    p.photos = p.photos.map((x) => ({ ...x, url: data?.find((d) => d.path === x.path)?.signedUrl ?? undefined }));
  }
  return p;
}

/* ---------- writes ---------- */
export type ClientEdit = { name: string; phone: string; email: string; birthday: string; shape: string; colors: string; care: string; notes: string; textsOk: boolean; language: "en" | "vi"; approvalId: string };
export async function saveClient(who: Who, id: string | null, e: Partial<ClientEdit>): Promise<string> {
  if (who.mode === "demo") {
    const cur = id ? demoAll().find((x) => x.id === id) : undefined;
    const p: Profile = cur ?? mk(crypto.randomUUID(), e.name ?? "", e.phone ?? "", "new", 0, null, "", "", {});
    if (!cur) { p.visits = []; p.stats = { visits: 0, spent: 0, avg: 0, avg_tip: 0, gap_days: null, last_visit: null }; p.since = new Date().toISOString(); }
    demoPut({ ...p, name: e.name ?? p.name, phone: e.phone ?? p.phone, email: e.email ?? p.email, birthday: e.birthday ?? p.birthday, shape: e.shape ?? p.shape,
      colors: e.colors ?? p.colors, care: e.care ?? p.care, notes: e.notes ?? p.notes, texts_ok: e.textsOk ?? p.texts_ok, language: e.language ?? p.language });
    return p.id;
  }
  return rpc<string>("client_save", { p: { id, salonId: who.salonId, ...e } });
}

export async function addNote(who: Who, p: Profile, body: string, ticketId: string | null) {
  const note = { id: crypto.randomUUID(), body: body.trim(), ticket_id: ticketId, by: who.name, at: new Date().toISOString() };
  if (who.mode === "demo") { demoPut({ ...p, notes_log: [note, ...p.notes_log] }); return; }
  await rpc("client_add_note", { p_id: note.id, p_client: p.id, p_ticket: ticketId, p_body: note.body });
}

/** Shrink on the phone (max 1600 px, JPEG), upload to the salon's private photo folder, then record it. */
export async function addPhoto(who: Who, p: Profile, file: File, ticketId: string | null) {
  const id = crypto.randomUUID();
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  if (who.mode === "demo") {
    const url = c.toDataURL("image/jpeg", 0.7);
    demoPut({ ...p, photos: [{ id, path: `demo/${id}`, ticket_id: ticketId, at: new Date().toISOString(), by: who.name, url }, ...p.photos] });
    return;
  }
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("photo"))), "image/jpeg", 0.85));
  const path = `${who.salonId}/${p.id}/${id}.jpg`;
  const sb = getSupabase();
  if (!sb) throw new Error("offline");
  const { error } = await sb.storage.from("client-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  await rpc("client_add_photo", { p_id: id, p_client: p.id, p_ticket: ticketId, p_path: path });
}

/** "every 4 wk" from days between visits. */
export const everyWeeks = (gap: number | null) => (gap ? Math.max(1, Math.round(gap / 7)) : null);
