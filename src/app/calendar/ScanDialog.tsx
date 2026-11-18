"use client";
// Scan a receipt or ticket slip QR with the camera (browsers that can read QR codes: Chrome on Android, desktop Chrome/Edge).
// Elsewhere (iPhone/iPad Safari) it says so and offers the desk scanner or typing the ticket number. Nothing is uploaded.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer } from "@/components/kit";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

export function ScanDialog({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const t = useTranslations("calendar");
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "on" | "none" | "denied">("starting");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) { setState("none"); return; }
    let stream: MediaStream | null = null, timer: ReturnType<typeof setInterval> | undefined, done = false;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (done || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setState("on");
        const det = new Ctor({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (!video.current || done) return;
          const hit = (await det.detect(video.current).catch(() => []))[0];
          if (hit?.rawValue) { done = true; navigator.vibrate?.(20); onCode(hit.rawValue); }
        }, 250);
      } catch { setState("denied"); }
    })();
    return () => { done = true; clearInterval(timer); stream?.getTracks().forEach((x) => x.stop()); };
  }, [onCode]);

  return (
    <Drawer title={t("scanTitle")} onClose={onClose}>
      {state !== "none" && state !== "denied" && <div className="scan-box">
        <video ref={video} muted playsInline aria-label={t("scanTitle")} />
        <span className="scan-frame" aria-hidden />
        <span className="scan-hint">{state === "starting" ? "…" : t("scanHint")}</span>
      </div>}
      {state === "none" && <div className="cap" style={{ background: "#F5F5F7", borderRadius: 10, padding: "10px 12px" }} data-testid="scan-nocam">{t("scanNoCam")}</div>}
      {state === "denied" && <div className="hint err">{t("scanCamErr")}</div>}
      <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (typed.trim()) onCode(typed); }}>
        <input className="inp" placeholder={t("scanManual")} aria-label={t("scanManual")} value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="scan-typed" style={{ height: 44 }} />
        <Button type="submit" variant="primary" data-testid="scan-open">{t("scanOpen")}</Button>
      </form>
      <span className="cap">{t("scanDesk")}</span>
    </Drawer>
  );
}
