"use client";
// Checkout home: open tickets (this desk + others), paid today, New ticket. Two layouts (List / Cards, HomeViews.tsx);
// the owner picks one for the salon in Settings → Payments.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LeftMenu, OfflineBanner, SyncPill, TopBar } from "@/components/kit";
import { getActing, useDesk } from "@/lib/desk";
import { NEW_FOR } from "@/lib/clients";
import { pullTickets, putTicket, useTickets } from "@/lib/checkout/store";
import { type Ticket } from "@/lib/checkout/ticket";
import { useHomeLayout } from "@/lib/checkout/homeLayout";
import HomeView from "./HomeViews";
import { getTicket } from "@/lib/checkout/store";
import { parseTicketScan } from "@/lib/print/print";

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export default function CheckoutHome() {
  const t = useTranslations("checkout");
  const router = useRouter();
  const { desk, err } = useDesk();
  const all = useTickets(desk?.salonId ?? "");
  const { layout } = useHomeLayout(desk?.salonId, desk?.mode === "demo");

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
  return (
    <div className="app">
      <LeftMenu active="Checkout" salonInitials={desk.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} />
      <div className="col">
        <TopBar title={desk.salonName}>
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        <main className="co-home" data-layout={layout}>
          <HomeView layout={layout} open={open} paid={paid} scan={scan} setScan={setScan} onScan={() => void openScanned(scan)} scanMsg={scanMsg} demo={desk.mode === "demo"}
            onNew={newTicket} go={(x, pay) => router.push(`/checkout/${x.id}${pay ? "?pay=1" : ""}`)} />
        </main>
      </div>
    </div>
  );
}
