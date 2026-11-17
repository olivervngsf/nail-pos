"use client";
// Tech scans the ticket slip QR → this page on their phone: tap the services they did; they go on the ticket
// under their name. Front desk sees them appear and charges. (Ticket slip flow.)
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar, Button, PhoneBar, Toast } from "@/components/kit";
import { getSupabase } from "@/lib/supabase/client";
import { SMS_ON, isSignedIn, rpc } from "@/lib/auth";
import { formatCents as $ } from "@/lib/money";

type Line = { id: string; name: string; cents: number; staff_id: string | null; staff: string | null };
type T = { id: string; number: number; status: string; salon_id: string; me: string | null; client: string | null; salon: string; lines: Line[] };
type Svc = { id: string; category: string; name: string; minutes: number; price_cents: number; price_from: boolean };

export default function TechTicket({ id }: { id: string }) {
  const t = useTranslations("slip");
  const router = useRouter();
  const [tk, setTk] = useState<T | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [svc, setSvc] = useState<Svc[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  // Techs can't read tickets in general; tech_ticket shows just this one (no client phone).
  const load = useCallback(async () => {
    try {
      const data = await rpc<T>("tech_ticket", { p_ticket: id });
      setTk(data);
      return data;
    } catch { setErr(t("notFound")); return undefined; }
  }, [id, t]);

  useEffect(() => {
    if (!SMS_ON) { setErr(t("liveOnly")); return; }
    void (async () => {
      if (!(await isSignedIn())) return router.replace(`/login?next=${encodeURIComponent(`/t/ticket/${id}`)}`);
      const x = await load();
      if (!x) return;
      if (!x.me) { setErr(t("notFound")); return; }
      setMe(x.me);
      const { data } = await getSupabase()!.from("services").select("id,category,name,minutes,price_cents,price_from").eq("salon_id", x.salon_id).is("archived_at", null).order("sort");
      setSvc((data ?? []) as Svc[]);
    })();
    const iv = setInterval(() => void load(), 8000);
    return () => clearInterval(iv);
  }, [id, load, router, t]);

  const say = (s: string) => { setToast(s); setTimeout(() => setToast(""), 2500); };
  const add = async (s: Svc) => {
    setBusy(true);
    try { await rpc("tech_add_service", { p_ticket: id, p_line: crypto.randomUUID(), p_service: s.id }); await load(); say(t("added", { name: s.name })); }
    catch (e) { say((e as Error).message.includes("paid") ? t("paid") : (e as Error).message); }
    setBusy(false);
  };
  const remove = async (l: Line) => {
    setBusy(true);
    try { await rpc("tech_remove_line", { p_ticket: id, p_line: l.id }); await load(); } catch (e) { say((e as Error).message); }
    setBusy(false);
  };

  if (err) return <main className="phone"><div className="pbody" style={{ paddingTop: 32 }}><div className="card pad"><b>{err}</b></div></div></main>;
  if (!tk) return <main className="phone" aria-busy="true" />;

  const lines = tk.lines;
  const mine = lines.filter((l) => l.staff_id === me), others = lines.filter((l) => l.staff_id !== me);
  const open = tk.status === "open";
  const list = svc.filter((s) => (s.name + " " + s.category).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <main className="phone">
      <PhoneBar title={t("ticket", { n: tk.number })} />
      <div className="pbody">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={tk.client || "?"} />
          <div style={{ flex: 1 }}><div className="h2">{tk.client || t("walkIn")}</div><div className="cap">{tk.salon}</div></div>
        </div>
        {!open && <div className="note">{t("paid")}</div>}

        <div className="eyebrow">{t("yours")}</div>
        <div className="group" data-testid="my-lines">
          {mine.length ? mine.map((l) => (
            <div className="row" key={l.id}>
              <span className="g"><b style={{ fontWeight: 600 }}>{l.name}</b></span>
              <span className="num">{$(Number(l.cents))}</span>
              {open && <Button size="sm" variant="ghost" aria-label={t("remove", { name: l.name })} disabled={busy} onClick={() => void remove(l)}>✕</Button>}
            </div>
          )) : <div className="row"><span className="cap">{t("noneYet")}</span></div>}
        </div>

        {others.length > 0 && <>
          <div className="eyebrow">{t("others")}</div>
          <div className="group">{others.map((l) => <div className="row s" key={l.id}><span className="g">{l.name}<span className="cap">{l.staff ?? t("noTech")}</span></span><span className="num">{$(Number(l.cents))}</span></div>)}</div>
        </>}

        {open && <>
          <div className="eyebrow">{t("addWhat")}</div>
          <input className="inp" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="group">
            {list.map((s) => (
              <button key={s.id} type="button" className="opt" disabled={busy} data-testid={`add-${s.name}`} onClick={() => void add(s)}>
                <span className="g"><b style={{ fontWeight: 600 }}>{s.name}</b><span className="cap" style={{ display: "block" }}>{s.category} · {s.minutes} min</span></span>
                <span className="num">{$(Number(s.price_cents))}{s.price_from ? "+" : ""}</span>
              </button>
            ))}
          </div>
          <div className="cap" style={{ textAlign: "center" }}>{t("deskSees")}</div>
        </>}
      </div>
      {toast && <Toast>{toast}</Toast>}
    </main>
  );
}
