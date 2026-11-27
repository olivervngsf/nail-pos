"use client";
// Green strip on every screen while a PolishOS admin is inside a salon in support mode (Founder Admin A4):
// salon, time left, "everything is logged", End now. Set by /admin "Open salon"; cleared when the window ends.
// X folds it into a small "Support 23h" chip at the top (never fully hidden); tap the chip = the full strip again.
import { useEffect, useState } from "react";
import { rpc } from "@/lib/auth";
import { Banner } from "@/components/kit";
import { hide, isHidden, unhide } from "@/lib/banners";

const FOLD = "support-fold";

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
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    setO(read()); setFolded(isHidden(FOLD));
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
  if (folded) return (
    <button type="button" className="support-chip" data-testid="support-chip" aria-label={`Support mode · ${o.name}: open the message`} onClick={() => { unhide(FOLD); setFolded(false); }}>
      <span className="dot" aria-hidden />Support {h}h {m} min
    </button>
  );
  return (
    <Banner strip tone="info" className="support-banner" data-testid="support-banner" title={`Support mode · ${o.name}.`} onClose={() => { hide(FOLD, "visit"); setFolded(true); }}
      action={<>
        <button type="button" className="btn sm" onClick={() => { closeSupport(); location.href = "/admin"; }}>Back to admin</button>
        <button type="button" className="btn sm" onClick={() => void end()}>End now</button>
      </>}>
      {h}h {m} min left · everything you change is logged and the owner sees it
    </Banner>
  );
}
