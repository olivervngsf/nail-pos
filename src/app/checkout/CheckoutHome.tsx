"use client";
// Checkout home: open tickets (this desk + others), paid today, New ticket.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Button, LeftMenu, ListGroup, OfflineBanner, SyncPill, Tag, TopBar } from "@/components/kit";
import AccountMenu from "@/components/AccountMenu";
import { formatCents } from "@/lib/money";
import { getActing, useDesk } from "@/lib/desk";
import { pullTickets, putTicket, useTickets } from "@/lib/checkout/store";
import { ticketLabel, totals, type Ticket } from "@/lib/checkout/ticket";

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

  if (err) return <main style={{ padding: 24 }}><p className="hint err">{err}</p></main>;
  if (!desk) return <div className="app" aria-busy="true" />;

  const today = startOfDay();
  const open = all.filter((x) => x.status === "open" && (x.lines.length || x.client?.name));
  const paid = all.filter((x) => x.status === "paid" && (x.payment?.at ?? x.createdAt) >= today);
  const acting = getActing();
  const who = acting ? { name: acting.name, role: acting.role } : { name: desk.me.display_name, role: desk.me.role };

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
          <AccountMenu name={who.name} role={who.role} salon={desk.salonName} />
        </TopBar>
        <OfflineBanner />
        <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 980, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 className="h1" style={{ flex: 1 }}>{t("title")}</h1>
            <Button variant="primary" data-testid="new-ticket" onClick={newTicket}>{t("newTicket")}</Button>
          </div>
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
