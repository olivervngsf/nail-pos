"use client";
// Public booking page (polishosapp.com/<salon>). Booking board BookWeb W1–W8: door (me / group), services, nail tech,
// time (only times where every service fits), details (phone first, welcome back, texts consent, note), done.
// No account, no app. Where the client came from (?src=google|website|instagram|qr|text) stays on the booking.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { e164 } from "@/lib/auth";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { DEMO_SLUG, book, bookDays, hello, hoursOn, loadPage, loadSlots, photoUrl, sourceOf, type BookPage as Page, type Guest } from "@/lib/booking/page";
import { dayKey, fmtMin, fromDayKey } from "@/lib/booking/grid";
import { bookingIcs } from "@/lib/booking/ics";

type View = "door" | "services" | "staff" | "time" | "details" | "done";
const ORDER: View[] = ["services", "staff", "time", "details"];
const PH = ["#C9A79A", "#B07C8E", "#8C9C88", "#D7B88F", "#6E7A8C"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function BookPage({ slug }: { slug: string }) {
  const t = useTranslations("book");
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => { loadPage(slug).then(setPage).catch((e) => { setErr((e as Error).message); setPage(null); }); }, [slug]);
  if (page === undefined) return <div className="bw" aria-busy="true" />;
  if (!page) return <div className="bw"><div className="bw-empty"><div className="h2">{t("notFound")}</div>{err && <p className="cap">{err}</p>}</div></div>;
  if (page.salon.settings.on === false) return <div className="bw"><Header page={page} /><div className="bw-empty"><div className="h2">{t("pageOff")}</div></div></div>;
  return <Flow page={page} />;
}

export function Header({ page }: { page: Page }) {
  const t = useTranslations("book");
  const today = hoursOn(page, dayKey(new Date()));
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const open = today && now >= today.open && now < today.close;
  const [viewing, setViewing] = useState<number | null>(null);
  const map = page.salon.address ? `https://maps.google.com/?q=${encodeURIComponent(`${page.salon.name}, ${page.salon.address}`)}` : null;
  return (
    <header className="bw-hdr">
      <div className="bw-logo">{initials(page.salon.name)}</div>
      <div className="bw-who">
        <h1 className="bw-name">{page.salon.name}</h1>
        <div className="cap">{[page.salon.address, page.salon.phone && fmtPhone(page.salon.phone)].filter(Boolean).join(" · ")}</div>
        <div className="cap">
          {open ? <b className="bw-open">{t("openNow")}</b> : <b>{t("closedNow")}</b>}
          {today && (open ? <> · {t("until", { time: fmtMin(today.close) })}</> : now < today.open ? <> · {t("opens", { time: fmtMin(today.open) })}</> : null)}
          {map && <> · <a href={map} target="_blank" rel="noreferrer">{t("directions")}</a></>}
        </div>
      </div>
      {page.photos.length > 0 && (
        <div className="bw-photos" aria-label={t("photos")}>
          {page.photos.slice(0, 4).map((p, i) => {
            const url = photoUrl(p.path);
            return <button type="button" key={p.path} className="bw-ph" data-testid="bw-photo" aria-label={t("photoOpen", { label: p.label || i + 1 })} onClick={() => setViewing(i)}
              style={url ? { backgroundImage: `url(${url})` } : { background: PH[i % PH.length] }}>{p.label}</button>;
          })}
          {page.photos.length > 4 && <button type="button" className="bw-ph" style={{ background: PH[4] }} onClick={() => setViewing(4)}>+ {page.photos.length - 4}</button>}
        </div>
      )}
      {viewing !== null && <PhotoViewer photos={page.photos} start={viewing} onClose={() => setViewing(null)} />}
    </header>
  );
}

/** Full-size salon photos: tap a photo → big view; arrows, swipe, keys (← → Esc); tap outside to close. */
function PhotoViewer({ photos, start, onClose }: { photos: Page["photos"]; start: number; onClose: () => void }) {
  const t = useTranslations("book");
  const [i, setI] = useState(start);
  const n = photos.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  const [x0, setX0] = useState<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", k);
    const o = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; };
  }, [go, onClose]);
  const p = photos[i], url = photoUrl(p.path);
  return (
    <div className="bw-lb" role="dialog" aria-modal="true" aria-label={t("photos")} data-testid="bw-viewer" onClick={onClose}
      onTouchStart={(e) => setX0(e.touches[0].clientX)} onTouchEnd={(e) => { if (x0 !== null) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); } setX0(null); }}>
      <button type="button" className="bw-lb-x" aria-label={t("photoClose")} autoFocus onClick={onClose}>✕</button>
      <figure className="bw-lb-fig" onClick={(e) => e.stopPropagation()}>
        {/* Plain img: full-size Storage photo, shown on demand only. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={p.label} /> : <div className="bw-lb-ph" style={{ background: PH[i % PH.length] }} />}
        <figcaption>{p.label && <b>{p.label}</b>}<span className="cap">{i + 1} / {n}</span></figcaption>
      </figure>
      {n > 1 && <>
        <button type="button" className="bw-lb-nav prev" aria-label={t("photoPrev")} onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
        <button type="button" className="bw-lb-nav next" aria-label={t("photoNext")} onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
      </>}
    </div>
  );
}

function Flow({ page }: { page: Page }) {
  const t = useTranslations("book");
  const sp = useSearchParams();
  const src = sourceOf(sp.get("src"));
  const max = page.salon.settings.group_max;
  const [view, setView] = useState<View>("door");
  const [group, setGroup] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([{ serviceIds: [] }]);
  const [gi, setGi] = useState(0);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const days = useMemo(() => bookDays(page), [page]);
  const [day, setDay] = useState(days[0] ?? dayKey(new Date()));
  const [slots, setSlots] = useState<number[] | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [back, setBack] = useState<string | null>(null);
  const [textsOk, setTextsOk] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<{ staff: string[]; day: string; start: number; token?: string } | null>(null);

  const svc = useMemo(() => Object.fromEntries(page.services.map((s) => [s.id, s])), [page]);
  const minsOf = useCallback((g: Guest) => g.serviceIds.reduce((a, id) => a + (svc[id]?.minutes ?? 0), 0), [svc]);
  const cats = useMemo(() => [...new Set(page.services.map((s) => s.cat))], [page]);
  const g = guests[gi] ?? guests[0];
  const items = guests.flatMap((x, i) => x.serviceIds.map((id) => ({ gi: i, s: svc[id] })).filter((x) => x.s));
  const total = items.reduce((a, x) => a + x.s.cents, 0);
  const hasFrom = items.some((x) => x.s.from);
  const longest = Math.max(0, ...guests.map(minsOf));
  const guestLabel = (i: number) => (i === 0 ? t("me") : guests[i].name || t("guestN", { n: i + 1 }));
  const dur = (m: number) => (m < 60 ? t("min", { n: m }) : m % 60 ? t("hrMin", { h: Math.floor(m / 60), m: m % 60 }) : t("hr", { h: m / 60 }));
  const setG = (patch: Partial<Guest>) => setGuests((all) => all.map((x, i) => (i === gi ? { ...x, ...patch } : x)));

  // Free times for the picked day (re-checked by the server when booking).
  const key = JSON.stringify(guests.map((x) => [x.staffId ?? null, minsOf(x)]));
  useEffect(() => {
    if (view !== "time") return;
    let off = false;
    setSlots(null);
    loadSlots(page, day, guests.map((x) => ({ staffId: x.staffId, minutes: minsOf(x) })))
      .then((s) => { if (!off) setSlots(s); })
      .catch(() => { if (!off) { setSlots([]); setMsg(t("offline")); } });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, day, key, page]);

  // Returning client: first name once the phone is complete.
  useEffect(() => {
    if (!phoneOk(phone)) { setBack(null); return; }
    let off = false;
    void hello(page.salon.slug, e164(phone)).then((f) => { if (off || !f) return; setBack(f); setName((n) => n || f); });
    return () => { off = true; };
  }, [phone, page]);

  const idx = ORDER.indexOf(view);
  const canNext = view === "services" ? guests.every((x) => x.serviceIds.length > 0) : view === "time" ? slot !== null : view === "details" ? phoneOk(phone) && name.trim() !== "" : true;
  const next = async () => {
    setMsg("");
    if (view !== "details") { setView(ORDER[idx + 1]); return; }
    if (slot === null) return;
    setBusy(true);
    try {
      const r = await book(page, { src, day, start: slot, phone: e164(phone), name: name.trim(), textsOk, note: note.trim(), guests });
      if (r.ok) { setDone({ staff: r.staff, day, start: slot, token: r.token }); setView("done"); }
      else {
        setMsg(t(r.reason === "taken" ? "taken" : r.reason === "too_many" ? "tooMany" : "bad"));
        if (r.reason === "taken") { setSlot(null); setView("time"); }
      }
    } catch { setMsg(t("offline")); }
    setBusy(false);
  };
  const restart = () => { setGuests([{ serviceIds: [] }]); setGi(0); setSlot(null); setNote(""); setDone(null); setMsg(""); setView("door"); };

  if (view === "door") return (
    <div className="bw">
      <Header page={page} />
      <div className="bw-door in">
        {page.salon.slug === DEMO_SLUG && <div className="demo">{t("demo")}</div>}
        <h2 className="h1">{t("bookVisit")}</h2>
        <button type="button" className="bw-doorbtn" data-testid="book-me" onClick={() => { setGroup(false); setGuests([{ serviceIds: [] }]); setView("services"); }}>
          <span className="bw-ico">◯</span><span><b>{t("forMe")}</b><span className="cap">{t("forMeSub")}</span></span><span className="cap">›</span></button>
        {max > 1 && <button type="button" className="bw-doorbtn" data-testid="book-group" onClick={() => { setGroup(true); setGuests([{ serviceIds: [] }, { serviceIds: [] }]); setGi(0); setView("services"); }}>
          <span className="bw-ico">◎</span><span><b>{t("group")}</b><span className="cap">{t("groupSub", { max })}</span></span><span className="cap">›</span></button>}
        <p className="cap bw-center">{t("sameLink")}</p>
      </div>
    </div>
  );

  if (view === "done" && done) {
    const manage = done.token ? `${window.location.origin}/b/${done.token}` : `${window.location.origin}/${page.salon.slug}`;
    const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(bookingIcs({
      uid: done.token ?? `${page.salon.slug}-${done.day}-${done.start}`,
      salon: { name: page.salon.name, address: page.salon.address, phone: page.salon.phone, tz: page.salon.timeZone ?? "America/Los_Angeles" },
      day: done.day, start: done.start, minutes: longest,
      when: `${fromDayKey(done.day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${fmtMin(done.start)}`,
      firstName: name.trim().split(" ")[0],
      lines: guests.flatMap((x, i) => x.serviceIds.map((id) => [svc[id]?.name, done.staff[i]].filter(Boolean).join(" · "))),
      total: `${hasFrom ? "from " : ""}${formatCents(total)}`,
      manageUrl: manage, cancelHours: page.salon.settings.cancel_hours,
      ownerNote: page.salon.settings.calendar_note, alarmMin: page.salon.settings.calendar_alarm_min,
    }))}`;
    const first = name.trim().split(" ")[0];
    const longDay = fromDayKey(done.day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    return (
      <div className="bw">
        <Header page={page} />
        <div className="bw-done in" data-testid="booked">
          <div className="bw-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          <h2 className="h1 bw-center">{t("booked", { name: first.charAt(0).toUpperCase() + first.slice(1) })}</h2>
          <p className="cap bw-center">{textsOk ? t("bookedTexted", { phone: fmtPhone(phone) }) : t("atDesk")}</p>

          <div className="bw-ticket">
            <div className="bw-when">
              <span className="eyebrow">{longDay}</span>
              <b className="num">{fmtMin(done.start)} – {fmtMin(done.start + longest)}</b>
              <span className="cap">{done.staff.map((s) => t("with", { name: s })).join(", ")} · {dur(longest)}</span>
            </div>
            <div className="bw-stack">
              {guests.map((x, i) => x.serviceIds.length ? (
                <div key={i} className="bw-stack">
                  {group && <span className="eyebrow">{guestLabel(i)}</span>}
                  {x.serviceIds.map((id) => svc[id] && <div key={id} className="bw-line"><span className="bw-grow">{svc[id].name}<span className="cap">{dur(svc[id].minutes)}</span></span><span className="num">{svc[id].from ? "from " : ""}{formatCents(svc[id].cents)}</span></div>)}
                </div>) : null)}
              <div className="bw-line bw-total"><span>{t("total")}</span><b className="num">{hasFrom ? "from " : ""}{formatCents(total)}</b></div>
              <p className="cap">{t("tipNote")}</p>
            </div>
            {page.salon.address && <div className="bw-where"><b>{page.salon.name}</b><span className="cap">{page.salon.address}</span></div>}
          </div>

          <div className="bw-acts">
            <a className="btn primary" href={ics} download={`${page.salon.slug}-booking.ics`}>{t("addCal")}</a>
            {page.salon.address && <a className="btn" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(`${page.salon.name}, ${page.salon.address}`)}`}>{t("directions")}</a>}
            <Button variant="ghost" onClick={restart}>{t("again")}</Button>
          </div>
          <p className="cap bw-center">
            {done.token ? <a href={`/b/${done.token}`} data-testid="manage-link">{t("mLink")}</a> : t("cancelRule", { hours: page.salon.settings.cancel_hours })}
            {done.token && <> · {t("mRule", { hours: page.salon.settings.cancel_hours })}</>}
            {page.salon.phone && <> {t("callUs")} <a href={`tel:${page.salon.phone}`}>{fmtPhone(page.salon.phone)}</a></>}
          </p>
        </div>
      </div>
    );
  }

  const shown = page.services.filter((s) => (!cat || s.cat === cat) && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
  const dayParts = [["morning", 0, 720], ["afternoon", 720, 1020], ["evening", 1020, 1440]] as const;
  return (
    <div className="bw">
      <Header page={page} />
      <div className="bw-body">
        <section className="bw-main">
          <div className="bw-steps">{ORDER.map((v, i) => (
            <span key={v} className={i === idx ? "on" : i < idx ? "done" : ""}><b>{i < idx ? "✓" : i + 1}</b>{t(`step${v[0].toUpperCase()}${v.slice(1)}` as "stepServices")}</span>))}</div>

          {group && view === "services" && (
            <div className="bw-row">
              <span className="cap">{t("guests")}</span>
              {guests.map((_, i) => <button key={i} type="button" className={`bw-guest${i === gi ? " on" : ""}`} onClick={() => setGi(i)}>{guestLabel(i)}</button>)}
              {guests.length < max && <button type="button" className="bw-guest" data-testid="add-guest" onClick={() => { setGuests((a) => [...a, { serviceIds: [] }]); setGi(guests.length); }}>{t("addGuest")}</button>}
              {gi > 0 && guests.length > 2 && <button type="button" className="bw-guest" onClick={() => { setGuests((a) => a.filter((_, i) => i !== gi)); setGi(0); }}>{t("removeGuest")}</button>}
            </div>
          )}

          {view === "services" && (
            <div className="bw-stack in">
              {group && gi > 0 && <input className="inp" aria-label={t("name")} placeholder={t("guestN", { n: gi + 1 })} value={g.name ?? ""} onChange={(e) => setG({ name: e.target.value })} />}
              <input className="inp" type="search" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="bw-chips">
                <Chip on={!cat} onClick={() => setCat("")}>{t("all")}</Chip>
                {cats.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
              </div>
              <div className="bw-list">
                {shown.map((s) => {
                  const on = g.serviceIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" className={`bw-svc${on ? " on" : ""}`} aria-pressed={on} data-testid="svc"
                      onClick={() => setG({ serviceIds: on ? g.serviceIds.filter((x) => x !== s.id) : [...g.serviceIds, s.id] })}>
                      <span className="bw-circ">{on ? "✓" : ""}</span>
                      <span className="bw-grow"><b>{s.name}</b><span className="cap">{dur(s.minutes)}</span></span>
                      <b className="num">{s.from ? "from " : ""}{formatCents(s.cents)}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === "staff" && (
            <div className="bw-stack in">
              <h2 className="h2">{t("who")}</h2>
              {guests.map((x, i) => (
                <div key={i} className="bw-stack">
                  {group && <b>{guestLabel(i)}</b>}
                  <div className="bw-chips">
                    {[{ id: null as string | null, name: t("anyone") }, ...page.staff].map((s) => (
                      <button key={s.id ?? "any"} type="button" className={`bw-stf${(x.staffId ?? null) === s.id ? " on" : ""}`} data-testid="staff"
                        onClick={() => setGuests((all) => all.map((y, j) => (j === i ? { ...y, staffId: s.id } : y)))}>
                        <span className="av lg">{s.id ? initials(s.name) : "★"}</span><b>{s.name}</b>{!s.id && <span className="cap">{t("anyoneSub")}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "time" && (
            <div className="bw-stack in">
              <div className="bw-row"><h2 className="h2 bw-grow">{t("pickTime")}</h2>
                {slots && slots.length > 0 && <span className="tag jade">{t("nextFree", { when: `${day === dayKey(new Date()) ? t("today") : fromDayKey(day).toLocaleDateString("en-US", { weekday: "short" })} ${fmtMin(slots[0])}` })}</span>}</div>
              <div className="bw-days">{days.map((d) => {
                const dt = fromDayKey(d);
                return <button key={d} type="button" className={`bw-day${d === day ? " on" : ""}`} onClick={() => { setDay(d); setSlot(null); }}>
                  <span className="cap">{d === dayKey(new Date()) ? t("today") : dt.toLocaleDateString("en-US", { weekday: "short" })}</span><b>{dt.getDate()}</b></button>;
              })}</div>
              {slots === null ? <p className="cap" aria-busy="true">…</p> : slots.length === 0 ? <p className="cap" data-testid="no-times">{t("noTimes")}</p> : dayParts.map(([k, a, b]) => {
                const part = slots.filter((m) => m >= a && m < b);
                return part.length ? <div key={k} className="bw-stack"><div className="eyebrow">{t(k)}</div>
                  <div className="bw-slots">{part.map((m) => <button key={m} type="button" className={`bw-slot${slot === m ? " on" : ""}`} data-testid="slot" onClick={() => setSlot(m)}>{fmtMin(m)}</button>)}</div></div> : null;
              })}
              <p className="cap">{group ? t("groupNote") : t("timeNote")}</p>
            </div>
          )}

          {view === "details" && (
            <div className="bw-two in">
              <div className="bw-stack">
                <h2 className="h2">{t("details")}</h2>
                <label className="cap" htmlFor="bw-phone">{t("phone")}</label>
                <input id="bw-phone" className="inp num" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} placeholder="(408) 555-0142" />
                {back && <div className="bw-hello">{t("welcome", { name: back })}</div>}
                <label className="cap" htmlFor="bw-name">{t("name")}</label>
                <input id="bw-name" className="inp" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                <label className="bw-check-row"><input type="checkbox" checked={textsOk} onChange={(e) => setTextsOk(e.target.checked)} /> {t("texts")}</label>
              </div>
              <div className="bw-stack">
                <label className="cap" htmlFor="bw-note">{t("note")}</label>
                <textarea id="bw-note" className="inp bw-note" rows={4} maxLength={500} placeholder={t("notePh")} value={note} onChange={(e) => setNote(e.target.value)} />
                <p className="cap">{t("cancelRule", { hours: page.salon.settings.cancel_hours })}</p>
              </div>
            </div>
          )}
          {msg && <p className="hint err" role="alert">{msg}</p>}
        </section>

        <aside className="bw-cart">
          <div className="h2 bw-more">{t("visit")}</div>
          {items.length === 0 ? <p className="cap bw-more">{t("nothing")}</p> : guests.map((x, i) => x.serviceIds.length ? (
            <div key={i} className="bw-stack bw-more">
              {group && <span className="eyebrow">{guestLabel(i)}</span>}
              {x.serviceIds.map((id) => svc[id] && <div key={id} className="bw-line"><span className="bw-grow">{svc[id].name}<span className="cap">{dur(svc[id].minutes)}</span></span><span className="num">{svc[id].from ? "from " : ""}{formatCents(svc[id].cents)}</span></div>)}
            </div>) : null)}
          {view !== "services" && slot !== null && <div className="bw-line"><span className="cap">{fromDayKey(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><b>{fmtMin(slot)}</b></div>}
          <div className="bw-line bw-more"><span className="cap">{t("totalTime")}</span><b>{dur(longest)}</b></div>
          <div className="bw-line bw-total"><span>{t("total")}<span className="cap bw-phone-only"> · {dur(longest)}</span></span><b className="num" data-testid="total">{hasFrom ? "from " : ""}{formatCents(total)}</b></div>
          <p className="cap bw-more">{t("tipNote")}</p>
          <Button variant="primary" block disabled={!canNext || busy} data-testid="next" onClick={next}>
            {view === "details" ? (group ? t("bookGroup", { n: guests.length }) : t("bookBtn")) : t("continue")}</Button>
          <Button variant="ghost" block onClick={() => setView(idx > 0 ? ORDER[idx - 1] : "door")}>{t("back")}</Button>
        </aside>
      </div>
    </div>
  );
}
