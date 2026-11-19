"use client";
// The time clock tablet shows this when the salon lets staff phones clock in by QR (Settings → Clock-in).
// The code changes every 30 seconds (server `clock_qr`), so a photo taken home is useless.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { rpc } from "@/lib/auth";
import { allowsQr, type PhoneRule } from "@/lib/clockrule";

export default function ClockQr({ salonId, demo, vi }: { salonId: string; demo: boolean; vi: boolean }) {
  const [rule, setRule] = useState<PhoneRule>(demo ? "qr" : "off");
  const [svg, setSvg] = useState("");
  const [left, setLeft] = useState(30);

  useEffect(() => {
    if (demo) return;
    void rpc<{ phone: PhoneRule } | null>("clock_rules_get", { p_salon: salonId }).then((r) => r && setRule(r.phone)).catch(() => {});
  }, [demo, salonId]);

  useEffect(() => {
    if (!allowsQr(rule)) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = demo ? { code: "DEMO123456", seconds_left: 30 - (Math.floor(Date.now() / 1000) % 30) }
          : await rpc<{ code: string; seconds_left: number }>("clock_qr", { p_salon: salonId });
        if (stop) return;
        setLeft(r.seconds_left);
        setSvg(await QRCode.toString(`${location.origin}/t/clock?s=${salonId}&c=${r.code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
      } catch { /* offline: phones can't clock in by QR right now; the faces + PIN still work */ }
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => { stop = true; clearInterval(id); };
  }, [rule, demo, salonId]);

  if (!allowsQr(rule) || !svg) return null;
  return (
    <div className="clock-qr card pad" data-testid="clock-qr">
      <span role="img" aria-label={vi ? "Mã QR chấm công" : "Clock-in QR code"} dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="g"><b>{vi ? "Chấm công bằng điện thoại" : "Clock in on your phone"}</b>
        <span className="cap">{vi ? `Mở camera, quét mã. Mã đổi sau ${left} giây.` : `Open your camera and scan. New code in ${left} s.`}</span></span>
    </div>
  );
}
