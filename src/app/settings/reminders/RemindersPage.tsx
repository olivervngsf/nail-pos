"use client";
// Settings → Booking reminders: when clients get reminded (owner/manager). Confirmation always goes right after
// booking; reminders 1 and 2 at the hours picked here; a test mode sends the 2nd one 3 minutes after booking (24h).
// Saved on the salon (reminder_settings_save); the database applies it to every reminder it queues.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Banner, Button, Segmented, Switch, Toast } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { rpc } from "@/lib/auth";
import { DEFAULT_PREFS, FIRST_HOURS, SECOND_HOURS, hoursLabel, plan, testOn, type ReminderPrefs } from "@/lib/booking/reminderPrefs";
import SettingsShell, { type Access } from "../SettingsShell";

export default function RemindersPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.reminders")}>{(a) => <Form a={a} />}</SettingsShell>;
}

function Form({ a }: { a: Access }) {
  const { lang } = useLang();
  const T = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [p, setP] = useState<ReminderPrefs | null>(null);
  const [first, setFirst] = useState("24");
  const [second, setSecond] = useState("2");
  const [test, setTest] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const load = (x: ReminderPrefs) => { setP(x); setFirst(String(x.first)); setSecond(String(x.second)); setTest(testOn(x)); };

  useEffect(() => {
    if (a.demo) { load(DEFAULT_PREFS); return; }
    void rpc<ReminderPrefs>("reminder_settings_get", { p_salon: a.salonId }).then(load).catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId]);

  if (!p) return <div className="card pad" aria-busy="true">{err || T("Loading…", "Đang tải…")}</div>;
  const draft: ReminderPrefs = { first: +first, second: +second, testUntil: test ? (testOn(p) ? p.testUntil : new Date(Date.now() + 864e5).toISOString()) : null };
  const changed = draft.first !== p.first || draft.second !== p.second || test !== testOn(p);
  const lg = lang === "vi" ? "vi" : "en";

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      if (a.demo) load(draft);
      else load(await rpc<ReminderPrefs>("reminder_settings_save", { p_salon: a.salonId, p: { first: draft.first, second: draft.second, test } }));
      setToast(T("Saved", "Đã lưu")); setTimeout(() => setToast(""), 2400);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="biz" data-testid="reminders">
      {a.demo && <div className="demo">{T("Test version: saved on this device only, nothing is sent.", "Bản thử: chỉ lưu trên máy này, không gửi gì.")}</div>}
      <p className="cap" style={{ margin: 0 }} data-testid="rem-plan">{plan(draft, lg)}</p>
      {err && <p className="hint err" role="alert">{err}</p>}

      <section className="card pad in2 biz-card">
        <div className="eyebrow">{T("When clients get reminded", "Khi nào khách được nhắc")}</div>
        <div>
          <span className="lbl">{T("1st reminder", "Nhắc lần 1")}</span>
          <Segmented label={T("1st reminder", "Nhắc lần 1")} value={first} onChange={setFirst}
            options={FIRST_HOURS.map((h) => ({ value: String(h), label: hoursLabel(h, lg) }))} />
        </div>
        <div>
          <span className="lbl">{T("2nd reminder", "Nhắc lần 2")}</span>
          <Segmented label={T("2nd reminder", "Nhắc lần 2")} value={second} onChange={setSecond}
            options={SECOND_HOURS.map((h) => ({ value: String(h), label: hoursLabel(h, lg) }))} />
        </div>
        <div className="hint">{T("The confirmation always goes right after booking. Reminders never go out between 9 PM and 8 AM (they wait until morning). A reminder whose time already passed when the client booked is skipped. Changes apply to new bookings and to bookings that are moved.",
          "Tin xác nhận luôn gửi ngay sau khi đặt. Nhắc lịch không gửi từ 9 giờ tối đến 8 giờ sáng (đợi đến sáng). Nếu giờ nhắc đã qua lúc khách đặt thì bỏ qua. Thay đổi áp dụng cho lịch mới và lịch được dời.")}</div>
      </section>

      <section className="card pad in2 biz-card">
        <div className="eyebrow">{T("How it goes out", "Gửi bằng cách nào")}</div>
        <div className="hint" style={{ margin: 0 }}>{T("By email now. By text once your salon's texting number is on (Settings → Texting). Every send shows in", "Bằng email ngay bây giờ. Bằng tin nhắn khi số nhắn tin của tiệm được bật (Cài đặt → Tin nhắn). Mọi lần gửi đều hiện trong")} <Link href="/settings/texting">{T("Texting → Messages", "Tin nhắn → Tin đã gửi")}</Link>.</div>
      </section>

      <section className="card pad in3 biz-card">
        <div className="row s" style={{ padding: 0 }}>
          <span className="g">{T("Test reminders (24h)", "Thử nhắc lịch (24h)")}<span className="cap">{T("For trying it yourself: the 2nd reminder of each new booking goes 3 minutes after booking. Turns itself off after 24h.", "Để tự thử: nhắc lần 2 của mỗi lịch mới gửi 3 phút sau khi đặt. Tự tắt sau 24h.")}
            {testOn(p) && p.testUntil && <> {T("On until", "Bật đến")} {new Date(p.testUntil).toLocaleString(lg === "vi" ? "vi-VN" : "en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.</>}</span></span>
          <Switch label={T("Test reminders (24h)", "Thử nhắc lịch (24h)")} on={test} onChange={setTest} />
        </div>
        {test && +second === 0 && <Banner tone="warn">{T("Pick a 2nd reminder time so the test has something to send.", "Chọn giờ nhắc lần 2 để có tin thử.")}</Banner>}
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="primary" disabled={busy || !changed || (test && +second === 0)} onClick={() => void save()} data-testid="rem-save">{busy ? T("Saving…", "Đang lưu…") : T("Save", "Lưu")}</Button>
        </div>
      </section>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
