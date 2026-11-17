"use client";
// Today · walk-ins right now (Main Screens Today H1: in chair · waiting · booked later; PRD KPI walk-in wait + walk-outs).
// From the calendar's device copy, refreshed every minute; offline it shows the last saved state.
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { pullAppts, useAppts } from "@/lib/booking/appts";
import { at, dayKey } from "@/lib/booking/grid";
import { setLive } from "@/lib/checkout/store";
import { useTick, walkFacts } from "@/app/calendar/WalkIns";

export default function WalkInStrip({ salonId }: { salonId: string }) {
  const today = dayKey(new Date());
  const from = useMemo(() => at(today, 0), [today]), to = useMemo(() => at(today, 24 * 60), [today]);
  const appts = useAppts(salonId, from, to);
  useTick();
  useEffect(() => {
    setLive(true);
    const pull = () => void pullAppts(salonId, from, to).catch(() => { /* offline: device copy */ });
    pull();
    const i = setInterval(pull, 60_000);
    return () => clearInterval(i);
  }, [salonId, from, to]);
  const f = walkFacts(appts, today);
  const later = appts.filter((a) => (a.status === "booked" || a.status === "confirmed") && a.source !== "kiosk" && a.source !== "walk_in" && new Date(a.start).getTime() > Date.now()).length;
  const tiles: [string, string, string, string?][] = [
    ["in", String(f.inChair), "in chair"],
    ["waiting", String(f.waiting), "waiting", f.waiting ? `longest ${f.longest} min` : undefined],
    ["later", String(later), "booked later"],
    ["avg", `${f.avgWait} min`, "avg walk-in wait"],
    ["out", String(f.walkedOut), "walked out", undefined],
  ];
  return (
    <section className="wi-strip" aria-label="Walk-ins right now">
      {tiles.map(([k, v, label, sub]) => (
        <div key={k} className={`card pad wi-tile ${k === "out" && f.walkedOut ? "warn" : ""}`} data-testid={`wi-${k}`}>
          <b className="num">{v}</b><span className="cap">{label}</span>{sub && <span className="cap">{sub}</span>}
        </div>))}
      <Link className="btn wi-link" href="/calendar">Waitlist ›</Link>
    </section>
  );
}
