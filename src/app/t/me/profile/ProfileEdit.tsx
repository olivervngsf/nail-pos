"use client";
// Tech app → Me → My profile (board "Tech Profiles" row 2): the tech fills in what clients see on the booking page.
// Photo, about me (120 letters), best at, languages, years, work photos. Words show at once; new work photos wait for
// the owner's OK when the salon has that switch on. The name comes from the owner's Team list (techs can't rename).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Banner, Button, Chip, Toast } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import {
  ABOUT_MAX, BEST_AT, LANGUAGES, PHOTO_MAX, addWorkPhoto, cleanAbout, getProfile, removePhoto, saveProfile, staffPhotoUrl, TILE, toggle, uploadPicture,
  type StaffProfile,
} from "@/lib/staffProfile";
import { TechShell, useTechMe } from "../../tech";

export default function ProfileEdit() {
  const { lang } = useLang();
  const T = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const { me, err } = useTechMe();
  const [p, setP] = useState<StaffProfile | null>(null);
  const [about, setAbout] = useState("");
  const [bestAt, setBestAt] = useState<string[]>([]);
  const [langs, setLangs] = useState<string[]>([]);
  const [years, setYears] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const face = useRef<HTMLInputElement>(null);
  const work = useRef<HTMLInputElement>(null);

  const load = (x: StaffProfile) => { setP(x); setAbout(x.about); setBestAt(x.bestAt); setLangs(x.languages); setYears(x.years ? String(x.years) : ""); setPhoto(x.photo); };
  useEffect(() => {
    if (!me) return;
    void getProfile(me.salonId, me.id).then(load).catch((e: Error) => setMsg(e.message));
  }, [me]);
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 2400); };

  const save = async () => {
    if (!me) return;
    setBusy(true); setMsg("");
    try {
      load(await saveProfile(me.salonId, me.id, { about, bestAt, languages: langs, years: years ? Math.min(60, +years) : null, photo }));
      say(T("Saved. Clients see it now.", "Đã lưu. Khách thấy ngay."));
    } catch (e) { setMsg((e as Error).message === "offline" ? T("No internet. Try again when you're back online.", "Không có mạng. Thử lại khi có mạng.") : (e as Error).message); }
    finally { setBusy(false); }
  };
  const pickFace = async (f?: File) => {
    if (!me || !f) return;
    setBusy(true); setMsg("");
    try { setPhoto(await uploadPicture(me.salonId, me.id, f, true)); } catch { setMsg(T("That photo didn't upload. Try another.", "Ảnh không tải lên được. Thử ảnh khác.")); }
    finally { setBusy(false); }
  };
  const addWork = async (f?: File) => {
    if (!me || !f || !p) return;
    setBusy(true); setMsg("");
    try {
      const r = await addWorkPhoto(me.salonId, me.id, f);
      if (!r.ok) setMsg(T(`Up to ${PHOTO_MAX} photos. Remove one first.`, `Tối đa ${PHOTO_MAX} ảnh. Xoá bớt một ảnh.`));
      else say(r.status === "waiting" ? T("Added. It shows to clients after the owner OKs it.", "Đã thêm. Khách thấy sau khi chủ tiệm duyệt.") : T("Added", "Đã thêm"));
      setP(await getProfile(me.salonId, me.id));
    } catch { setMsg(T("That photo didn't upload. Try another.", "Ảnh không tải lên được. Thử ảnh khác.")); }
    finally { setBusy(false); }
  };
  const dropWork = async (id: string) => {
    if (!me) return;
    try { await removePhoto(me.salonId, me.id, id); setP(await getProfile(me.salonId, me.id)); } catch (e) { setMsg((e as Error).message); }
  };

  const dirty = !!p && (cleanAbout(about) !== p.about || bestAt.join() !== p.bestAt.join() || langs.join() !== p.languages.join()
    || (years ? +years : null) !== p.years || photo !== p.photo);
  const visible = p?.photos.filter((f) => f.status !== "hidden") ?? [];
  const faceUrl = staffPhotoUrl(photo);

  return (
    <TechShell title={T("My profile", "Hồ sơ của tôi")} me={me} err={err}>
      {me && !p && <div className="card pad" aria-busy="true">{msg || T("Loading…", "Đang tải…")}</div>}
      {me && p && <div className="tp-edit" data-testid="profile-edit">
        <Link href="/t/me" className="cap tp-backlink">‹ {T("Me", "Tôi")}</Link>
        {p.askedAt && <Banner tone="info" title={T("The owner asked you to update your profile.", "Chủ tiệm nhờ bạn cập nhật hồ sơ.")}>
          {T("Clients see it on the booking page.", "Khách thấy trên trang đặt lịch.")}</Banner>}
        {msg && <Banner tone="bad" onClose={() => setMsg("")}>{msg}</Banner>}

        <div className="tp-edit-face">
          <span className="tp-face" aria-hidden="true" style={faceUrl ? { width: 72, height: 72, backgroundImage: `url(${faceUrl})` } : { width: 72, height: 72, background: "#EADFD8", fontSize: 26 }}>{faceUrl ? "" : me.name.slice(0, 1)}</span>
          <div className="tp-grow">
            <b className="tp-name">{p.name}</b>
            <span className="cap">{T("Clients see your first name only.", "Khách chỉ thấy tên của bạn.")}</span>
            <Button size="sm" onClick={() => face.current?.click()} disabled={busy}>{photo ? T("Change photo", "Đổi ảnh") : T("Add photo", "Thêm ảnh")}</Button>
            <input ref={face} type="file" accept="image/*" hidden onChange={(e) => void pickFace(e.target.files?.[0])} />
          </div>
        </div>

        <div>
          <label className="lbl" htmlFor="tp-about">{T("About me", "Giới thiệu")} <span className="tp-count">· {about.trim().length} / {ABOUT_MAX}</span></label>
          <textarea id="tp-about" className="inp tp-area" data-testid="profile-about" maxLength={ABOUT_MAX} rows={3}
            placeholder={T("e.g. Detail work is my favorite. Bring a photo!", "VD: Mình thích làm chi tiết. Mang ảnh mẫu tới nhé!")}
            value={about} onChange={(e) => setAbout(e.target.value)} />
        </div>

        <div>
          <span className="lbl">{T("Best at", "Giỏi nhất")}</span>
          <div className="tp-chips">{BEST_AT.map((s) => <Chip key={s} on={bestAt.includes(s)} aria-pressed={bestAt.includes(s)} data-testid={`best-${s}`} onClick={() => setBestAt(toggle(bestAt, s))}>{s}</Chip>)}</div>
        </div>
        <div>
          <span className="lbl">{T("I speak", "Tôi nói")}</span>
          <div className="tp-chips">{LANGUAGES.map((s) => <Chip key={s} on={langs.includes(s)} aria-pressed={langs.includes(s)} onClick={() => setLangs(toggle(langs, s))}>{s}</Chip>)}</div>
        </div>
        <div>
          <label className="lbl" htmlFor="tp-years">{T("Years doing nails", "Số năm làm nail")}</label>
          <input id="tp-years" className="inp tp-years" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </div>

        <div>
          <span className="lbl">{T("My work", "Tác phẩm")} · {visible.length}</span>
          <div className="tp-grid4">
            {visible.map((f, i) => {
              const url = staffPhotoUrl(f.path);
              return (
                <figure key={f.id} className={`tp-tile${f.status === "waiting" ? " tp-wait" : ""}`} style={url ? { backgroundImage: `url(${url})` } : { background: TILE[i % TILE.length] }}>
                  <button type="button" className="tp-del" aria-label={T("Remove photo", "Xoá ảnh")} onClick={() => void dropWork(f.id)}>✕</button>
                  <figcaption>{f.status === "waiting" ? T("Waiting OK", "Chờ duyệt") : f.label || T("Shown", "Đang hiện")}</figcaption>
                </figure>
              );
            })}
            {visible.length < PHOTO_MAX && <button type="button" className="tp-add" data-testid="add-work" disabled={busy} onClick={() => work.current?.click()}>＋<span>{T("Add", "Thêm")}</span></button>}
          </div>
          <input ref={work} type="file" accept="image/*" hidden onChange={(e) => { void addWork(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="hint">{p.photoOk ? T("New photos show to clients after the owner OKs them. Work only, no faces.", "Ảnh mới hiện cho khách sau khi chủ tiệm duyệt. Chỉ ảnh móng, không chụp mặt.") : T("Work only, no faces.", "Chỉ ảnh móng, không chụp mặt.")}</p>
        </div>

        <Button variant="primary" block disabled={!dirty || busy} data-testid="profile-save" onClick={() => void save()}>{T("Save", "Lưu")}</Button>
      </div>}
      {toast && <Toast>{toast}</Toast>}
    </TechShell>
  );
}
