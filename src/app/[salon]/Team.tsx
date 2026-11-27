"use client";
// Tech profiles on the booking page (board "Tech Profiles", Oliver picked C + B, Nov 27):
//   C = "Our team" row on the door + a quick sheet per tech (Book with <name>, See all work ›)
//   B = the full profile page /<salon>/team/<id> (big photo, facts card, work photos, Book with <name>)
// Clients see first names only, never a phone or last name; work photos only after the owner's OK.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/kit";
import { hasProfile, staffPhotoUrl, TILE, tint, type TeamMember } from "@/lib/staffProfile";

/** Round photo (or initial on a soft tint). */
export function TechFace({ m, i, size }: { m: TeamMember; i: number; size: number }) {
  const url = staffPhotoUrl(m.photo);
  return url
    ? <span className="tp-face" aria-hidden="true" style={{ width: size, height: size, backgroundImage: `url(${url})` }} />
    : <span className="tp-face" aria-hidden="true" style={{ width: size, height: size, background: tint(i), fontSize: Math.round(size * 0.36) }}>{m.name.slice(0, 1)}</span>;
}

/** One work photo tile (placeholder colour + label when it's a sample). */
export function WorkTile({ path, label, i }: { path: string; label: string; i: number }) {
  const url = staffPhotoUrl(path);
  return (
    <figure className="tp-tile" style={url ? { backgroundImage: `url(${url})` } : { background: TILE[i % TILE.length] }}>
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

/** C: the team row on the booking page's door. Tap a tech = quick sheet. */
export function TeamRow({ team, slug, onBook }: { team: TeamMember[]; slug: string; onBook: (id: string) => void }) {
  const t = useTranslations("book");
  const [open, setOpen] = useState<number | null>(null);
  if (!team.length) return null;
  const m = open === null ? null : team[open];
  return (
    <section className="tp-team" aria-label={t("team")} data-testid="team-row">
      <span className="eyebrow">{t("team")}</span>
      <div className="tp-row">
        {team.map((x, i) => (
          <button key={x.id} type="button" className="tp-card" data-testid="team-tech" onClick={() => setOpen(i)}>
            <TechFace m={x} i={i} size={52} />
            <b>{x.name}</b>
            {x.bestAt?.[0] && <span className="cap">{x.bestAt[0]}</span>}
          </button>
        ))}
      </div>
      {m && open !== null && (
        <Sheet label={m.name} onClose={() => setOpen(null)}>
          <div className="tp-sheet" data-testid="team-sheet">
            <div className="tp-sheet-head">
              <TechFace m={m} i={open} size={56} />
              <div className="tp-grow">
                <b className="tp-name">{m.name}</b>
                <span className="cap">{[m.years ? t("teamYears", { n: m.years }) : "", m.languages?.join(", ")].filter(Boolean).join(" · ")}</span>
              </div>
              <button type="button" className="btn ghost tp-x" aria-label={t("close")} onClick={() => setOpen(null)}>✕</button>
            </div>
            {m.about && <p className="tp-about">{m.about}</p>}
            {!!m.bestAt?.length && <div className="tp-tags">{m.bestAt.map((s) => <span key={s} className="tag">{s}</span>)}</div>}
            {!!m.photos?.length && <div className="tp-grid4">{m.photos.slice(0, 4).map((f, k) => <WorkTile key={f.path} path={f.path} label={f.label} i={k} />)}</div>}
            {hasProfile(m) && <Link className="tp-more" href={`/${slug}/team/${m.id}`} data-testid="team-more">{t("teamSeeAll")} ›</Link>}
            <button type="button" className="btn primary block tp-book" data-testid="team-book" onClick={() => { setOpen(null); onBook(m.id); }}>
              {t("teamBookWith", { name: m.name })}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** B: the full profile page for one tech. */
export function TeamProfile({ m, i, slug }: { m: TeamMember; i: number; slug: string }) {
  const t = useTranslations("book");
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="tp-page in" data-testid="team-profile">
      <div className="tp-hero">
        <TechFace m={m} i={i} size={112} />
        <h1 className="h1">{m.name}</h1>
        {m.about && <p className="tp-about">{m.about}</p>}
      </div>
      {(m.bestAt?.length || m.languages?.length || m.years) ? (
        <div className="card tp-facts">
          {!!m.bestAt?.length && <div className="tp-fact"><span className="cap">{t("teamBestAt")}</span><span className="tp-tags">{m.bestAt.map((s) => <span key={s} className="tag">{s}</span>)}</span></div>}
          {!!m.languages?.length && <div className="tp-fact"><span className="cap">{t("teamSpeaks")}</span><b>{m.languages.join(" · ")}</b></div>}
          {!!m.years && <div className="tp-fact"><span className="cap">{t("teamDoing")}</span><b>{t("teamYears", { n: m.years })}</b></div>}
        </div>
      ) : null}
      {!!m.photos?.length && <>
        <span className="eyebrow">{t("teamWork", { name: m.name })}</span>
        <div className="tp-grid3">{m.photos.map((f, k) => <WorkTile key={f.path} path={f.path} label={f.label} i={k} />)}</div>
      </>}
      <div className="tp-bar">
        <Link className="btn primary block tp-book" href={`/${slug}?with=${m.id}`} data-testid="team-book">{t("teamBookWith", { name: m.name })}</Link>
      </div>
    </div>
  );
}
