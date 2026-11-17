"use client";
// Tech's own phone: who I am, clock in/out, my earnings (today / this week, print), language, sign out.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL, SMS_ON, isSignedIn, myMemberships, rpc, signOut, type Membership } from "@/lib/auth";
import { useLang } from "@/components/AppProviders";
import { Button, Card, ListGroup, PhoneBar, Row, Segmented, SyncPill, Toast } from "@/components/kit";
import { EarningsSlip } from "@/app/earnings/Earnings";
import { isoDay, nums, weekStart, type PayoutRow } from "@/lib/closeday";

type Staff = { membership_id: string; clocked_in: boolean; last_clock: string | null };
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");

export default function TechHome() {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const [m, setM] = useState<Membership | null>(null);
  const [me, setMe] = useState<Staff | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!SMS_ON) return;
    void (async () => {
      if (!(await isSignedIn())) return router.replace("/login");
      try {
        const list = await myMemberships();
        const t = list.find((x) => x.role === "tech") ?? list[0];
        if (!t) return router.replace("/setup");
        setM(t);
        if (t.language && t.language !== lang) setLang(t.language);
      } catch (e) { setErr((e as Error).message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const load = useCallback(async () => {
    if (!m) return;
    const list = await rpc<Staff[]>("today_staff", { p_salon: m.salon_id });
    setMe(list.find((s) => s.membership_id === m.membership_id) ?? null);
  }, [m]);
  useEffect(() => { void load().catch((e) => setErr((e as Error).message)); }, [load]);

  // My earnings (only mine: my_earnings checks who is signed in).
  const [period, setPeriod] = useState<"today" | "week">("today");
  const [earn, setEarn] = useState<PayoutRow | null>(null);
  useEffect(() => {
    if (!m) return;
    const today = isoDay();
    void rpc<PayoutRow | null>("my_earnings", { p_salon: m.salon_id, p_from: period === "today" ? today : weekStart(today), p_to: today })
      .then((r) => setEarn(r ? nums(r) : null)).catch(() => setEarn(null));
  }, [m, period]);

  const vi = lang === "vi";
  if (!SMS_ON) return <div className="phone"><PhoneBar title="PolishOS" /><div className="pbody"><div className="demo">Sign-in is off in this test copy.</div><Link className="btn" href="/t/book">Book a client (test)</Link></div></div>;
  if (err) return <div className="phone"><PhoneBar title="PolishOS" /><div className="pbody"><p className="hint err">{err}</p><Button onClick={() => location.reload()}>Try again</Button></div></div>;
  if (!m) return <div className="phone" aria-busy="true" />;

  const first = m.display_name.split(" ")[0];
  return (
    <div className="phone">
      <PhoneBar title={m.salon_name} right={<SyncPill />} />
      <div className="pbody in">
        <h1 className="h2">{vi ? `Chào ${first}` : `Hi ${first}`}</h1>
        <Card pad>
          {me?.clocked_in
            ? <><b>{vi ? "Đã chấm công" : "Clocked in"} · {time(me.last_clock)}</b><span className="cap">{m.salon_name}</span></>
            : <span className="cap">{me?.last_clock ? `${vi ? "Ra lúc" : "Out at"} ${time(me.last_clock)}` : vi ? "Chưa chấm công hôm nay" : "Not clocked in yet"}</span>}
          <Button variant={me?.clocked_in ? "default" : "primary"} block disabled={busy} data-testid="clock" onClick={async () => {
            setBusy(true);
            try {
              await rpc("clock_self", { p_salon: m.salon_id, p_kind: me?.clocked_in ? "out" : "in" });
              setToast(me?.clocked_in ? (vi ? "Đã chấm công ra" : "Clocked out") : (vi ? "Đã chấm công vào" : "Clocked in"));
              setTimeout(() => setToast(""), 3000);
              await load();
            } catch (e) { setErr((e as Error).message); }
            setBusy(false);
          }}>{me?.clocked_in ? (vi ? "Chấm công ra" : "Clock out") : (vi ? "Chấm công vào" : "Clock in")}</Button>
          <span className="cap">{vi ? "Sau này: chỉ chấm công được khi ở tiệm (Wi-Fi hoặc vị trí)." : "Later: clock-in only works at the salon (Wi-Fi or location)."}</span>
        </Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <b>{vi ? "Thu nhập của tôi" : "My earnings"}</b>
          <Segmented label={vi ? "Thời gian" : "Period"} value={period} onChange={setPeriod} options={[{ value: "today", label: vi ? "Hôm nay" : "Today" }, { value: "week", label: vi ? "Tuần này" : "This week" }]} />
        </div>
        {earn ? <>
          <EarningsSlip r={earn} salon={m.salon_name} period={period === "today" ? isoDay() : `${weekStart(isoDay())} → ${isoDay()}`} />
          <Button onClick={() => window.print()}>{vi ? "In thu nhập" : "Print my earnings"}</Button>
        </> : <span className="cap">{vi ? "Chưa có thu nhập trong thời gian này." : "No earnings yet for this period."}</span>}
        <ListGroup>
          <Row title={vi ? "Vai trò" : "Role"} right={<b>{ROLE_LABEL[m.role]}</b>} />
          <Row title={vi ? "Ngôn ngữ" : "Language"} right={<Segmented label="Language" value={lang} onChange={setLang} options={[{ value: "en", label: "EN" }, { value: "vi", label: "VI" }]} />} />
        </ListGroup>
        <Link className="btn primary" href="/t/book" data-testid="tech-book">{vi ? "Đặt lịch cho khách" : "Book a client"}</Link>
        <Link className="btn" href="/clients" data-testid="tech-clients">{vi ? "Khách hàng: ghi chú + ảnh" : "Clients: notes + photos"}</Link>
        <Button variant="ghost" data-testid="sign-out" onClick={async () => { await signOut(); router.replace("/login"); }}>{vi ? "Đăng xuất" : "Sign out"}</Button>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
