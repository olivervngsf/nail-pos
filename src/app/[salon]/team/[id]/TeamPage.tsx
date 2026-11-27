"use client";
// B: one tech's full profile (polishosapp.com/<salon>/team/<id>), opened from the team sheet or a shared link.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Header } from "../../BookPage";
import { TeamProfile } from "../../Team";
import { DEMO_SLUG, loadPage, type BookPage } from "@/lib/booking/page";
import { loadTeam, type TeamMember } from "@/lib/staffProfile";
import { getSupabase } from "@/lib/supabase/client";

export default function TeamPage({ slug, id }: { slug: string; id: string }) {
  const t = useTranslations("book");
  const [page, setPage] = useState<BookPage | null | undefined>(undefined);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  useEffect(() => {
    void loadPage(slug).then(setPage).catch(() => setPage(null));
    void loadTeam(slug, slug === DEMO_SLUG || !getSupabase()).then((r) => setTeam(r?.on ? r.team : [])).catch(() => setTeam([]));
  }, [slug]);
  if (page === undefined || team === null) return <div className="bw" aria-busy="true" />;
  const i = team.findIndex((m) => m.id === id);
  if (!page || i < 0) return (
    <div className="bw"><div className="bw-empty"><div className="h2">{t("teamGone")}</div><Link className="btn" href={`/${slug}`}>{t("teamBack")}</Link></div></div>
  );
  return <div className="bw"><Header page={page} /><TeamProfile m={team[i]} i={i} slug={slug} /></div>;
}
