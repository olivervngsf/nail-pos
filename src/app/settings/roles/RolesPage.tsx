"use client";
// Settings → Roles + permissions (owner only): what a manager and the front desk may do in this salon.
// "OK with their PIN" = discount, refund, close the day, client details, add to the menu (the database checks it in
// approve_discount). "Open in Settings" = which Settings groups a manager sees. Owner = always everything; techs = their
// own tickets + earnings only. Saved for the salon (role_perms_save, logged); test copy = this device only.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Banner, Button, ListGroup, Row, Segmented, Switch, Toast } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { rpc } from "@/lib/auth";
import { OK_PERMS, SET_PERMS, cachedPerms, can, diffFromDefaults, storePerms, type EditRole, type Perm, type RolePerms } from "@/lib/roles";
import SettingsShell, { type Access } from "../SettingsShell";

export default function RolesPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.roles")}>{(a) => <Form a={a} />}</SettingsShell>;
}

const WORDS: Record<Perm, [string, string, string, string]> = {
  "ok.discount": ["Give a discount", "Money off a ticket", "Giảm giá", "Bớt tiền trên phiếu"],
  "ok.refund": ["Refund a ticket", "Money back to the client", "Hoàn tiền", "Trả lại tiền cho khách"],
  "ok.close": ["Close the day", "Count the drawer and close", "Đóng ngày", "Đếm tiền và đóng ngày"],
  "ok.client": ["Change client details", "Name, phone, birthday", "Sửa thông tin khách", "Tên, số điện thoại, sinh nhật"],
  "ok.menu": ["Add a service to the menu", "From a booking's custom service", "Thêm dịch vụ vào menu", "Từ dịch vụ riêng khi đặt lịch"],
  "set.salon": ["Salon", "Salon info, business, menu, devices, billing", "Tiệm", "Thông tin tiệm, kinh doanh, menu, thiết bị, hóa đơn"],
  "set.team": ["Team + time clock", "Team, clock-in, PIN rules", "Nhân viên + chấm công", "Nhân viên, chấm công, luật PIN"],
  "set.pay": ["Taking payments", "Payments, card reader, Tap to Pay, printer", "Nhận thanh toán", "Thanh toán, máy quẹt thẻ, Tap to Pay, máy in"],
  "set.clients": ["Clients + booking", "Booking page, reminders, texting, loyalty, gift cards", "Khách + đặt lịch", "Trang đặt lịch, nhắc lịch, tin nhắn, tích điểm, thẻ quà"],
  "set.money": ["Pay the team", "Payout sheet", "Trả lương", "Bảng lương"],
  "set.safety": ["Safety + records", "Activity log, support access", "An toàn + lịch sử", "Nhật ký hoạt động, quyền hỗ trợ"],
};

function Form({ a }: { a: Access }) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const T = (en: string, v: string) => (vi ? v : en);
  const [saved, setSaved] = useState<RolePerms | null>(null);
  const [draft, setDraft] = useState<RolePerms>({});
  const [role, setRole] = useState<EditRole>("manager");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const load = (p: RolePerms) => { setSaved(p); setDraft(p); storePerms(a.salonId, p); };

  useEffect(() => {
    if (a.demo) { load(cachedPerms(a.salonId)); return; }
    void rpc<RolePerms>("role_perms_get", { p_salon: a.salonId }).then((p) => load(p ?? {})).catch((e: Error) => { setErr(e.message); load(cachedPerms(a.salonId)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.demo, a.salonId]);

  if (!a.owner) return <div className="card pad" data-testid="roles-owner-only">{T("Only the owner can change roles + permissions.", "Chỉ chủ tiệm mới đổi được quyền.")}</div>;
  if (!saved) return <div className="card pad" aria-busy="true">{T("Loading…", "Đang tải…")}</div>;

  const on = (k: Perm) => can(draft, role, k);
  const flip = (k: Perm, v: boolean) => setDraft((d) => ({ ...d, [role]: { ...(d[role] ?? {}), [k]: v } }));
  const clean = diffFromDefaults(draft);
  const changed = JSON.stringify(clean) !== JSON.stringify(diffFromDefaults(saved));

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      load(a.demo ? clean : ((await rpc<RolePerms>("role_perms_save", { p_salon: a.salonId, p: clean })) ?? {}));
      setToast(T("Saved", "Đã lưu")); setTimeout(() => setToast(""), 2400);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const rowFor = (k: Perm) => {
    const [en, enSub, v, viSub] = WORDS[k];
    return <Row key={k} size="l" title={vi ? v : en} sub={vi ? viSub : enSub} data-testid={`perm-${k}`}
      right={<Switch label={vi ? v : en} on={on(k)} onChange={(x) => flip(k, x)} />} />;
  };

  return (
    <div className="si-page rem-page" data-testid="roles">
      {a.demo && <div className="demo">{T("Test version: saved on this device only.", "Bản thử: chỉ lưu trên máy này.")}</div>}
      <p className="rem-lead">{T("Pick what each role may do in your salon. You (the owner) can always do everything.",
        "Chọn mỗi vai trò được làm gì trong tiệm. Chủ tiệm luôn làm được mọi thứ.")}</p>
      {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}

      <Segmented label={T("Role", "Vai trò")} value={role} onChange={setRole}
        options={[{ value: "manager", label: T("Manager", "Quản lý") }, { value: "front_desk", label: T("Front desk", "Lễ tân") }]} />

      <div className="eyebrow">{T("Can OK with their PIN", "Được duyệt bằng PIN")}</div>
      <ListGroup>{OK_PERMS.map(rowFor)}</ListGroup>
      <ul className="rem-notes">
        <li>{T("Off = someone else (owner or a role that has it) types their PIN to OK it.", "Tắt = người khác (chủ hoặc vai trò có quyền) nhập PIN để duyệt.")}</li>
        <li>{T("Every OK is saved in the Activity log with who gave it.", "Mọi lần duyệt đều lưu trong Nhật ký hoạt động, ghi rõ ai duyệt.")}</li>
      </ul>

      {role === "manager" ? (
        <>
          <div className="eyebrow">{T("Can open in Settings", "Được mở trong Cài đặt")}</div>
          <ListGroup>{SET_PERMS.map(rowFor)}</ListGroup>
          <ul className="rem-notes"><li>{T("Roles + permissions stays owner only.", "Trang Quyền chỉ chủ tiệm mở được.")}</li></ul>
        </>
      ) : (
        <ul className="rem-notes"><li>{T("Front desk never opens Settings.", "Lễ tân không mở Cài đặt.")}</li></ul>
      )}
      <ul className="rem-notes"><li>{T("Techs see their own bookings, tickets and earnings only.", "Thợ chỉ thấy lịch, phiếu và tiền công của mình.")}</li></ul>

      <div className="si-bar">
        <Button variant="ghost" disabled={busy || !Object.keys(clean).length} onClick={() => setDraft({})} data-testid="roles-reset">{T("Back to default", "Về mặc định")}</Button>
        <span className="cap">{changed ? T("Not saved yet", "Chưa lưu") : ""}</span>
        <Button variant="primary" disabled={busy || !changed} onClick={() => void save()} data-testid="roles-save">{busy ? T("Saving…", "Đang lưu…") : T("Save", "Lưu")}</Button>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
