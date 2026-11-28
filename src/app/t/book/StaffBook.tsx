"use client";
// Tech books her own clients on her own phone. Booking board StaffBook S1–S6: my day (own bookings only), who is it for
// (my regulars or a new phone), service, only my own free times, check, booked + undo. The server re-checks the time
// under a lock (staff_book), so nothing double-books; it needs a connection for that.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, PhoneBar, SyncPill, Toast } from "@/components/kit";
import { SMS_ON, e164, isSignedIn, myMemberships, rpc, type Membership } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { DEMO_DESK } from "@/lib/desk";
import { formatCents } from "@/lib/money";
import { defaultHours, fmtPhone, phoneOk, toMin } from "@/lib/onboarding/data";
import { allAppts, pullAppts, putAppt, useAppts } from "@/lib/booking/appts";
import { addDays, at, dayKey, fmtMin, freeStarts, fromDayKey, minutesOf } from "@/lib/booking/grid";
import { setLive } from "@/lib/checkout/store";
import { TechTabs } from "../tech";

type Me = { salonId: string; salonName: string; id: string; name: string; live: boolean };
type Svc = { id: string; name: string; minutes: number; cents: number };
type Regular = { id?: string; name: string; phone: string; visits: number; service?: string | null; serviceId?: string | null };
type Step = "day" | "client" | "service" | "time" | "review" | "done";
const BACK: Partial<Record<Step, Step>> = { client: "day", service: "client", time: "service", review: "time" };

export default function StaffBookPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!SMS_ON) { setLive(false); const k = DEMO_DESK.staff[0]; setMe({ salonId: DEMO_DESK.salonId, salonName: DEMO_DESK.salonName, id: k.id, name: k.name, live: false }); return; }
    void (async () => {
      try {
        if (!(await isSignedIn())) return router.replace("/login");
        const list: Membership[] = await myMemberships();
        const m = list.find((x) => x.role === "tech") ?? list[0];
        if (!m) return router.replace("/setup");
        setLive(true);
        setMe({ salonId: m.salon_id, salonName: m.salon_name, id: m.membership_id, name: m.display_name, live: true });
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [router]);
  if (err) return <div className="phone"><PhoneBar title="PolishOS" /><div className="pbody"><p className="hint err">{err}</p></div></div>;
  if (!me) return <div className="phone" aria-busy="true" />;
  return <Book me={me} />;
}

function Book({ me }: { me: Me }) {
  const t = useTranslations("staffBook");
  const router = useRouter();
  const today = dayKey(new Date());
  const from = useMemo(() => at(today, 0), [today]);
  const to = useMemo(() => at(dayKey(addDays(new Date(), 14)), 0), []);
  const all = useAppts(me.salonId, from, to);
  const mineToday = all.filter((a) => a.staffId === me.id && a.status !== "canceled" && dayKey(new Date(a.start)) === today);
  useEffect(() => { void pullAppts(me.salonId, from, to).catch(() => {}); }, [me.salonId, from, to]);

  const [services, setServices] = useState<Svc[]>([]);
  const [regulars, setRegulars] = useState<Regular[]>([]);
  useEffect(() => {
    if (!me.live) {
      setServices(DEMO_DESK.services.map((s) => ({ id: s.id, name: s.name, minutes: s.minutes, cents: s.cents })));
      const seen = new Map<string, Regular>();
      for (const a of allAppts()) if (a.client?.phone && !seen.has(a.client.phone)) seen.set(a.client.phone, { name: a.client.name, phone: a.client.phone, visits: 1, service: a.services[0]?.name });
      setRegulars([...seen.values()].slice(0, 6));
      return;
    }
    void getSupabase()?.from("services").select("id,name,minutes,price_cents").eq("salon_id", me.salonId).is("archived_at", null).order("sort")
      .then(({ data }) => setServices((data ?? []).map((s) => ({ id: s.id, name: s.name, minutes: s.minutes, cents: Number(s.price_cents) }))));
    void rpc<Regular[]>("my_regulars", { p_salon: me.salonId }).then(setRegulars).catch(() => {});
  }, [me]);

  const [step, setStep] = useState<Step>("day");
  const [client, setClient] = useState<{ id?: string; name: string; phone: string } | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [svc, setSvc] = useState<Svc | null>(null);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => dayKey(addDays(new Date(), i))), []);
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<number[] | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  const when = (d: string, m: number) => `${fromDayKey(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${fmtMin(m)}`;

  const loadSlots = useCallback(async () => {
    if (!svc) return;
    setSlots(null);
    if (me.live) {
      try { setSlots(await rpc<number[]>("my_slots", { p_salon: me.salonId, p_day: day, p_minutes: svc.minutes })); } catch { setSlots([]); setMsg(t("offline")); }
      return;
    }
    const h = defaultHours()[(fromDayKey(day).getDay() + 6) % 7];
    const busyList = allAppts().filter((a) => a.staffId === me.id && a.status !== "canceled" && a.status !== "no_show" && dayKey(new Date(a.start)) === day)
      .map((a) => ({ id: a.id, start: minutesOf(a.start), end: minutesOf(a.end) }));
    const now = new Date();
    setSlots(h.on ? freeStarts(busyList, toMin(h.open), toMin(h.close), svc.minutes, day === today ? now.getHours() * 60 + now.getMinutes() : 0) : []);
  }, [svc, me, day, today, t]);
  useEffect(() => { if (step === "time") void loadSlots(); }, [step, loadSlots]);

  const book = async () => {
    if (!client || !svc || slot === null) return;
    setBusy(true); setMsg("");
    const id = crypto.randomUUID();
    try {
      if (me.live) {
        const r = await rpc<{ ok: boolean; reason?: string }>("staff_book", { p: { id, salonId: me.salonId, phone: client.phone, clientId: client.id ?? null, name: client.name, serviceIds: [svc.id], day, start: slot } });
        if (!r.ok) { setMsg(t("taken")); setSlot(null); setStep("time"); setBusy(false); return; }
        await pullAppts(me.salonId, from, to).catch(() => {});
      } else {
        putAppt({ id, salonId: me.salonId, start: at(day, slot), end: at(day, slot + svc.minutes), staffId: me.id, client: { name: client.name, phone: client.phone },
          services: [{ serviceId: svc.id, name: svc.name, minutes: svc.minutes, cents: svc.cents }], status: "booked", source: "staff_phone", note: "", updatedAt: "" });
      }
      setLastId(id);
      setStep("done");
    } catch { setMsg(t("offline")); }
    setBusy(false);
  };
  const undo = async (id: string) => {
    try {
      if (me.live) { await rpc("staff_unbook", { p_id: id }); await pullAppts(me.salonId, from, to).catch(() => {}); }
      else { const a = allAppts().find((x) => x.id === id); if (a) putAppt({ ...a, status: "canceled" }); }
      setToast({ text: t("undone") }); setTimeout(() => setToast(null), 3000);
    } catch { setMsg(t("offline")); }
  };
  const finish = () => {
    if (client && slot !== null && lastId) {
      const id = lastId;
      setToast({ text: t("bookedToast", { name: client.name.split(" ")[0], when: when(day, slot) }), undo: () => { setToast(null); void undo(id); } });
      setTimeout(() => setToast(null), 8000);
    }
    setClient(null); setSvc(null); setSlot(null); setNewPhone(""); setNewName(""); setDay(today); setStep("day");
  };

  const order: Step[] = ["client", "service", "time", "review"];
  const n = order.indexOf(step);
  const title = step === "day" ? t("myDay") : t("newBooking");
  return (
    <div className="phone">
      <PhoneBar title={<span>{title}{n >= 0 && <span className="cap"> · {t("step", { n: n + 1 })}</span>}</span>}
        left={BACK[step] ? <button type="button" className="btn ghost" onClick={() => setStep(BACK[step]!)}>{t("back")}</button> : step === "day" ? <button type="button" className="btn ghost" onClick={() => router.push("/t")}>{t("back")}</button> : undefined}
        right={<SyncPill />} />
      <div className="pbody in">
        {!me.live && <div className="demo">{t("demo")}</div>}

        {step === "day" && <>
          <div className="sb-me"><span className="av lg">{me.name[0]}</span><div><b>{me.name} · {fromDayKey(today).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b>
            <div className="cap">{t("summary", { n: mineToday.length })}</div></div></div>
          <div className="group">
            {mineToday.length === 0 ? <div className="opt cap">{t("nothingToday")}</div> : mineToday.map((a) => (
              <div key={a.id} className="opt sb-ap"><b className="num sb-t">{fmtMin(minutesOf(a.start))}</b>
                <span className="bw-grow"><b>{a.client?.name || "—"}</b><span className="cap">{a.services.map((s) => s.name).join(" + ")}</span></span></div>))}
          </div>
          <Button variant="primary" block data-testid="sb-start" onClick={() => setStep("client")}>{t("bookClient")}</Button>
          <p className="cap">{t("onlyMine")}</p>
        </>}

        {step === "client" && <>
          <h2 className="h2">{t("whoFor")}</h2>
          {regulars.length > 0 && <><div className="eyebrow">{t("regulars")}</div>
            <div className="group">{regulars.map((r) => (
              <button key={r.id ?? r.phone} type="button" className="opt" data-testid="sb-regular" onClick={() => {
                setClient({ id: r.id, name: r.name, phone: r.phone });
                const usual = services.find((s) => s.id === r.serviceId || s.name === r.service);
                if (usual) setSvc(usual);
                setStep("service");
              }}><span className="av">{r.name[0]}</span><span className="bw-grow"><b>{r.name}</b><span className="cap">{[r.service, r.visits > 1 ? t("visits", { n: r.visits }) : null].filter(Boolean).join(" · ")}</span></span><span className="cap">›</span></button>))}
            </div></>}
          <div className="eyebrow">{t("newClient")}</div>
          <input className="inp num" inputMode="tel" aria-label={t("phone")} placeholder={t("phone")} value={newPhone} onChange={(e) => setNewPhone(fmtPhone(e.target.value))} />
          <input className="inp" aria-label={t("name")} placeholder={t("name")} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button block disabled={!phoneOk(newPhone) || !newName.trim()} onClick={() => { setClient({ name: newName.trim(), phone: e164(newPhone) }); setStep("service"); }}>{t("next")}</Button>
        </>}

        {step === "service" && client && <>
          <h2 className="h2">{t("whatService", { name: client.name })}</h2>
          <div className="group">{services.map((s) => (
            <button key={s.id} type="button" className={`opt${svc?.id === s.id ? " on" : ""}`} data-testid="sb-svc" onClick={() => setSvc(s)}>
              <span className="bw-grow"><b>{s.name}</b><span className="cap">{s.minutes} min</span></span><b className="num">{formatCents(s.cents)}</b></button>))}
          </div>
          <Button variant="primary" block disabled={!svc} data-testid="sb-next" onClick={() => setStep("time")}>{t("next")}</Button>
        </>}

        {step === "time" && svc && <>
          <h2 className="h2">{t("when")}</h2>
          <div className="bw-days">{days.map((d) => {
            const dt = fromDayKey(d);
            return <button key={d} type="button" className={`bw-day${d === day ? " on" : ""}`} onClick={() => { setDay(d); setSlot(null); }}>
              <span className="cap">{dt.toLocaleDateString("en-US", { weekday: "short" })}</span><b>{dt.getDate()}</b></button>;
          })}</div>
          <div className="eyebrow">{t("freeTimes", { svc: `${svc.name} ${svc.minutes} min` })}</div>
          {slots === null ? <p className="cap" aria-busy="true">…</p> : slots.length === 0 ? <p className="cap">{t("noTimes")}</p> :
            <div className="bw-slots">{slots.map((m) => <button key={m} type="button" className={`bw-slot${slot === m ? " on" : ""}`} data-testid="sb-slot" onClick={() => setSlot(m)}>{fmtMin(m)}</button>)}</div>}
          <p className="cap">{t("freeNote")}</p>
          {msg && <p className="hint err" role="alert">{msg}</p>}
          <Button variant="primary" block disabled={slot === null} data-testid="sb-next" onClick={() => setStep("review")}>{t("next")}</Button>
        </>}

        {step === "review" && client && svc && slot !== null && <>
          <h2 className="h2">{t("check")}</h2>
          <div className="group">
            <div className="opt"><span className="cap bw-grow">{t("client")}</span><b>{client.name}</b></div>
            <div className="opt"><span className="cap bw-grow">{t("service")}</span><b>{svc.name} · {svc.minutes} min</b></div>
            <div className="opt"><span className="cap bw-grow">{t("whenL")}</span><b>{when(day, slot)}</b></div>
            <div className="opt"><span className="cap bw-grow">{t("withL")}</span><b>{t("you", { name: me.name })}</b></div>
            <div className="opt"><span className="cap bw-grow">{t("price")}</span><b className="num">{formatCents(svc.cents)}</b></div>
          </div>
          {msg && <p className="hint err" role="alert">{msg}</p>}
          <Button variant="primary" block disabled={busy} data-testid="sb-book" onClick={() => void book()}>{t("bookBtn", { name: client.name.split(" ")[0], when: fmtMin(slot) })}</Button>
        </>}

        {step === "done" && client && svc && slot !== null && <div className="bw-stack" data-testid="sb-done">
          <div className="bw-check">✓</div>
          <h2 className="h1 bw-center">{t("booked")}</h2>
          <p className="bw-center">{client.name} · {svc.name} · {when(day, slot)}</p>
          <p className="cap bw-center">{t("onCal")}</p>
          <Button variant="primary" block onClick={finish}>{t("backDay")}</Button>
        </div>}
      </div>
      {toast && <Toast action={toast.undo ? { label: t("undo"), onClick: toast.undo } : undefined}>{toast.text}</Toast>}
      <TechTabs />
    </div>
  );
}
