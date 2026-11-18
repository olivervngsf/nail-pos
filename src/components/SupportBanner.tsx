"use client";
// Green strip on every screen while a PolishOS admin is inside a salon in support mode (Founder Admin A4):
// salon, time left, "everything is logged", End now. Set by /admin "Open salon"; cleared when the window ends.
import { useEffect, useState } from "react";
import { rpc } from "@/lib/auth";

const KEY = "nailpos.support";
type Open = { salonId: string; name: string; until: string };

export function openSupport(o: Open) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); localStorage.setItem("nailpos.salon", o.salonId); localStorage.removeItem("nailpos.me"); } catch { /* storage blocked */ }
}
export function closeSupport() {
  try { localStorage.removeItem(KEY); localStorage.removeItem("nailpos.salon"); localStorage.removeItem("nailpos.me"); } catch { /* storage blocked */ }
}
const read = (): Open | null => { try { const r = localStorage.getItem(KEY); return r ? (JSON.parse(r) as Open) : null; } catch { return null; } };

export default function SupportBanner() {
  const [o, setO] = useState<Open | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    setO(read());
    const h = setInterval(() => { tick((n) => n + 1); setO(read()); }, 30_000);
    return () => clearInterval(h);
  }, []);
  if (!o) return null;
  const left = new Date(o.until).getTime() - Date.now();
  const end = async () => {
    await rpc("support_end", { p_salon: o.salonId }).catch(() => null);
    closeSupport(); location.href = "/admin";
  };
  if (left <= 0) { closeSupport(); return null; }
  const h = Math.floor(left / 36e5), m = Math.floor((left % 36e5) / 6e4);
  return (
    <div className="banner ok support-banner" role="status" data-testid="support-banner">
      <b>Support mode · {o.name}</b>
      <span className="grow">{h} h {m} min left · everything you change is logged and the owner sees it</span>
      <button type="button" className="btn sm" onClick={() => { closeSupport(); location.href = "/admin"; }}>Back to admin</button>
      <button type="button" className="btn sm" onClick={() => void end()}>End now</button>
    </div>
  );
}
