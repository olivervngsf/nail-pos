"use client";
// Settings → Clock-in (Nov 19): stop clock-ins from home. Salon devices always work (face + PIN). The owner/manager picks
// how staff phones may clock in: not at all, by scanning the QR on the time clock, on the salon Wi-Fi, or either.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Toast } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { rpc } from "@/lib/auth";
import { PHONE_RULES, RULE_TEXT, WIFI_NOTE, allowsWifi, saveSalonWifi, type PhoneRule } from "@/lib/clockrule";
import SettingsShell, { type Access } from "../SettingsShell";

type Wifi = { id: string; label: string; added_at: string };

export default function ClockInRules() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.clockIn")}>{(a) => <Rules a={a} />}</SettingsShell>;
}

function Rules({ a }: { a: Access }) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const L = (en: string, v: string) => (vi ? v : en);
  const [rule, setRule] = useState<PhoneRule>("off");
  const [wifi, setWifi] = useState<Wifi[]>([]);
  const [label, setLabel] = useState("Salon Wi-Fi");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    if (a.demo) return;
    void rpc<{ phone: PhoneRule; wifi: Wifi[] | null }>("clock_rules_get", { p_salon: a.salonId })
      .then((r) => { if (r) { setRule(r.phone); setWifi(r.wifi ?? []); } }).catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId]);

  const pick = async (p: PhoneRule) => {
    setErr(""); const old = rule; setRule(p);
    try {
      if (!a.demo) { const r = await rpc<{ phone: PhoneRule; wifi: Wifi[] }>("clock_rules_save", { p_salon: a.salonId, p_phone: p }); setRule(r.phone); setWifi(r.wifi ?? []); }
      say(L("Saved", "Đã lưu"));
    } catch (e) { setRule(old); setErr((e as Error).message); }
  };
  const addWifi = async () => {
    setErr("");
    try {
      if (a.demo) { setWifi((w) => [...w, { id: String(Date.now()), label, added_at: new Date().toISOString() }]); }
      else { const r = await saveSalonWifi(a.salonId, label); setWifi(r.wifi ?? []); }
      say(L("Salon Wi-Fi saved", "Đã lưu Wi-Fi tiệm"));
    } catch (e) { setErr((e as Error).message); }
  };
  const removeWifi = async (id: string) => {
    try { if (!a.demo) await rpc("clock_wifi_remove", { p_salon: a.salonId, p_id: id }); setWifi((w) => w.filter((x) => x.id !== id)); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }} data-testid="clock-in-rules">
      <div className="note">{L(
        "No clock-ins from home. The salon's own devices (time clock tablet, front desk) always work with face + PIN. Here you choose if and how staff may clock in on their own phone.",
        "Không chấm công ở nhà. Máy của tiệm (máy chấm công, quầy) luôn chấm được bằng mặt + PIN. Ở đây bạn chọn thợ có được chấm công bằng điện thoại riêng không, và bằng cách nào.")}</div>

      <div className="eyebrow">{L("Staff phones", "Điện thoại của thợ")}</div>
      <div className="group">
        {PHONE_RULES.map((p) => {
          const [title, note] = RULE_TEXT[p][vi ? "vi" : "en"];
          return (
            <button key={p} type="button" className={`opt set-row${rule === p ? " on" : ""}`} aria-pressed={rule === p} data-testid={`rule-${p}`} onClick={() => void pick(p)}>
              <span className="g" style={{ flex: 1, minWidth: 0 }}><b>{title}{p === "off" ? ` · ${L("safest", "an toàn nhất")}` : p === "qr" ? ` · ${L("works on every phone", "điện thoại nào cũng được")}` : ""}</b><span className="cap">{note}</span></span>
              <span aria-hidden>{rule === p ? "●" : "○"}</span>
            </button>
          );
        })}
      </div>

      {allowsWifi(rule) && <>
        <div className="eyebrow">{L("Salon Wi-Fi", "Wi-Fi của tiệm")}</div>
        <div className="note">{vi ? WIFI_NOTE.vi : WIFI_NOTE.en}</div>
        <div className="group">
          {wifi.map((w) => (
            <div key={w.id} className="row s"><span className="g">{w.label}<span className="cap">{L("saved", "đã lưu")} {new Date(w.added_at).toLocaleDateString()}</span></span>
              <Button size="sm" onClick={() => void removeWifi(w.id)}>{L("Remove", "Xoá")}</Button></div>
          ))}
          {!wifi.length && <div className="row s"><span className="cap">{L("No salon Wi-Fi saved yet. Phones can't clock in by Wi-Fi until you save one.", "Chưa lưu Wi-Fi tiệm. Điện thoại chưa chấm công bằng Wi-Fi được cho tới khi lưu.")}</span></div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="inp" style={{ maxWidth: 220 }} aria-label={L("Name", "Tên")} value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button variant="primary" data-testid="save-wifi" onClick={() => void addWifi()}>{L("Save this Wi-Fi", "Lưu Wi-Fi này")}</Button>
        </div>
        <div className="cap">{L("Do this while this device is connected to the salon Wi-Fi (e.g. on the front desk computer). It saves the salon's internet address, not the password.",
          "Làm việc này khi máy đang dùng Wi-Fi của tiệm (ví dụ máy tính ở quầy). Chỉ lưu địa chỉ internet của tiệm, không lưu mật khẩu.")}</div>
      </>}

      <div className="eyebrow">{L("Always", "Luôn luôn")}</div>
      <ul className="cap" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        <li>{L("Every clock-in and clock-out is saved with where it came from: salon device, QR or Wi-Fi.", "Mỗi lần chấm vào/ra đều ghi lại từ đâu: máy tiệm, QR hay Wi-Fi.")}</li>
        <li>{L("Refused tries are logged too (Settings → PIN activity).", "Lần bị từ chối cũng được ghi lại (Cài đặt → Lịch sử PIN).")}</li>
        <li>{L("Forgot to clock in? A manager fixes it with their PIN, and the fix is logged.", "Quên chấm công? Quản lý sửa bằng PIN, có ghi lại.")}</li>
      </ul>
      {err && <p className="hint err">{err}</p>}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
