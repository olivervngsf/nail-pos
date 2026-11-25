"use client";
// Tech app · Home (Tech App board T1): hello + clock in/out, today so far (own money only), who is in my chair now,
// my next client, quick tiles. Bookings and money are this tech's own only.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { rpc } from "@/lib/auth";
import { useLang } from "@/components/AppProviders";
import { phoneClock, refusal } from "@/lib/clockrule";
import { Avatar, Button, Card, Toast } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { isoDay } from "@/lib/closeday";
import { TechShell, useTechMe } from "./tech";
import { fmtMins, minsSince, minsUntil } from "@/lib/booking/techday";
import { svcNames, timeOf, useMyAppts, useMyEarnings, useNow } from "./data";

type Staff = { membership_id: string; clocked_in: boolean; last_clock: string | null };
const $ = formatCents;

export default function TechHome() {
  const t = useTranslations("tech");
  const { me, err } = useTechMe();
  const [clock, setClock] = useState<Staff | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [why, setWhy] = useState("");
  const { lang } = useLang();
  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 3000); };

  const loadClock = useCallback(async () => {
    if (!me) return;
    if (!me.live) { setClock((c) => c ?? { membership_id: me.id, clocked_in: true, last_clock: new Date(new Date().setHours(9, 2, 0, 0)).toISOString() }); return; }
    const list = await rpc<Staff[]>("today_staff", { p_salon: me.salonId });
    setClock(list.find((s) => s.membership_id === me.id) ?? null);
  }, [me]);
  useEffect(() => { void loadClock().catch(() => {}); }, [loadClock]);

  const today = isoDay();
  const day = useMyAppts(me, today, 1);
  const week = useMyEarnings(me, "week");
  const todayEarn = useMyEarnings(me, "today");
  const now = useNow();
  const inChair = useMemo(() => day.find((a) => a.status === "arrived" && a.ticketStatus !== "paid"), [day]);
  const next = useMemo(() => day.find((a) => (a.status === "booked" || a.status === "confirmed") && new Date(a.end).getTime() > now), [day, now]);
  // Clients still to come today (not paid, not over yet): matches "next client" below.
  const left = day.filter((a) => a.status !== "done" && a.status !== "blocked" && a.ticketStatus !== "paid" && new Date(a.end).getTime() > now).length;

  const doClock = async () => {
    if (!me) return;
    setBusy(true);
    try {
      const out = !!clock?.clocked_in;
      setWhy("");
      if (me.live) {
        // Server checks the salon's clock-in rule (salon Wi-Fi / QR at the salon); refused = shown here + logged.
        const r = await phoneClock(me.salonId, out ? "out" : "in");
        if (!r.ok) { setWhy(refusal(r, lang === "vi")); setBusy(false); return; }
        await loadClock();
      } else setClock({ membership_id: me.id, clocked_in: !out, last_clock: new Date().toISOString() });
      say(out ? t("clockedOut") : t("clockedIn"));
    } catch (e) { say((e as Error).message); }
    setBusy(false);
  };

  const first = me?.name.split(" ")[0] ?? "";
  const tips = todayEarn ? todayEarn.tips_card_cents + todayEarn.tips_cash_cents : 0;
  return (
    <TechShell title={t("tab_home")} me={me} err={err}>
      {me && <>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={me.name} />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 17 }}>{t("hi", { name: first })}</b>
            <span className="cap" style={{ display: "block" }} data-testid="clock-state">
              {clock?.clocked_in ? t("clockedInAt", { time: clock.last_clock ? timeOf(clock.last_clock) : "" }) : clock?.last_clock ? t("outAt", { time: timeOf(clock.last_clock) }) : t("notIn")}
            </span>
          </div>
          <Button size="sm" variant={clock?.clocked_in ? "default" : "primary"} disabled={busy} data-testid="clock" onClick={() => void doClock()}>
            {clock?.clocked_in ? t("clockOut") : t("clockIn")}
          </Button>
        </div>

        {why && <div className="note" data-testid="clock-why">{why}</div>}

        <Card pad>
          <div className="cap">{t("todaySoFar")}</div>
          <div className="money" data-testid="today-total">{todayEarn ? $(todayEarn.total_cents) : "—"}</div>
          {todayEarn && <div className="cap num">{t("todayLine", { services: $(todayEarn.services_cents), tips: $(tips), card: $(todayEarn.tips_card_cents), cash: $(todayEarn.tips_cash_cents), n: todayEarn.tickets })}</div>}
        </Card>

        {inChair && <InChair name={inChair.client?.name ?? t("walkIn")} what={svcNames(inChair)} start={inChair.arrivedAt ?? inChair.start} planned={(new Date(inChair.end).getTime() - new Date(inChair.start).getTime()) / 60000} />}

        {next ? (
          <Link href={`/t/schedule?open=${next.id}`} className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }} data-testid="next-client">
            <span style={{ flex: 1 }}><b>{t("nextAt", { time: timeOf(next.start), name: next.client?.name ?? t("walkIn") })}</b>
              <span className="cap" style={{ display: "block", color: next.status === "confirmed" ? undefined : "#B5470A" }}>{svcNames(next)} · {next.status === "confirmed" ? t("confirmed") : t("notConfirmed")}</span></span>
            <NextIn start={next.start} now={now} />
            <span className="cap">›</span>
          </Link>
        ) : <div className="cap">{t("noNext")}</div>}

        <div className="t-tiles">
          <Link className="tile" href="/t/book" data-testid="tech-book"><b>{t("bookTile")}</b><span className="cap">{t("bookSub")}</span></Link>
          <Link className="tile" href="/t/schedule"><b>{t("tab_schedule")}</b><span className="cap">{t("clientsToday", { n: left })}</span></Link>
          <Link className="tile" href="/t/earnings"><b>{t("myEarnings")}</b><span className="cap">{week ? t("weekAmount", { amount: $(week.total_cents) }) : "—"}</span></Link>
          <Link className="tile" href="/clients" data-testid="tech-clients"><b>{t("clientsTile")}</b><span className="cap">{t("clientsSub")}</span></Link>
        </div>
      </>}
      {toast && <Toast>{toast}</Toast>}
    </TechShell>
  );
}

/** "in 12 min" / "now" next to my next client. */
function NextIn({ start, now }: { start: string; now: number }) {
  const t = useTranslations("tech");
  const m = minsUntil(start, now);
  return <span className="tag" data-testid="next-in" style={m <= 10 ? { background: "var(--orange-soft)", color: "#B5470A" } : undefined}>{m <= 0 ? t("nowShort") : t("inMins", { time: fmtMins(m, t("minUnit")) })}</span>;
}

/** Who is in my chair: minutes so far vs the usual time for the service. Over the usual time = orange, plain words. */
function InChair({ name, what, start, planned }: { name: string; what: string; start: string; planned: number }) {
  const t = useTranslations("tech");
  const now = useNow();
  const mins = minsSince(start, now);
  const usual = Math.max(1, Math.round(planned));
  const over = mins - usual;
  const pct = Math.min(100, Math.round((mins / usual) * 100));
  return (
    <div className="card" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6, background: over > 0 ? "var(--orange-soft)" : "var(--jade-soft)" }} data-testid="in-chair">
      <b>{t("inChair", { name })}</b>
      <span className="cap">{t("inChairSub", { what, mins: fmtMins(mins, t("minUnit")), usual: fmtMins(usual, t("minUnit")) })}</span>
      <div className={`t-bar ${over > 0 ? "orange" : "jade"}`}><span style={{ width: `${pct}%` }} /></div>
      {over > 0 && <span className="cap" data-testid="in-chair-over" style={{ color: "#B5470A" }}>{t("overBy", { time: fmtMins(over, t("minUnit")) })}</span>}
    </div>
  );
}
