"use client";
// Settings → Salon (Nov 25): name, phone, address, state, time zone + opening hours, the same facts as setup steps 1–2.
// Owner/manager saves (salon_info_save, logged). The menu has its own page (Settings → Service menu).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Banner, Segmented, Switch, Toast } from "@/components/kit";
import { getWeekStart, setWeekStartLocal, type WeekStart } from "@/lib/weekStart";
import { useLang } from "@/components/AppProviders";
import { api } from "@/lib/api";
import { rpc } from "@/lib/auth";
import { addressOk, parseAddress } from "@/lib/stripe/address";
import { STATES } from "@/lib/onboarding/data";
import { dayName, fullWeek, infoProblem, sampleInfo, TIME_ZONES, US_STATES, type DayHours, type SalonInfo } from "@/lib/salonInfo";
import SettingsShell, { SaveCheck, type Access } from "../SettingsShell";

export default function SalonInfoPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.salon")}>{(a) => <Info a={a} />}</SettingsShell>;
}

function Info({ a }: { a: Access }) {
  const ta = useTranslations("settings.salon");
  const { lang } = useLang();
  const L = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [saved, setSaved] = useState<SalonInfo | null>(null);
  const [s, setS] = useState<SalonInfo | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const load = (r: SalonInfo) => { const v = { ...r, phone: r.phone ?? "", address: r.address ?? "", hours: fullWeek(r.hours ?? []) }; setSaved(v); setS(v); };
  // Week starts on (Nov 26): Monday by default; saved on its own (week_start_save) with the same Save button.
  const [ws, setWs] = useState<WeekStart>(getWeekStart());
  const [wsSaved, setWsSaved] = useState<WeekStart>(getWeekStart());
  const loadWs = (v: WeekStart) => { setWs(v); setWsSaved(v); setWeekStartLocal(v); };

  useEffect(() => {
    if (a.demo) { load(sampleInfo()); return; }
    void rpc<SalonInfo>("salon_info_get", { p_salon: a.salonId }).then(load).catch((e: Error) => setErr(e.message));
    void rpc<number>("week_start_get", { p_salon: a.salonId }).then((v) => loadWs(v === 0 ? 0 : 1)).catch(() => { /* keep the device copy */ });
  }, [a.demo, a.salonId]);

  if (!s || !saved) return <div className="card pad" aria-busy="true">{err || L("Loading…", "Đang tải…")}</div>;
  const set = (p: Partial<SalonInfo>) => setS({ ...s, ...p });
  const setDay = (i: number, p: Partial<DayHours>) => set({ hours: s.hours.map((h) => (h.weekday === i ? { ...h, ...p } : h)) });
  const infoChanged = JSON.stringify({ ...s, services: [] }) !== JSON.stringify({ ...saved, services: [] });
  const changed = infoChanged || ws !== wsSaved;
  // Hours follow the salon's week: Sunday first when the week starts Sunday (weekday 6 = Sunday here).
  const hoursShown = ws === 0 ? [...s.hours.filter((h) => h.weekday === 6), ...s.hours.filter((h) => h.weekday !== 6)] : s.hours;
  const parts = parseAddress(s.address, s.state);
  const addrOk = addressOk(parts);
  const addrChanged = s.address.trim() !== saved.address.trim();
  const missing = [parts.line1 === "Salon" && ta("street"), !parts.city && ta("city"), !parts.postal_code && ta("zip")].filter(Boolean) as string[];
  // Card payments need a full address (Stripe location), so a changed address must be full before it saves.
  const problem = infoProblem(s) || (addrChanged && !addrOk ? "address" : "");

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      let note = L("Saved", "Đã lưu");
      if (!a.demo && addrChanged) {
        // Same check + Stripe location update as before; card readers and Tap to Pay keep working on the new address.
        const r = await api<{ stripe: string }>("/api/salon/address", { salonId: a.salonId, address: s.address });
        if (r.stripe === "failed") note = ta("savedStripeFailed");
      }
      if (!a.demo && infoChanged) load(await rpc<SalonInfo>("salon_info_save", { p_salon: a.salonId, p: { name: s.name, phone: s.phone, address: s.address, state: s.state, time_zone: s.time_zone, hours: s.hours } }));
      else setSaved(s);
      if (ws !== wsSaved) loadWs(a.demo ? ws : ((await rpc<number>("week_start_save", { p_salon: a.salonId, p_day: ws })) === 0 ? 0 : 1));
      say(note);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="si-page" data-testid="salon-info">
      {!addressOk(parseAddress(saved.address, saved.state)) && <Banner tone="warn" data-testid="address-needed">{ta("needed")}</Banner>}
      <div className="eyebrow">{L("Salon", "Tiệm")}</div>
      <section className="card pad si-grid">
        <div className="si-full">
          <label className="lbl" htmlFor="si-name">{L("Salon name", "Tên tiệm")}</label>
          <input id="si-name" className={`inp${problem === "name" ? " err" : ""}`} value={s.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} data-testid="si-name" />
          <div className="hint">{L("Shown on receipts, the booking page and texts.", "Hiện trên hoá đơn, trang đặt hẹn và tin nhắn.")}</div>
        </div>
        <div>
          <label className="lbl" htmlFor="si-phone">{L("Salon phone", "Số điện thoại tiệm")}</label>
          <input id="si-phone" className="inp" type="tel" autoComplete="tel" value={s.phone} maxLength={30} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div>
          <label className="lbl" htmlFor="si-tz">{L("Time zone", "Múi giờ")}</label>
          <select id="si-tz" className="inp" value={s.time_zone} onChange={(e) => set({ time_zone: e.target.value })}>
            {!TIME_ZONES.some(([z]) => z === s.time_zone) && <option value={s.time_zone}>{s.time_zone}</option>}
            {TIME_ZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}
          </select>
        </div>
        <div className="si-full">
          <label className="lbl" htmlFor="si-addr">{L("Address", "Địa chỉ")}</label>
          <input id="si-addr" className={`inp${addrChanged && !addrOk ? " err" : ""}`} autoComplete="street-address" value={s.address} maxLength={200} placeholder="1550 S Bascom Ave, Campbell, CA 95008" onChange={(e) => set({ address: e.target.value })} data-testid="address-input" />
          <div className="si-addr-parts" data-testid="address-parts">
            <span><span className="cap">{ta("street")}</span> <b>{parts.line1 === "Salon" ? "—" : parts.line1}</b></span>
            <span><span className="cap">{ta("city")}</span> <b>{parts.city || "—"}</b></span>
            <span><span className="cap">{ta("state")}</span> <b>{parts.state}</b></span>
            <span><span className="cap">{ta("zip")}</span> <b>{parts.postal_code || "—"}</b></span>
          </div>
          <div className="hint" data-testid="address-check" style={{ color: addrOk ? undefined : "#b5470a" }}>{addrOk ? ta("ready") : ta("missing", { parts: missing.join(", ") })}</div>
        </div>
        <div>
          <label className="lbl" htmlFor="si-state">{L("State", "Tiểu bang")}</label>
          <select id="si-state" className="inp" value={s.state} onChange={(e) => set({ state: e.target.value })}>
            {US_STATES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        {STATES[s.state] && <div className="note si-full">{STATES[s.state]}</div>}
      </section>

      <div className="eyebrow">{L("Opening hours", "Giờ mở cửa")}</div>
      <section className="card si-hours">
        <div className="si-day si-week" data-testid="week-start">
          <span className="si-wk-t"><b>{L("Week starts on", "Tuần bắt đầu")}</b><span className="cap">{L("Calendar, date pickers, \"This week\" pay and timesheets", "Lịch, chọn ngày, lương và bảng giờ \"Tuần này\"")}</span></span>
          <Segmented label={L("Week starts on", "Tuần bắt đầu")} value={String(ws)} onChange={(v) => setWs(v === "0" ? 0 : 1)}
            options={[{ value: "1", label: L("Monday", "Thứ Hai") }, { value: "0", label: L("Sunday", "Chủ Nhật") }]} />
        </div>
        {hoursShown.map((h) => (
          <div key={h.weekday} className="si-day" data-testid={`si-day-${h.weekday}`}>
            <b className="si-dn">{dayName(h.weekday)}</b>
            <Switch on={h.on} onChange={(on) => setDay(h.weekday, { on })} label={`${dayName(h.weekday)} ${L("open", "mở")}`} />
            {h.on
              ? <span className="si-times">
                  <TimePick bad={h.close <= h.open} value={h.open} label={`${dayName(h.weekday)} ${L("opens", "mở")}`} onChange={(v) => setDay(h.weekday, { open: v })} />
                  <span className="cap">–</span>
                  <TimePick bad={h.close <= h.open} value={h.close} label={`${dayName(h.weekday)} ${L("closes", "đóng")}`} onChange={(v) => setDay(h.weekday, { close: v })} />
                </span>
              : <span className="cap si-times">{L("Closed", "Nghỉ")}</span>}
          </div>
        ))}
      </section>
      {problem === "hours" && <div className="hint err">{L("Closing time must be after opening time.", "Giờ đóng phải sau giờ mở.")}</div>}

      <div className="eyebrow">{L("More from setup", "Các mục khác từ lúc cài đặt")}</div>
      <div className="group">
        {([["/settings/menu", L("Service menu", "Bảng dịch vụ"), L("Services, prices, minutes", "Dịch vụ, giá, thời gian")],
           ["/settings/team", L("Team", "Nhân viên"), L("Staff, roles, pay, PIN", "Thợ, vai trò, lương, PIN")],
           ["/settings/payments", L("Payments", "Thanh toán"), L("Stripe account", "Tài khoản Stripe")],
           ["/settings/reader", L("Card reader", "Máy quẹt thẻ"), L("Pair or remove", "Kết nối hoặc gỡ")],
           ["/settings/printer", L("Printer", "Máy in"), L("Receipt + slips", "Hoá đơn + phiếu")],
           ["/settings/devices", L("Devices", "Thiết bị"), L("Salon iPads + phones", "iPad + điện thoại của tiệm")]] as const).map(([href, title, note]) => (
          <Link key={href} href={href} className="opt set-row" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="g" style={{ flex: 1 }}><b>{title}</b><span className="cap">{note}</span></span><span className="cap" aria-hidden>›</span>
          </Link>
        ))}
      </div>

      {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}
      {a.demo && <div className="demo">{L("Test version: changes stay on this screen.", "Bản thử: thay đổi chỉ ở màn hình này.")}</div>}
      <SaveCheck dirty={changed} busy={busy} disabled={!!problem} onSave={() => void save()} onUndo={() => setS(saved)} testId="si-save" />
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

// Hours as a plain list of 15-minute times (same as setup), not the browser's clock picker.
const TIMES = Array.from({ length: (23 - 5) * 4 + 1 }, (_, i) => {
  const m = 5 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const twelve = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
function TimePick({ value, label, bad, onChange }: { value: string; label: string; bad: boolean; onChange: (v: string) => void }) {
  const v = value.slice(0, 5);
  const list = TIMES.includes(v) ? TIMES : [...TIMES, v].sort();
  return (
    <select className={`inp si-time${bad ? " err" : ""}`} aria-label={label} value={v} onChange={(e) => onChange(e.target.value)}>
      {list.map((t) => <option key={t} value={t}>{twelve(t)}</option>)}
    </select>
  );
}
