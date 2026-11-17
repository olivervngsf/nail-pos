"use client";
// Owner/manager on Today: card payments status (Stripe connected? reader paired?) with the next step.
import { useEffect, useState } from "react";
import { Button, Card, Tag } from "@/components/kit";
import { api } from "@/lib/api";
import { rpc } from "@/lib/auth";

type St = { on?: boolean; connected?: boolean; chargesEnabled?: boolean; detailsSubmitted?: boolean; test?: boolean; missing?: string[] };

export default function PaymentsCard({ salonId }: { salonId: string }) {
  const [st, setSt] = useState<St | null>(null);
  const [readers, setReaders] = useState<{ id: string; label: string; simulated: boolean }[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setSt(await api<St>("/api/stripe/status", { salonId }));
      const p = await rpc<{ readers: typeof readers } | null>("salon_pay_setup", { p_salon: salonId });
      setReaders(p?.readers ?? []);
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { void load(); }, [salonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy(true); setErr("");
    try { location.href = (await api<{ url: string }>("/api/stripe/connect", { salonId, back: "/today" })).url; }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const testReader = async () => {
    setBusy(true); setErr("");
    try { await api("/api/stripe/reader", { salonId, code: "simulated-s710", label: "Front desk (test)" }); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  if (!st) return null;
  const ready = !!st.chargesEnabled;
  return (
    <Card pad>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ flex: 1 }}>Card payments</b>
        {st.test && <Tag>Test mode</Tag>}{ready ? <Tag tone="jade">On</Tag> : <span className="tag warn">Not set up</span>}</span>
      {st.on === false ? <span className="cap">Not switched on for this site yet (Stripe key missing).</span>
        : !ready ? <>
          <span className="cap">{st.connected ? (st.missing?.length ? `Stripe still needs: ${st.missing.join(" · ")}` : "Stripe is checking your details. Refresh in a minute.") : "Connect your salon's own Stripe account. Money goes straight to your bank."}</span>
          <div><Button className="stripe" disabled={busy} data-testid="connect-stripe" onClick={() => void connect()}>{st.connected ? "Continue with Stripe" : "Connect with Stripe"}</Button></div>
        </> : <>
          <span className="cap">{readers.length ? `Readers: ${readers.map((r) => r.label).join(", ")}` : "No card reader yet. QR / pay link works now."}</span>
          {!readers.length && st.test && <div><Button disabled={busy} onClick={() => void testReader()}>Add a test reader</Button></div>}
        </>}
      {err && <span className="hint err">{err}</span>}
    </Card>
  );
}
