"use client";
// Admin · Support (Founder Admin A4): salons whose owner turned support on (Settings → Support, 24 h). Open their screens
// (green Support mode strip on every page; every change logged for the owner) or End now. Nothing here without the owner's OK.
// Data: admin_support_on(), support_end() (migration 20261212000001_support_access).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SMS_ON, amPlatformAdmin, isSignedIn, rpc } from "@/lib/auth";
import { Button, ListGroup, Row, Toast, TopBar } from "@/components/kit";
import { openSupport } from "@/components/SupportBanner";

type On = { salon_id: string; salon_name: string; until: string; since: string; reason: string };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function AdminSupport() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "no" | "ok">("loading");
  const [list, setList] = useState<On[]>([]);
  const [toast, setToast] = useState("");
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(""), 3000); };
  const load = useCallback(async () => { setList(await rpc<On[]>("admin_support_on").catch(() => [])); }, []);

  useEffect(() => {
    if (!SMS_ON) { setState("no"); return; }
    void (async () => {
      if (!(await isSignedIn())) return router.replace("/login?next=/admin/support");
      if (!(await amPlatformAdmin())) { setState("no"); return; }
      setState("ok"); void load();
    })();
  }, [router, load]);

  if (state === "loading") return <div className="app" aria-busy="true" />;
  if (state === "no") return <main style={{ padding: 24 }}><p className="cap">Admins only.</p></main>;

  const open = (s: On) => { openSupport({ salonId: s.salon_id, name: s.salon_name, until: s.until }); location.href = "/today"; };
  const end = async (s: On) => {
    try { await rpc("support_end", { p_salon: s.salon_id }); say(`Support ended · ${s.salon_name}`); void load(); } catch (e) { say((e as Error).message); }
  };
  return (
    <div className="app" style={{ display: "block" }}>
      <TopBar title={<span><Link href="/admin" className="cap" style={{ textDecoration: "none" }}>‹ Admin</Link> &nbsp; Support</span>} />
      <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 980, width: "100%", margin: "0 auto" }} data-testid="admin-support">
        <h1 className="h1">Support on now</h1>
        <p className="cap">Only salons whose owner turned on Settings → Support. It ends by itself after 24 hours. Everything you change inside is logged and the owner sees it.</p>
        <ListGroup>
          {list.map((s) => (
            <Row key={s.salon_id} size="m" title={<b style={{ fontWeight: 600 }}>{s.salon_name}</b>}
              sub={`Until ${when(s.until)}${s.reason ? ` · “${s.reason}”` : ""}`}
              right={<span style={{ display: "flex", gap: 8 }}>
                <Button size="sm" variant="primary" onClick={() => open(s)} data-testid="open-salon">Open their screens</Button>
                <Button size="sm" onClick={() => void end(s)}>End now</Button>
              </span>} />
          ))}
          {!list.length && <Row title={<span className="cap">No salon has support on. Ask the owner: Settings → Support → Turn on for 24 hours.</span>} />}
        </ListGroup>
      </main>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
