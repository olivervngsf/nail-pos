"use client";
// Owner / manager: the salon's booking page. Booking board PageSettings P1–P3: link + on/off, photos (first = cover),
// where clients book (Google later, website button, bio link, QR poster, texts, kiosk), rules, services shown online,
// bookings by source (last 30 days, from the calendar).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { Button, Chip, Segmented, Stepper, Switch, Toast } from "@/components/kit";
import SettingsShell from "../SettingsShell";
import { rpc } from "@/lib/auth";
import { useDesk, type Desk } from "@/lib/desk";
import { getSupabase } from "@/lib/supabase/client";
import { DEMO_SLUG, loadPage, photoUrl, type PageRules } from "@/lib/booking/page";
import { pullAppts, useAppts } from "@/lib/booking/appts";
import { addDays, at, dayKey } from "@/lib/booking/grid";
import { AMENITIES, DEMO_AMENITIES, amenityIcon, cleanAmenities, toggleAmenity, type AmenityKey } from "@/lib/booking/amenities";

type Photo = { id: string; path: string; label: string; url?: string };
type Conf = { slug: string; settings: PageRules; photos: Photo[]; services: { id: string; cat: string; name: string; online: boolean }[] };
const DEMO_KEY = "nailpos.demoBookPage.v1";
const RULES: PageRules = { on: true, days_ahead: 30, latest_before_close: 60, group_max: 6, cancel_hours: 2, min_notice: 30 };
const NOTE_MAX = 500;
const Ico = ({ d, label }: { d: React.ReactNode; label?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
    {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>{d}</svg>);
const Lock = () => <Ico d={<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>} />;
const Pencil = () => <Ico d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} />;
const Bell = () => <Ico d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>} />;
const Pin = () => <Ico d={<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>} />;
const LinkIco = () => <Ico d={<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>} />;
const ALARMS = [0, 30, 60, 120, 1440] as const;
const PH = ["#C9A79A", "#B07C8E", "#8C9C88", "#D7B88F", "#6E7A8C"];

export default function BookingPageSettings() {
  const t = useTranslations("bookSettings");
  // Inside the Settings window (Oliver, Nov 27: Settings never jumps to a full page). The window checks owner/manager.
  return <SettingsShell title={t("title")}>{() => <Loader />}</SettingsShell>;
}

function Loader() {
  const { desk, err } = useDesk();
  if (err) return <p className="hint err">{err}</p>;
  if (!desk) return <div aria-busy="true" />;
  return <Settings desk={desk} />;
}

function demoConf(desk: Desk): Conf {
  try { const c = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); if (c) return c; } catch { /* */ }
  return { slug: DEMO_SLUG, settings: { ...RULES, amenities: DEMO_AMENITIES }, services: desk.services.map((s) => ({ id: s.id, cat: s.cat, name: s.name, online: true })),
    photos: ["Salon", "Gel art", "Pedi chairs", "Nail art"].map((label, i) => ({ id: `demo-${i}`, path: `demo:${i}`, label })) };
}

function Settings({ desk }: { desk: Desk }) {
  const t = useTranslations("bookSettings");
  const tc = useTranslations("calendar");
  const ta = useTranslations("amenities");
  const demo = desk.mode === "demo";
  const [conf, setConf] = useState<Conf | null>(null);
  const [slug, setSlug] = useState("");
  const [rules, setRules] = useState<PageRules>(RULES);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  // Salon address + phone for the calendar preview (same data the booking page shows).
  const [info, setInfo] = useState<{ address: string | null; phone: string | null } | null>(null);
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 2500); };

  const load = useCallback(async () => {
    if (demo) { const c = demoConf(desk); setConf(c); setSlug(c.slug); setRules({ ...RULES, ...c.settings }); return; }
    const c = await rpc<Conf | null>("booking_settings_get", { p_salon: desk.salonId });
    if (!c) return;
    setConf(c); setSlug(c.slug); setRules({ ...RULES, ...c.settings });
  }, [demo, desk]);
  useEffect(() => { void load().catch((e) => setMsg((e as Error).message)); }, [load]); // the Settings window only lets an owner or manager in
  useEffect(() => { if (conf?.slug) void loadPage(demo ? DEMO_SLUG : conf.slug).then((p) => p && setInfo({ address: p.salon.address, phone: p.salon.phone })).catch(() => {}); }, [conf?.slug, demo]);
  const saveDemo = (c: Conf) => { setConf(c); try { localStorage.setItem(DEMO_KEY, JSON.stringify(c)); } catch { /* */ } };

  // Bookings by source, last 30 days (from the calendar).
  const from = useMemo(() => at(dayKey(addDays(new Date(), -30)), 0), []), to = useMemo(() => at(dayKey(addDays(new Date(), 31)), 0), []);
  const appts = useAppts(desk.salonId, from, to);
  useEffect(() => { void pullAppts(desk.salonId, from, to).catch(() => {}); }, [desk.salonId, from, to]);
  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appts) if (a.status !== "canceled") m.set(a.source, (m.get(a.source) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [appts]);
  const maxN = Math.max(1, ...bySource.map(([, n]) => n));

  const origin = typeof window === "undefined" ? "https://polishosapp.com" : window.location.origin;
  const url = (src?: string) => `${origin}/${conf?.slug ?? slug}${src ? `?src=${src}` : ""}`;
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); say(t("copied")); } catch { setMsg(text); } };

  const save = async (patch: Partial<PageRules> & { slug?: string }) => {
    setMsg("");
    if (patch.slug !== undefined && !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(patch.slug)) { setMsg(t("slugBad")); return; }
    if (demo) { if (conf) saveDemo({ ...conf, slug: patch.slug ?? conf.slug, settings: { ...conf.settings, ...patch } }); say(t("saved")); return; }
    try {
      const r = await rpc<{ ok: boolean; reason?: string; slug?: string }>("booking_settings_save", { p_salon: desk.salonId, p: patch });
      if (!r.ok) { setMsg(t(r.reason === "slug_bad" ? "slugBad" : "slugTaken")); return; }
      await load(); say(t("saved"));
    } catch { setMsg(t("failed")); }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files || !conf) return;
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      if (demo) { saveDemo({ ...conf, photos: [...conf.photos, { id, path: `demo:${id}`, label: t("newPhoto"), url: c.toDataURL("image/jpeg", 0.6) }] }); continue; }
      try {
        const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("photo"))), "image/jpeg", 0.85));
        const path = `${desk.salonId}/${id}.jpg`;
        const { error } = await getSupabase()!.storage.from("salon-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw new Error(error.message);
        await rpc("salon_photo_add", { p_id: id, p_salon: desk.salonId, p_path: path, p_label: "" });
      } catch { setMsg(t("failed")); }
    }
    if (!demo) await load();
  };
  const photoAct = async (p: Photo, act: "cover" | "remove") => {
    if (!conf) return;
    if (demo) {
      const rest = conf.photos.filter((x) => x.id !== p.id);
      saveDemo({ ...conf, photos: act === "cover" ? [p, ...rest] : rest });
      return;
    }
    try { await rpc(act === "cover" ? "salon_photo_cover" : "salon_photo_remove", { p_id: p.id }); await load(); } catch { setMsg(t("failed")); }
  };
  const setOnline = async (id: string, on: boolean) => {
    if (!conf) return;
    const next = { ...conf, services: conf.services.map((s) => (s.id === id ? { ...s, online: on } : s)) };
    if (demo) { saveDemo(next); return; }
    setConf(next);
    try { await rpc("service_online", { p_service: id, p_online: on }); } catch { setMsg(t("failed")); await load(); }
  };
  const poster = async () => {
    const qr = await QRCode.toDataURL(url("qr"), { width: 600, margin: 1 });
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><title>${desk.salonName}</title><body style="font-family:Inter,system-ui,sans-serif;text-align:center;padding:48px">
      <h1 style="font-size:44px;margin:0">${desk.salonName}</h1><p style="font-size:28px;margin:12px 0 24px">${t("posterTitle")}</p>
      <img src="${qr}" width="420" height="420" alt=""><p style="font-size:22px;color:#555">${t("posterSub")}</p><p style="font-size:18px">${url()}</p>
      <script>onload=()=>print()</script></body>`);
    w.document.close();
  };

  const on = rules.on !== false;
  const note = rules.calendar_note ?? "";
  const amen: AmenityKey[] = cleanAmenities(rules.amenities);
  const amenChanged = amen.join() !== cleanAmenities(conf?.settings.amenities).join();
  const alarm = rules.calendar_alarm_min ?? 60;
  const alarmLabel = (m: number) => (m >= 1440 ? t("alarmDay") : m >= 60 ? t("alarmHr", { n: m / 60 }) : t("alarmMin", { n: m }));
  return (
    <>
        {demo && <div className="demo">{t("demo")}</div>}
        {!conf ? <div aria-busy="true">{msg && <p className="hint err">{msg}</p>}</div> : (
        <div className="bp">
          <div className="bw-row"><span className="bw-grow" /><a className="btn sm" href={url()} target="_blank" rel="noreferrer" data-testid="bp-preview">{t("preview")} ↗</a></div>
          {msg && <p className="hint err" role="alert">{msg}</p>}
          <section className="card pad bp-sec">
            <div className="bw-row"><span className={`tag${on ? " jade" : ""}`} data-testid="bp-state">{on ? t("live", { url: url().replace(/^https?:\/\//, "") }) : t("off")}</span>
              <span className="bw-grow" /><span className="cap">{t("pageOn")}</span><Switch label={t("pageOn")} on={on} onChange={(v) => { setRules({ ...rules, on: v }); void save({ on: v }); }} /></div>
            <label className="cap" htmlFor="bp-slug">{t("link")}</label>
            <div className="bw-row">
              <span className="cap">{origin.replace(/^https?:\/\//, "")}/</span>
              <input id="bp-slug" className="inp bp-slug" value={slug} disabled={demo} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
              <Button disabled={demo || slug === conf.slug} onClick={() => void save({ slug })}>{t("save")}</Button>
              <Button onClick={() => void copy(url())}>{t("copyLink")}</Button>
            </div>
          </section>

          <section className="card pad bp-sec">
            <div className="bw-row"><h2 className="h2 bw-grow">{t("photos")}</h2><span className="cap">{t("photosSub")}</span></div>
            <div className="bp-photos">
              {conf.photos.map((p, i) => {
                const src = p.url ?? photoUrl(p.path);
                return (
                  <figure key={p.id} className="bp-ph" style={src ? { backgroundImage: `url(${src})` } : { background: PH[i % PH.length] }}>
                    {i === 0 && <span className="tag bp-cover">{t("cover")}</span>}
                    <figcaption>{p.label}</figcaption>
                    <div className="bp-acts">
                      {i > 0 && <button type="button" className="btn sm" onClick={() => void photoAct(p, "cover")}>{t("makeCover")}</button>}
                      <button type="button" className="btn sm" onClick={() => void photoAct(p, "remove")}>{t("remove")}</button>
                    </div>
                  </figure>
                );
              })}
              <label className="bp-add"><input type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />{t("addPhotos")}</label>
            </div>
            <p className="cap">{t("photoTip")}</p>
          </section>

          {/* Amenities: free comforts the salon offers; shown on the booking page + receipt. One tap = on/off, Save once. */}
          <section className="card pad bp-sec" data-testid="bp-amenities">
            <div className="bw-row"><h2 className="h2 bw-grow">{ta("title")}</h2><span className="cap">{ta("sub")}</span></div>
            <div className="bp-amen" role="group" aria-label={ta("title")}>
              {AMENITIES.map((a) => {
                const on = amen.includes(a.key);
                return <Chip key={a.key} on={on} aria-pressed={on} data-testid={`amen-${a.key}`} onClick={() => setRules({ ...rules, amenities: toggleAmenity(amen, a.key) })}>
                  <span aria-hidden="true">{amenityIcon(a.key)}</span>{ta(a.key)}</Chip>;
              })}
            </div>
            <div className="bw-row">
              <span className="cap bw-grow">{amenChanged ? "" : amen.length ? "" : ta("none")}</span>
              <Button variant="primary" data-testid="bp-save-amen" disabled={!amenChanged} onClick={() => void save({ amenities: amen })}>{t("save")}</Button>
            </div>
          </section>

          <div className="bp-two">
            <section className="card pad bp-sec">
              <h2 className="h2">{t("where")}</h2>
              <div className="group">
                <div className="opt"><span className="bp-ico">G</span><span className="bw-grow"><b>{t("google")}</b><span className="cap">{t("googleSub")}</span></span><span className="tag">{t("notConnected")}</span></div>
                <div className="opt"><span className="bp-ico">www</span><span className="bw-grow"><b>{t("website")}</b><span className="cap">{t("websiteSub")}</span></span>
                  <button type="button" className="btn sm" onClick={() => void copy(`<a href="${url("website")}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:#1C1C1E;color:#fff;font:600 16px system-ui;text-decoration:none">Book now</a>`)}>{t("copyCode")}</button></div>
                <div className="opt"><span className="bp-ico">IG</span><span className="bw-grow"><b>{t("social")}</b><span className="cap">{t("socialSub")}</span></span>
                  <button type="button" className="btn sm" data-testid="bp-copy-ig" onClick={() => void copy(url("instagram"))}>{t("copyLink")}</button></div>
                <div className="opt"><span className="bp-ico">QR</span><span className="bw-grow"><b>{t("qr")}</b><span className="cap">{t("qrSub")}</span></span>
                  <button type="button" className="btn sm" onClick={() => void poster()}>{t("printPoster")}</button></div>
                <div className="opt"><span className="bp-ico">✉</span><span className="bw-grow"><b>{t("texts")}</b><span className="cap">{t("textsSub")}</span></span><span className="tag jade">{t("on")}</span></div>
                <div className="opt"><span className="bp-ico">⌂</span><span className="bw-grow"><b>{t("kiosk")}</b><span className="cap">{t("kioskSub")}</span></span>
                  <Link className="btn sm" href="/kiosk">{t("openKiosk")}</Link></div>
              </div>
              <p className="cap">{t("googleLater")}</p>
            </section>

            <section className="card pad bp-sec">
              <h2 className="h2" id="bp-rules">{t("rules")}</h2>
              <div className="group">
                <div className="opt"><span className="bw-grow">{t("daysAhead")}</span><Stepper label={t("daysAhead")} value={rules.days_ahead} min={1} max={90} step={1} format={(n) => t("daysN", { n })} onChange={(v) => setRules({ ...rules, days_ahead: v })} /></div>
                <div className="opt"><span className="bw-grow">{t("latest")}</span><Stepper label={t("latest")} value={rules.latest_before_close} min={0} max={240} step={15} format={(n) => t("beforeClose", { n })} onChange={(v) => setRules({ ...rules, latest_before_close: v })} /></div>
                <div className="opt"><span className="bw-grow">{t("groups")}</span><Stepper label={t("groups")} value={rules.group_max} min={1} max={6} format={(n) => t("upTo", { n })} onChange={(v) => setRules({ ...rules, group_max: v })} /></div>
                <div className="opt"><span className="bw-grow">{t("cancel")}</span><Stepper label={t("cancel")} value={rules.cancel_hours} min={0} max={48} format={(n) => t("hoursBefore", { n })} onChange={(v) => setRules({ ...rules, cancel_hours: v })} /></div>
                <div className="opt"><span className="bw-grow">{t("card")}</span><span className="cap">{t("cardOff")}</span></div>
              </div>
              <Button variant="primary" data-testid="bp-save-rules" onClick={() => void save({ days_ahead: rules.days_ahead, latest_before_close: rules.latest_before_close, group_max: rules.group_max, cancel_hours: rules.cancel_hours })}>{t("save")}</Button>
            </section>
          </div>

          <section className="card pad bp-sec" data-testid="bp-cal">
            <div>
              <h2 className="h2">{t("calTitle")}</h2>
              <p className="cap">{t("calSub")}</p>
            </div>
            <div className="bp-two bp-cal-grid">
              <div className="bp-sec">
                <span className="eyebrow bp-mine"><Pencil />{t("calMine")}</span>
                <div className="bp-field">
                  <label htmlFor="bp-cal-note" className="bp-lbl">{t("calNoteLabel")}</label>
                  <textarea id="bp-cal-note" className="inp bp-note" data-testid="bp-cal-note" rows={4} maxLength={NOTE_MAX}
                    placeholder={t("calPh")} value={note} onChange={(e) => setRules({ ...rules, calendar_note: e.target.value })} />
                  <div className="bp-ideas">
                    <span className="cap">{t("calAdd")}</span>
                    {(["calIdeaPark", "calIdeaEarly", "calIdeaLate", "calIdeaGel"] as const).map((k) => (
                      <Chip key={k} disabled={note.includes(t(k).trim())} onClick={() => setRules({ ...rules, calendar_note: `${note.trim() ? `${note.trimEnd()}\n` : ""}${t(k)}`.slice(0, NOTE_MAX) })}>+ {t(k).replace(/:\s*$/, "")}</Chip>))}
                    <span className="cap bp-left">{t("calLeft", { n: NOTE_MAX - note.length })}</span>
                  </div>
                </div>
                <div className="bp-field" data-testid="bp-alarm">
                  <span className="bp-lbl">{t("alarm")}</span>
                  <Segmented label={t("alarm")} value={String(alarm)} onChange={(v) => setRules({ ...rules, calendar_alarm_min: Number(v) })}
                    options={ALARMS.map((m) => ({ value: String(m), label: t(`seg${m}` as "seg0") }))} />
                </div>
                <div className="bp-row bp-foot">
                  <span className="cap">{t("calSaveHint")}</span>
                  <Button variant="primary" data-testid="bp-save-cal" onClick={() => void save({ calendar_note: note.trim(), calendar_alarm_min: alarm })}>{t("save")}</Button>
                </div>
              </div>

              <div className="bp-sec">
                <div className="bp-row">
                  <span className="eyebrow">{t("calPreview")}</span>
                  <span className="bp-legend"><span><Lock />{t("calAuto")}</span><span className="bp-mine"><Pencil />{t("calMine")}</span></span>
                </div>
                <div className="bp-ev" aria-label={t("calPreview")}>
                  <div className="bp-ev-head">
                    <i />
                    <div><b>{desk.salonName} – Gel manicure</b><span>Tue, Nov 17 · 11:00 – 11:50 AM</span></div>
                    <Lock />
                  </div>
                  <div className="bp-ev-row mine" data-testid="bp-alarm-preview"><Bell />{alarm ? t("alarmAt", { when: alarmLabel(alarm) }) : t("alarmNone")}<Pencil /></div>
                  <div className="bp-ev-row"><Pin />{[desk.salonName, info?.address].filter(Boolean).join(", ")}<Lock /></div>
                  <div className="bp-ev-row"><LinkIco />{url().replace(/^https?:\/\//, "")}<Lock /></div>
                  <div className="bp-ev-notes">
                    <span className="eyebrow">{t("calNotes")}</span>
                    <span className="bp-ev-auto">{t("calAutoNote", { hours: rules.cancel_hours, phone: info?.phone ?? "" })}</span>
                    {note.trim() ? <span className="bp-ev-own" data-testid="bp-cal-preview">{note.trim()}</span> : <span className="bp-ev-own empty">{t("calNoteEmpty")}</span>}
                  </div>
                </div>
                <p className="cap">{t.rich("calFrom", { rules: (c) => <a href="#bp-rules">{c}</a> })}</p>
              </div>
            </div>
          </section>

          <div className="bp-two">
            <section className="card pad bp-sec">
              <h2 className="h2">{t("online")}</h2>
              <p className="cap">{t("onlineSub")}</p>
              <div className="group bp-svcs">
                {conf.services.map((s) => <div key={s.id} className="opt"><span className="bw-grow"><b>{s.name}</b><span className="cap">{s.cat}</span></span><Switch label={s.name} on={s.online} onChange={(v) => void setOnline(s.id, v)} /></div>)}
              </div>
            </section>
            <section className="card pad bp-sec">
              <h2 className="h2">{t("bySource")}</h2>
              {bySource.length === 0 ? <p className="cap">{t("none")}</p> : bySource.map(([src, n]) => (
                <div key={src} className="bp-bar" data-testid="bp-source"><span>{tc(`src_${src}` as "src_web")}</span><span className="bp-track"><i style={{ width: `${(n / maxN) * 100}%` }} /></span><b className="num">{n}</b></div>))}
            </section>
          </div>
        </div>)}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
