"use client";
// Admin · Support (Founder Admin A4): salons whose owner turned support on (Settings → Support, 24h). Open their screens
// (green Support mode strip on every page; every change logged for the owner) or End now. Nothing here without the owner's OK.
// Data: admin_support_on(), support_end() (migration 20261220000001_support_access).
import { useCallback, useEffect, useState } from "react";
import { rpc } from "@/lib/auth";
import { Button, ListGroup, Row } from "@/components/kit";
import { openSupport } from "@/components/SupportBanner";
import { AdminShell, useAdmin } from "../shell";

type On = { salon_id: string; salon_name: string; until: string; since: string; reason: string };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function AdminSupport() {
  const admin = useAdmin();
  const [list, setList] = useState<On[]>([]);
  const load = useCallback(async () => {
    if (admin.gate === "demo") {
      setList((cur) => cur.length ? cur : [{ salon_id: "demo", salon_name: "Golden Nails", since: new Date().toISOString(),
        until: new Date(Date.now() + 20 * 36e5).toISOString(), reason: "Card reader won't connect" }]);
      return;
    }
    if (admin.gate === "live") setList(await rpc<On[]>("admin_support_on").catch(() => []));
  }, [admin.gate]);
  useEffect(() => { void load(); }, [load]);

  const open = (s: On) => {
    if (admin.gate === "demo") return admin.say("Test version: opens the salon's screens when you sign in as an admin");
    openSupport({ salonId: s.salon_id, name: s.salon_name, until: s.until }); location.href = "/today";
  };
  const end = async (s: On) => {
    if (admin.gate === "demo") { setList((l) => l.filter((x) => x.salon_id !== s.salon_id)); return admin.say(`Support ended · ${s.salon_name}`); }
    try { await rpc("support_end", { p_salon: s.salon_id }); admin.say(`Support ended · ${s.salon_name}`); void load(); } catch (e) { admin.say((e as Error).message); }
  };

  return (
    <AdminShell tab="support" admin={admin} title="Support">
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="admin-support">
        <h1 className="h1">Support on now</h1>
        <p className="cap">Only salons whose owner turned on Settings → Support. It ends by itself after 24h. Everything you change inside is logged and the owner sees it.</p>
        <ListGroup>
          {list.map((s) => (
            <Row key={s.salon_id} size="m" title={<b style={{ fontWeight: 600 }}>{s.salon_name}</b>}
              sub={`Until ${when(s.until)}${s.reason ? ` · “${s.reason}”` : ""}`}
              right={<span style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button size="sm" variant="primary" onClick={() => open(s)} data-testid="open-salon">Open their screens</Button>
                <Button size="sm" onClick={() => void end(s)}>End now</Button>
              </span>} />
          ))}
          {!list.length && <Row title={<span className="cap">No salon has support on. Ask the owner: Settings → Support → Turn on for 24h.</span>} />}
        </ListGroup>
      </section>
    </AdminShell>
  );
}
