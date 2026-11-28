"use client";
// Settings → Safety + records → Notifications (board "Settings, Activity log + Timesheet" → Notifications.dc.html):
// who gets alerts (owner + managers the owner picks), a daily summary at closing, and per alert Email / Text.
// Saved on the salon (notify_settings_save); the database queues alerts, /api/cron/notify sends them.
// Alerts not wired yet keep their switch and say "Starts soon".
import { useEffect, useState } from "react";
import { Banner, Chip, ListGroup, Row, Switch, Toast } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { rpc } from "@/lib/auth";
import { GROUPS, KINDS, channelOf, demoNotify, emptySettings, recipientsOf, type Group, type NotifyPerson, type NotifySettings } from "@/lib/notify";
import SettingsShell, { SaveCheck, type Access } from "../SettingsShell";

const WORDS: Record<string, [string, string, string, string]> = {
  refund_big: ["Refund or void over $50", "Ticket #, amount, and where to see who did it", "Hoàn tiền hoặc huỷ trên $50", "Số phiếu, số tiền, xem ai làm ở đâu"],
  discount_big: ["Discount over 20%", "Even when a manager OK'd it", "Giảm giá trên 20%", "Kể cả khi quản lý đã duyệt"],
  drawer_off: ["Cash drawer off at close", "Counted vs expected, more than $5 off", "Két tiền lệch khi đóng ngày", "Đếm được so với dự kiến, lệch hơn $5"],
  pin_locked: ["Someone is locked out by wrong PINs", "3 wrong tries in a row on any device", "Có người bị khoá vì sai PIN", "Sai 3 lần liên tiếp trên bất kỳ máy nào"],
  new_signin: ["New device signs in as you or a manager", "Not you? Sign it out from My sign-ins", "Máy mới đăng nhập bằng tài khoản bạn hoặc quản lý", "Không phải bạn? Đăng xuất ở Đăng nhập của tôi"],
  clock_refused: ["Clock-in refused 3+ times", "Usually someone trying from home", "Chấm công bị từ chối 3+ lần", "Thường là có người chấm công từ nhà"],
  meal_missed: ["Missed meal break", "California: by the 5th hour", "Bỏ giờ nghỉ ăn", "California: trước giờ thứ 5"],
  overtime: ["Overtime coming", "Someone will pass 8h today or 40h this week", "Sắp tăng ca", "Có người sắp quá 8h hôm nay hoặc 40h tuần này"],
  forgot_clockout: ["Forgot to clock out", "Needs a fix in the Timesheet", "Quên chấm giờ ra", "Cần sửa trong Bảng giờ làm"],
  license: ["License expires in 30 days", "Tech's state license", "Bằng hết hạn trong 30 ngày", "Bằng hành nghề của thợ"],
  device_off: ["A salon device is off over a day", "Front desk iPad, time clock, kiosk", "Máy của tiệm tắt hơn 1 ngày", "iPad quầy, máy chấm công, kiosk"],
  plan_failed: ["Plan payment failed", "We try again the next day", "Thanh toán gói thất bại", "Chúng tôi thử lại ngày hôm sau"],
  credit_low: ["Text credit is low", "Below your warn level", "Tín dụng tin nhắn sắp hết", "Dưới mức cảnh báo của bạn"],
};
const GROUP_WORDS: Record<Group, [string, string]> = { money: ["Money", "Tiền"], safety: ["Safety", "An toàn"], team: ["Team + time clock", "Nhân viên + chấm công"], devices: ["Devices + plan", "Thiết bị + gói"] };

export default function NotificationsPage() {
  const { lang } = useLang();
  return <SettingsShell title={lang === "vi" ? "Thông báo" : "Notifications"}>{(a) => <Form a={a} />}</SettingsShell>;
}

function Form({ a }: { a: Access }) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const T = (en: string, v: string) => (vi ? v : en);
  const [saved, setSaved] = useState<NotifySettings | null>(null);
  const [s, setS] = useState<NotifySettings>(emptySettings());
  const [people, setPeople] = useState<NotifyPerson[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const load = (x: NotifySettings, p: NotifyPerson[]) => { const v = { ...emptySettings(), ...x }; setSaved(v); setS(v); setPeople(p); };
    if (a.demo) { const d = demoNotify(); load(d.settings, d.people); return; }
    void rpc<{ settings: NotifySettings; people: NotifyPerson[] }[]>("notify_settings_get", { p_salon: a.salonId })
      .then((r) => load(r?.[0]?.settings ?? emptySettings(), r?.[0]?.people ?? []))
      .catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId]);

  if (!saved) return <div className="card pad" aria-busy="true">{err || T("Loading…", "Đang tải…")}</div>;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = (key: string, ch: "email" | "text", v: boolean) => setS((x) => ({ ...x, on: { ...x.on, [key]: { ...channelOf(x, key), [ch]: v } } }));
  const picked = recipientsOf(s, people);
  const togglePerson = (id: string) => setS((x) => {
    const cur = x.to.length ? x.to : people.map((p) => p.id);
    const next = cur.includes(id) ? cur.filter((y) => y !== id) : [...cur, id];
    return { ...x, to: next.length === people.length ? [] : next };
  });
  const noEmail = picked.filter((p) => !p.email);

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      if (!a.demo) await rpc("notify_settings_save", { p_salon: a.salonId, p_settings: s });
      setSaved(s); setToast(T("Saved", "Đã lưu")); setTimeout(() => setToast(""), 2400);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="si-page nt-page" data-testid="notifications">
      {a.demo && <div className="demo">{T("Test version: saved on this device only, nothing is sent.", "Bản thử: chỉ lưu trên máy này, không gửi gì.")}</div>}
      {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}

      <div className="eyebrow">{T("Send to", "Gửi cho")}</div>
      <div className="card pad nt-to">
        <span className="cap">{T("Owner and managers you pick. Each one gets the email at their sign-in email.", "Chủ tiệm và quản lý bạn chọn. Mỗi người nhận email ở email đăng nhập của họ.")}</span>
        <div className="set-chips" data-testid="nt-people">
          {people.map((p) => (
            <Chip key={p.id} on={picked.some((x) => x.id === p.id)} onClick={() => togglePerson(p.id)}>
              {p.name} · {p.role === "owner" ? T("Owner", "Chủ tiệm") : T("Manager", "Quản lý")}
            </Chip>
          ))}
        </div>
        {noEmail.length > 0 && <span className="cap nt-warn">{T(`${noEmail.map((p) => p.name).join(", ")} has no sign-in email yet: add one in My profile → Sign in, or alerts only go by text.`,
          `${noEmail.map((p) => p.name).join(", ")} chưa có email đăng nhập: thêm ở Hồ sơ → Đăng nhập, nếu không chỉ nhận qua tin nhắn.`)}</span>}
      </div>

      <ListGroup>
        <Row size="l" title={T("Daily summary at closing", "Tóm tắt cuối ngày")}
          sub={<>{T("One email: sales, hours, wrong PINs, refunds, anything that needs you tomorrow.", "Một email: doanh thu, giờ làm, PIN sai, hoàn tiền, việc cần làm ngày mai.")} <span className="nt-soon">{T("Starts soon", "Sắp có")}</span></>}
          right={<Switch label={T("Daily summary", "Tóm tắt cuối ngày")} on={s.summary} onChange={(v) => setS((x) => ({ ...x, summary: v }))} />} />
      </ListGroup>

      <div className="group nt-table" data-testid="nt-table">
        <div className="nt-row nt-head" aria-hidden><span>{T("Tell me right away when…", "Báo ngay khi…")}</span><span>Email</span><span>{T("Text", "Tin nhắn")}</span></div>
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="nt-group">{T(...GROUP_WORDS[g])}</div>
            {KINDS.filter((k) => k.group === g).map((k) => {
              const w = WORDS[k.key]; const c = channelOf(s, k.key);
              return (
                <div key={k.key} className="nt-row" data-testid={`nt-${k.key}`}>
                  <span className="nt-g"><b>{vi ? w[2] : w[0]}</b><span className="cap">{vi ? w[3] : w[1]}{!k.live && <> · <span className="nt-soon">{T("Starts soon", "Sắp có")}</span></>}</span></span>
                  <span className="nt-sw"><Switch label={`${vi ? w[2] : w[0]} · Email`} on={c.email} onChange={(v) => set(k.key, "email", v)} /></span>
                  <span className="nt-sw"><Switch label={`${vi ? w[2] : w[0]} · ${T("Text", "Tin nhắn")}`} on={c.text} onChange={(v) => set(k.key, "text", v)} /></span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="cap">{T("Texts start once the salon's text number is approved by the carriers. Until then alerts go by email. Every alert also shows in the Activity log.",
        "Tin nhắn bắt đầu khi số nhắn tin của tiệm được nhà mạng duyệt. Trước đó cảnh báo gửi qua email. Mọi cảnh báo cũng hiện trong Nhật ký hoạt động.")}</p>

      <SaveCheck dirty={dirty} busy={busy} onSave={() => void save()} onUndo={() => setS(saved)} testId="nt-save" />
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
