"use client";
// Checkout home: open tickets (this desk + others), paid today, New ticket.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Button, LeftMenu, ListGroup, OfflineBanner, SyncPill, Tag, TopBar } from "@/components/kit";
import { formatCents } from "@/lib/money";
import { getActing, useDesk } from "@/lib/desk";
import { NEW_FOR } from "@/lib/clients";
import { pullTickets, putTicket, useTickets } from "@/lib/checkout/store";
import { ticketLabel, totals, type Ticket } from "@/lib/checkout/ticket";
import { getTicket } from "@/lib/checkout/store";
import { parseTicketScan } from "@/lib/print/print";

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export default function CheckoutHome() {
  const t = useTranslations("checkout");
  const f = useFormatter();
  const router = useRouter();
  const { desk, err } = useDesk();
  const all = useTickets(desk?.salonId ?? "");

  useEffect(() => {
    if (!desk || desk.mode !== "live") return;
    const name = (id: string) => desk.staff.find((s) => s.id === id)?.name ?? "";
    const pull = () => void pullTickets(desk.salonId, name, startOfDay()).catch(() => { /* offline: device copy */ });
    pull();
    const iv = setInterval(pull, 30_000);
    return () => clearInterval(iv);
  }, [desk]);

  // "New ticket" from a client's profile: /checkout?new=1 with the client waiting in this tab.
  useEffect(() => {
    if (!desk || !new URLSearchParams(location.search).has("new")) return;
    let client: Ticket["client"];
    try { client = JSON.parse(sessionStorage.getItem(NEW_FOR) ?? "null") ?? undefined; sessionStorage.removeItem(NEW_FOR); } catch { /* none */ }
    const acting = getActing();
    const id = crypto.randomUUID();
    putTicket({ id, salonId: desk.salonId, status: "open", createdAt: new Date().toISOString(), lines: [], tips: {}, note: "", client,
      openedBy: acting?.membership_id ?? desk.me.membership_id, deviceId: desk.device?.id });
    router.replace(`/checkout/${id}`);
  }, [desk, router]);

  // Scan a ticket slip (NetumScan types the QR link + Enter), or type a ticket number.
  const [scan, setScan] = useState("");
  const [scanMsg, setScanMsg] = useState("");
  const allRef = useRef(all); allRef.current = all;
  const openScanned = async (text: string) => {
    const q = parseTicketScan(text);
    if (!q || !desk) return setScanMsg(t("scanNone"));
    const find = () => q.id ? getTicket(q.id) : allRef.current.find((x) => x.number === q.number);
    let hit = find();
    if (!hit && desk.mode === "live") {
      const name = (id: string) => desk.staff.find((s) => s.id === id)?.name ?? "";
      await pullTickets(desk.salonId, name, q.id ? "" : startOfDay(), q.id).catch(() => null);
      hit = q.id ? getTicket(q.id) : undefined;
    }
    if (hit && hit.salonId === desk.salonId) { setScan(""); setScanMsg(""); router.push(`/checkout/${hit.id}`); }
    else setScanMsg(t("scanNone"));
  };
  // A scanner types fast and ends with Enter: catch it even when the box isn't focused.
  useEffect(() => {
    let buf = "", last = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const now = Date.now();
      if (now - last > 80) buf = "";
      last = now;
      if (e.key === "Enter") { if (buf.length >= 4) void openScanned(buf); buf = ""; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (err) return <main style={{ padding: 24 }}><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;

  const today = startOfDay();
  const open = all.filter((x) => x.status === "open" && (x.lines.length || x.client?.name || x.number));
  const paid = all.filter((x) => x.status === "paid" && (x.payment?.at ?? x.createdAt) >= today);
  const acting = getActing();

  const newTicket = () => {
    const id = crypto.randomUUID();
    putTicket({ id, salonId: desk.salonId, status: "open", createdAt: new Date().toISOString(), lines: [], tips: {}, note: "", openedBy: acting?.membership_id ?? desk.me.membership_id, deviceId: desk.device?.id });
    router.push(`/checkout/${id}`);
  };
  const row = (x: Ticket) => {
    const s = totals(x);
    const names = [...new Set(x.lines.map((l) => l.staffName).filter(Boolean))].join(", ");
    return (
      <button key={x.id} type="button" className="opt" data-testid="ticket-row" onClick={() => router.push(`/checkout/${x.id}`)}>
        <Avatar name={x.client?.name || "?"} />
        <span className="grow">
          <b style={{ fontWeight: 600 }}>{t("ticket", { n: ticketLabel(x) })} · {x.client?.name || t("walkIn")}</b>
          <span className="cap" style={{ display: "block" }}>{x.lines.map((l) => l.name).join(", ") || "—"}{names ? ` · ${names}` : ""}{!x.number ? ` · ${t("notSynced")}` : ""}</span>
        </span>
        <span className="num" style={{ fontWeight: 600 }}>{formatCents(x.status === "paid" ? s.total : s.due)}</span>
        {x.status === "paid" && <span className="cap">{f.dateTime(new Date(x.payment?.at ?? x.createdAt), { timeStyle: "short" })}</span>}
      </button>
    );
  };

  return (
    <div className="app">
      <LeftMenu active="Checkout" salonInitials={desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} />
      <div className="col">
        <TopBar title={desk.salonName}>
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 980, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 className="h1" style={{ flex: 1 }}>{t("title")}</h1>
            <form onSubmit={(e) => { e.preventDefault(); void openScanned(scan); }} style={{ display: "flex", gap: 6 }}>
              <input className="inp" data-testid="scan-box" aria-label={t("scanPh")} placeholder={t("scanPh")} value={scan} onChange={(e) => setScan(e.target.value)}
                style={{ width: 230, height: 40, fontSize: 15 }} />
            </form>
            <Button variant="primary" data-testid="new-ticket" onClick={newTicket}>{t("newTicket")}</Button>
          </div>
          {scanMsg && <div className="hint err" role="alert">{scanMsg}</div>}
          {desk.mode === "demo" && <div className="demo">{t("demo")}</div>}
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="eyebrow">{t("open")} <Tag>{open.length}</Tag></div>
            <ListGroup>{open.length ? open.map(row) : <div className="row"><span className="cap">{t("none")}</span></div>}</ListGroup>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="eyebrow">{t("paidToday")} · {formatCents(paid.reduce((a, x) => a + totals(x).total, 0))}</div>
            <ListGroup>{paid.length ? paid.map(row) : <div className="row"><span className="cap">{t("noneYet")}</span></div>}</ListGroup>
          </section>
        </main>
      </div>
    </div>
  );
}
