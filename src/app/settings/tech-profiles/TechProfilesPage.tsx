"use client";
// Settings → Team & time clock → Tech profiles (board "Tech Profiles" row 3): what clients see on the booking page.
// Techs fill in their own (tech app → Me → My profile); here the owner / manager sees everyone, asks for updates,
// fills one in, and OKs new work photos. Two salon switches: show profiles on the booking page, new photos need an OK.
import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Chip, Drawer, ListGroup, Row, Switch, Toast } from "@/components/kit";
import StatusIcon from "@/components/StatusIcon";
import { useLang } from "@/components/AppProviders";
import {
  ABOUT_MAX, BEST_AT, LANGUAGES, askUpdate, byState, cleanAbout, decidePhoto, listProfiles, profileState, removePhoto, saveProfile, saveProfileSettings,
  staffPhotoUrl, TILE, tint, toggle, type ProfileState, type StaffProfile, type TeamList,
} from "@/lib/staffProfile";
import SettingsShell, { type Access } from "../SettingsShell";

export default function TechProfilesPage() {
  const { lang } = useLang();
  return <SettingsShell title={lang === "vi" ? "Hồ sơ thợ" : "Tech profiles"}>{(a) => <Body a={a} />}</SettingsShell>;
}

type Filter = "all" | ProfileState;

function Body({ a }: { a: Access }) {
  const { lang } = useLang();
  const T = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [data, setData] = useState<TeamList | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 2400); };
  const reload = useCallback(() => listProfiles(a.salonId).then(setData).catch((e: Error) => setErr(e.message)), [a.salonId]);
  useEffect(() => { void reload(); }, [reload]);

  if (!data) return <div className="card pad" aria-busy="true">{err || T("Loading…", "Đang tải…")}</div>;
  const people = [...data.people].sort(byState);
  const count = (s: ProfileState) => people.filter((p) => profileState(p) === s).length;
  const shown = filter === "all" ? people : people.filter((p) => profileState(p) === filter);
  const WORD: Record<ProfileState, string> = { waiting: T("Needs your OK", "Cần bạn duyệt"), live: T("Live", "Đang hiện"), asked: T("Asked", "Đã nhờ"), none: T("Not started", "Chưa làm") };
  const TONE = { waiting: "watch", live: "good", asked: "none", none: "none" } as const;
  const notStarted = people.filter((p) => profileState(p) === "none");

  const setSwitch = async (s: { profilesOn?: boolean; photoOk?: boolean }) => {
    try { const v = await saveProfileSettings(a.salonId, s); setData({ ...data, ...v }); say(T("Saved", "Đã lưu")); } catch (e) { setErr((e as Error).message); }
  };
  const ask = async (ids: string[]) => {
    try { for (const id of ids) await askUpdate(a.salonId, id); await reload(); say(T("Asked. They see it in their app.", "Đã nhờ. Họ thấy trong ứng dụng.")); } catch (e) { setErr((e as Error).message); }
  };
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", { month: "short", day: "numeric" }) : "");
  const person = people.find((p) => p.membershipId === open) ?? null;

  return (
    <div className="si-page tpo-page" data-testid="tech-profiles">
      {a.demo && <div className="demo">{T("Test version: saved on this device only.", "Bản thử: chỉ lưu trên máy này.")}</div>}
      <p className="cap tpo-lead">{T("What clients see on your booking page. Techs fill in their own; you can edit any of them.", "Khách thấy trên trang đặt lịch. Thợ tự điền; bạn sửa được hồ sơ của ai cũng được.")}</p>
      {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}

      <ListGroup>
        <Row size="l" title={T("Show profiles on my booking page", "Hiện hồ sơ trên trang đặt lịch")} sub={T("Off = clients only see first names", "Tắt = khách chỉ thấy tên")}
          right={<Switch label={T("Show profiles on my booking page", "Hiện hồ sơ trên trang đặt lịch")} on={data.profilesOn} onChange={(v) => void setSwitch({ profilesOn: v })} />} />
        <Row size="l" title={T("New photos need my OK", "Ảnh mới cần tôi duyệt")} sub={T("Until then, only the tech sees them", "Trước đó, chỉ thợ thấy")}
          right={<Switch label={T("New photos need my OK", "Ảnh mới cần tôi duyệt")} on={data.photoOk} onChange={(v) => void setSwitch({ photoOk: v })} />} />
      </ListGroup>

      <div className="tpo-filters">
        <Chip on={filter === "all"} onClick={() => setFilter("all")}>{T("All", "Tất cả")} {people.length}</Chip>
        {(["waiting", "none", "live"] as const).map((s) => count(s) > 0 && <Chip key={s} on={filter === s} onClick={() => setFilter(s)}>{WORD[s]} {count(s)}</Chip>)}
        <span className="tpo-grow" />
        {notStarted.length > 1 && <Button size="sm" onClick={() => void ask(notStarted.map((p) => p.membershipId))}>{T("Ask everyone not started", "Nhờ tất cả người chưa làm")}</Button>}
      </div>

      {people.length === 0 ? <p className="cap">{T("No techs yet. Add them in Team.", "Chưa có thợ. Thêm trong mục Nhân viên.")}</p> : (
        <ListGroup>
          {shown.map((p) => {
            const st = profileState(p);
            const i = people.indexOf(p);
            const url = staffPhotoUrl(p.photo);
            const waiting = p.photos.filter((f) => f.status === "waiting").length;
            const last = st === "waiting" ? T(`${waiting} new photo${waiting > 1 ? "s" : ""}`, `${waiting} ảnh mới`)
              : p.updatedAt ? `${p.updatedBy ?? ""} · ${when(p.updatedAt)}` : st === "asked" ? T("Not started yet", "Chưa bắt đầu") : "—";
            return (
              <div key={p.membershipId} className="row l tpo-row" data-testid="tpo-row">
                <span className="tp-face" aria-hidden="true" style={url ? { width: 36, height: 36, backgroundImage: `url(${url})` } : { width: 36, height: 36, background: tint(i), fontSize: 14 }}>{url ? "" : p.name.slice(0, 1)}</span>
                <span className="g"><b>{p.name}</b><span className="cap">{last}</span></span>
                <span className="tpo-st"><StatusIcon tone={TONE[st]} />{st === "asked" && p.askedAt ? `${WORD.asked} ${when(p.askedAt)}` : WORD[st]}</span>
                {st === "waiting" ? <Button size="sm" variant="primary" data-testid="tpo-review" onClick={() => setOpen(p.membershipId)}>{T("Review", "Duyệt")}</Button>
                  : st === "none" ? <span className="tpo-acts">
                      <Button size="sm" data-testid="tpo-ask" onClick={() => void ask([p.membershipId])}>{T("Ask to update", "Nhờ cập nhật")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpen(p.membershipId)}>{T("Fill in", "Điền giúp")}</Button></span>
                  : <Button size="sm" data-testid="tpo-edit" onClick={() => setOpen(p.membershipId)}>{T("Edit", "Sửa")}</Button>}
              </div>
            );
          })}
        </ListGroup>
      )}

      {person && <PersonDrawer a={a} p={person} T={T} onClose={() => setOpen(null)} onDone={async (s) => { await reload(); if (s) say(s); }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function PersonDrawer({ a, p, T, onClose, onDone }: {
  a: Access; p: StaffProfile; T: (en: string, vi: string) => string; onClose: () => void; onDone: (toast?: string) => Promise<void>;
}) {
  const [about, setAbout] = useState(p.about);
  const [bestAt, setBestAt] = useState(p.bestAt);
  const [langs, setLangs] = useState(p.languages);
  const [years, setYears] = useState(p.years ? String(p.years) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const waiting = p.photos.filter((f) => f.status === "waiting");
  const shown = p.photos.filter((f) => f.status === "shown");
  const dirty = cleanAbout(about) !== p.about || bestAt.join() !== p.bestAt.join() || langs.join() !== p.languages.join() || (years ? +years : null) !== p.years;

  const run = async (fn: () => Promise<unknown>, toast?: string) => {
    setBusy(true); setErr("");
    try { await fn(); await onDone(toast); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const tile = (f: StaffProfile["photos"][number], i: number) => {
    const url = staffPhotoUrl(f.path);
    return <figure className="tp-tile tpo-big" style={url ? { backgroundImage: `url(${url})` } : { background: TILE[i % TILE.length] }}>{f.label && <figcaption>{f.label}</figcaption>}</figure>;
  };

  return (
    <Drawer title={p.name} onClose={onClose}
      footer={<Button variant="primary" block disabled={!dirty || busy} data-testid="tpo-save"
        onClick={() => void run(() => saveProfile(a.salonId, p.membershipId, { about, bestAt, languages: langs, years: years ? Math.min(60, +years) : null, photo: p.photo }), T("Saved. Clients see it now.", "Đã lưu. Khách thấy ngay."))}>{T("Save", "Lưu")}</Button>}>
      <div className="tpo-drawer" data-testid="tpo-drawer">
        {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}
        {waiting.length > 0 && <section className="tpo-sec">
          <span className="eyebrow">{T(`${waiting.length} new work photo${waiting.length > 1 ? "s" : ""}`, `${waiting.length} ảnh mới`)}</span>
          <div className="tpo-grid2">{waiting.map((f, i) => (
            <div key={f.id} className="tpo-pick">
              {tile(f, i)}
              <div className="tpo-two">
                <Button size="sm" data-testid="tpo-show" disabled={busy} onClick={() => void run(() => decidePhoto(a.salonId, p.membershipId, f.id, true), T("Shown to clients", "Đã hiện cho khách"))}>{T("Show", "Hiện")}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => decidePhoto(a.salonId, p.membershipId, f.id, false), T("Hidden", "Đã ẩn"))}>{T("Hide", "Ẩn")}</Button>
              </div>
            </div>))}
          </div>
          {waiting.length > 1 && <Button variant="primary" disabled={busy} onClick={() => void run(async () => { for (const f of waiting) await decidePhoto(a.salonId, p.membershipId, f.id, true); }, T("Shown to clients", "Đã hiện cho khách"))}>{T(`Show all ${waiting.length}`, `Hiện cả ${waiting.length}`)}</Button>}
        </section>}

        <section className="tpo-sec">
          <label className="lbl" htmlFor="tpo-about">{T("About", "Giới thiệu")} <span className="tp-count">· {about.trim().length} / {ABOUT_MAX}</span></label>
          <textarea id="tpo-about" className="inp tp-area" maxLength={ABOUT_MAX} rows={3} value={about} onChange={(e) => setAbout(e.target.value)} />
          <span className="lbl">{T("Best at", "Giỏi nhất")}</span>
          <div className="tp-chips">{BEST_AT.map((s) => <Chip key={s} on={bestAt.includes(s)} aria-pressed={bestAt.includes(s)} onClick={() => setBestAt(toggle(bestAt, s))}>{s}</Chip>)}</div>
          <span className="lbl">{T("Speaks", "Nói")}</span>
          <div className="tp-chips">{LANGUAGES.map((s) => <Chip key={s} on={langs.includes(s)} aria-pressed={langs.includes(s)} onClick={() => setLangs(toggle(langs, s))}>{s}</Chip>)}</div>
          <label className="lbl" htmlFor="tpo-years">{T("Years doing nails", "Số năm làm nail")}</label>
          <input id="tpo-years" className="inp tp-years" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </section>

        {shown.length > 0 && <section className="tpo-sec">
          <span className="eyebrow">{T("Shown to clients", "Đang hiện cho khách")} · {shown.length}</span>
          <div className="tp-grid4">{shown.map((f, i) => (
            <div key={f.id} className="tpo-pick">{tile(f, i)}
              <button type="button" className="tpo-link" onClick={() => void run(() => removePhoto(a.salonId, p.membershipId, f.id), T("Removed", "Đã xoá"))}>{T("Remove", "Xoá")}</button>
            </div>))}
          </div>
        </section>}
        <p className="cap">{T("Words show right away. Names come from Team; clients see first names only.", "Chữ hiện ngay. Tên lấy từ mục Nhân viên; khách chỉ thấy tên.")}</p>
      </div>
    </Drawer>
  );
}
