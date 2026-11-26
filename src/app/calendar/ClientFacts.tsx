"use client";
// Client facts on a booking or a waiting walk-in: last visit, who they usually see ("Likes"), care note, profile link.
// Read-only facts; loads from the device test copy or the server (needs internet, else it just doesn't show).
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Desk } from "@/lib/desk";
import { profileFor, type Profile } from "@/lib/clients";

export function ClientFacts({ desk, client, line }: { desk: Desk; client?: { id?: string; name: string; phone: string }; line?: boolean }) {
  const t = useTranslations("calendar");
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    void profileFor({ mode: desk.mode, salonId: desk.salonId, salonName: desk.salonName, role: desk.me.role, name: desk.me.display_name }, client)
      .then((x) => { if (!off) setP(x); });
    return () => { off = true; };
  }, [desk.mode, desk.salonId, desk.salonName, desk.me.role, desk.me.display_name, client?.id, client?.phone]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!client?.name && !client?.phone) return null;
  if (p === undefined) return null;
  if (p === null) return <div className="cap" data-testid="cf-new">{t("cfNew")}</div>;
  const last = p.stats.last_visit ? new Date(p.stats.last_visit).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  // One quiet grey line (booking details): facts, not a block that pulls the eye.
  if (line) return (
    <div className="cap ad-facts" data-testid="client-facts">
      {[last ? t("cfLastShort", { date: last }) : t("cfFirst"), p.usual_staff && t("cfLikesShort", { name: p.usual_staff }), t("cfVisitsShort", { n: p.stats.visits })].filter(Boolean).join(" · ")}
      {p.care && <b style={{ color: "#A63F06", display: "block" }}>{p.care}</b>}
    </div>
  );
  return (
    <div className="group" data-testid="client-facts">
      <div className="row"><span className="grow cap">{t("cfLast")}</span><span>{last ? `${p.usual_service ? `${p.usual_service} · ` : ""}${last}` : t("cfFirst")}</span></div>
      {p.usual_staff && <div className="row"><span className="grow cap">{t("cfLikes")}</span><b>{p.usual_staff}</b></div>}
      <div className="row"><span className="grow cap">{t("cfVisits")}</span><span className="num">{p.stats.visits}</span></div>
      {p.care && <div className="row"><span className="grow cap">{t("cfCare")}</span><b style={{ color: "#A63F06", textAlign: "right" }}>{p.care}</b></div>}
    </div>
  );
}
