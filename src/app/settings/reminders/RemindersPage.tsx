"use client";
// Settings → Booking reminders: when clients get reminded (owner/manager). Confirmation always goes right after
// booking; reminders 1 and 2 at the hours picked here; a test mode sends the 2nd one 3 minutes after booking (24h).
// Saved on the salon (reminder_settings_save); the database applies it to every reminder it queues.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Banner, Button, ListGroup, Row, Segmented, StatusPill, Switch, Toast } from "@/components/kit";
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

  const onUntil = testOn(p) && p.testUntil ? new Date(p.testUntil).toLocaleString(lg === "vi" ? "vi-VN" : "en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : "";

  return (
    <div className="si-page rem-page" data-testid="reminders">
      {a.demo && <div className="demo">{T("Test version: saved on this device only, nothing is sent.", "Bản thử: chỉ lưu trên máy này, không gửi gì.")}</div>}
      <p className="rem-lead" data-testid="rem-plan">{plan(draft, lg)}</p>
      {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}

      <div className="eyebrow">{T("When clients get reminded", "Khi nào khách được nhắc")}</div>
      <ListGroup>
        <Row size="l" className="rem-row" title={T("1st reminder", "Nhắc lần 1")} sub={T("Hours before the booking · usually the day before", "Số giờ trước lịch hẹn · thường là hôm trước")}
          right={<Segmented label={T("1st reminder", "Nhắc lần 1")} value={first} onChange={setFirst}
            options={FIRST_HOURS.map((h) => ({ value: String(h), label: h ? `${h}h` : hoursLabel(0, lg) }))} />} />
        <Row size="l" className="rem-row" title={T("2nd reminder", "Nhắc lần 2")} sub={T("Hours before the booking · a nudge on the day", "Số giờ trước lịch hẹn · nhắc lại trong ngày")}
          right={<Segmented label={T("2nd reminder", "Nhắc lần 2")} value={second} onChange={setSecond}
            options={SECOND_HOURS.map((h) => ({ value: String(h), label: h ? `${h}h` : hoursLabel(0, lg) }))} />} />
      </ListGroup>
      <ul className="rem-notes">
        <li>{T("The confirmation always goes right after booking.", "Tin xác nhận luôn gửi ngay sau khi đặt.")}</li>
        <li>{T("Nothing goes out 9 PM – 8 AM: reminders wait until morning.", "Không gửi từ 9 giờ tối đến 8 giờ sáng: nhắc lịch đợi đến sáng.")}</li>
        <li>{T("Booked too late for a reminder? That one is skipped.", "Đặt quá sát giờ nhắc? Lần nhắc đó bỏ qua.")}</li>
        <li>{T("Changes apply to new and moved bookings.", "Thay đổi áp dụng cho lịch mới và lịch được dời.")}</li>
      </ul>

      <div className="eyebrow">{T("How it goes out", "Gửi bằng cách nào")}</div>
      <ListGroup>
        <Row size="l" title={T("Email", "Email")} sub={T("Sends now", "Đang gửi")} right={<StatusPill tone="ok">{T("On", "Bật")}</StatusPill>} />
        <Row size="l" title={T("Text", "Tin nhắn")} sub={T("Starts once your salon's texting number is on", "Bắt đầu khi số nhắn tin của tiệm được bật")}
/>
        <Link href="/settings/texting" className="row l rem-link"><span className="g">{T("See every send", "Xem mọi lần gửi")}<span className="cap">{T("Texting → Messages", "Tin nhắn → Tin đã gửi")}</span></span><span aria-hidden className="rem-chev">›</span></Link>
      </ListGroup>

      <div className="eyebrow">{T("Try it yourself", "Tự thử")}</div>
      <ListGroup>
        <Row size="l" title={T("Test reminders", "Thử nhắc lịch")}
          sub={<>{T("2nd reminder goes 3 minutes after booking. Turns off by itself after 24h.", "Nhắc lần 2 gửi 3 phút sau khi đặt. Tự tắt sau 24h.")}{onUntil && <> {T("On until", "Bật đến")} {onUntil}.</>}</>}
          right={<Switch label={T("Test reminders", "Thử nhắc lịch")} on={test} onChange={setTest} />} />
      </ListGroup>
      {test && +second === 0 && <Banner tone="warn">{T("Pick a 2nd reminder time so the test has something to send.", "Chọn giờ nhắc lần 2 để có tin thử.")}</Banner>}

      <div className="si-bar">
        <span className="cap">{changed ? T("Not saved yet", "Chưa lưu") : ""}</span>
        <Button variant="primary" disabled={busy || !changed || (test && +second === 0)} onClick={() => void save()} data-testid="rem-save">{busy ? T("Saving…", "Đang lưu…") : T("Save", "Lưu")}</Button>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
