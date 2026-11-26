"use client";
// Settings → Roles + permissions (owner only). Oliver, Nov 26: board "Roles + Permissions" variations A + D mixed:
// on top, one quick level per role (Careful / Standard / Trusted, plus "Custom" once a box is changed);
// below, one checklist grid with every role side by side (Owner always, Tech never, Manager + Front desk ticked).
// "OK with their PIN" = discount, refund, close the day, client details, add to the menu (the database checks it in
// approve_discount). "Open in Settings" = which Settings groups a manager sees. Saved for the salon (role_perms_save,
// logged); test copy = this device only.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Banner, Button, Toast } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { rpc } from "@/lib/auth";
import {
  LEVELS, OK_PERMS, SET_PERMS, applyLevel, cachedPerms, can, diffFromDefaults, levelOf, storePerms,
  type EditRole, type Level, type Perm, type RolePerms,
} from "@/lib/roles";
import SettingsShell, { type Access } from "../SettingsShell";

export default function RolesPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.roles")}>{(a) => <Form a={a} />}</SettingsShell>;
}

type W = [string, string, string, string];
const WORDS: Record<Perm, W> = {
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
const LEVEL_WORDS: Record<EditRole, Partial<Record<Level, [string, string, string, string]>>> = {
  manager: {
    careful: ["Careful", "Discounts, client details and the menu. You do refunds, closing the day, the team and pay.",
      "Cẩn thận", "Giảm giá, thông tin khách và menu. Hoàn tiền, đóng ngày, nhân viên và lương do bạn làm."],
    standard: ["Standard", "Everything you can do, except changing these rules.", "Tiêu chuẩn", "Mọi việc bạn làm được, trừ đổi các quyền này."],
  },
  front_desk: {
    careful: ["Careful", "No OKs. Every discount, refund and close needs you or a manager.", "Cẩn thận", "Không được duyệt. Giảm giá, hoàn tiền, đóng ngày đều cần bạn hoặc quản lý."],
    standard: ["Standard", "Can give discounts. Refunds, closing the day and client edits need a manager.", "Tiêu chuẩn", "Được giảm giá. Hoàn tiền, đóng ngày và sửa khách cần quản lý."],
    trusted: ["Trusted", "Can OK everything a manager can, like closing the day when nobody else is in.", "Tin cậy", "Duyệt được mọi việc như quản lý, ví dụ đóng ngày khi không có ai."],
  },
};
const ROLES: EditRole[] = ["manager", "front_desk"];

function Check({ on }: { on: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: on ? 1 : 0 }}><path d="M5 12l5 5 9-10" /></svg>;
}

function Form({ a }: { a: Access }) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const T = (en: string, v: string) => (vi ? v : en);
  const [saved, setSaved] = useState<RolePerms | null>(null);
  const [draft, setDraft] = useState<RolePerms>({});
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

  const flip = (role: EditRole, k: Perm) => setDraft((d) => ({ ...d, [role]: { ...(d[role] ?? {}), [k]: !can(d, role, k) } }));
  const clean = diffFromDefaults(draft);
  const changed = JSON.stringify(clean) !== JSON.stringify(diffFromDefaults(saved));
  const roleName = (r: EditRole) => (r === "manager" ? T("Manager", "Quản lý") : T("Front desk", "Lễ tân"));

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      load(a.demo ? clean : ((await rpc<RolePerms>("role_perms_save", { p_salon: a.salonId, p: clean })) ?? {}));
      setToast(T("Saved", "Đã lưu")); setTimeout(() => setToast(""), 2400);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  // In short: one plain sentence per role, from its column.
  const short = (r: EditRole) => {
    const yes = OK_PERMS.filter((k) => can(draft, r, k)).map((k) => (vi ? WORDS[k][2] : WORDS[k][0]).toLowerCase());
    if (!yes.length) return T("needs you or a manager for every OK.", "cần bạn hoặc quản lý cho mọi lần duyệt.");
    if (yes.length === OK_PERMS.length) return T("can OK everything.", "duyệt được mọi việc.");
    return `${T("can", "được")} ${yes.join(", ")}.`;
  };

  const cell = (r: EditRole, k: Perm) => {
    if (r === "front_desk" && k.startsWith("set.")) return <span className="rp-never" aria-label={T("Never", "Không bao giờ")}>—</span>;
    const on = can(draft, r, k);
    const [en, , v] = WORDS[k];
    return (
      <button type="button" role="checkbox" aria-checked={on} aria-label={`${roleName(r)}: ${vi ? v : en}`} className={`rp-hit${on ? " is-on" : ""}`}
        onClick={() => flip(r, k)} data-testid={`perm-${r}-${k}`}><span className="rp-box" aria-hidden><Check on={on} /></span></button>
    );
  };

  const section = (title: string, keys: readonly Perm[]) => (
    <>
      <div className="rp-sec" role="row"><span role="columnheader">{title}</span></div>
      {keys.map((k) => {
        const [en, enSub, v, viSub] = WORDS[k];
        return (
          <div key={k} className="rp-row" role="row" data-testid={`perm-${k}`}>
            <span className="rp-what" role="rowheader"><b>{vi ? v : en}</b><span className="cap">{vi ? viSub : enSub}</span></span>
            <span className="rp-c rp-fixed" role="cell"><span className="rp-always" role="img" aria-label={T("Always", "Luôn luôn")}><Check on /></span></span>
            {ROLES.map((r) => <span key={r} className="rp-c" role="cell">{cell(r, k)}</span>)}
            <span className="rp-c rp-fixed" role="cell"><span className="rp-never" aria-label={T("Never", "Không bao giờ")}>—</span></span>
          </div>
        );
      })}
    </>
  );

  return (
    <div className="si-page rp-page" data-testid="roles">
      {a.demo && <div className="demo">{T("Test version: saved on this device only.", "Bản thử: chỉ lưu trên máy này.")}</div>}
      <p className="rem-lead">{T("Pick how much you trust each role, then fine-tune the boxes. You (the owner) can always do everything.",
        "Chọn mức tin cậy cho mỗi vai trò, rồi chỉnh từng ô. Chủ tiệm luôn làm được mọi thứ.")}</p>
      {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}

      {ROLES.map((r) => {
        const cur = levelOf(draft, r);
        return (
          <div key={r} className="rp-levels" data-testid={`levels-${r}`}>
            <div className="eyebrow">{roleName(r)}{!cur && <span className="rp-custom">{T("Custom", "Tùy chỉnh")}</span>}</div>
            <div className="rp-level-row" role="radiogroup" aria-label={roleName(r)}>
              {LEVELS[r].map((l) => {
                const w = LEVEL_WORDS[r][l.key]!;
                const on = cur === l.key;
                return (
                  <button key={l.key} type="button" role="radio" aria-checked={on} className={`rp-level${on ? " is-on" : ""}`}
                    onClick={() => setDraft((d) => applyLevel(d, r, l.key))} data-testid={`level-${r}-${l.key}`}>
                    <span className="rp-level-h"><span className="rp-dot" aria-hidden />{vi ? w[2] : w[0]}</span>
                    <span className="cap">{vi ? w[3] : w[1]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="rp-grid" role="table" aria-label={T("What each role can do", "Mỗi vai trò làm được gì")}>
        <div className="rp-head" role="row">
          <span role="columnheader">{T("What they can do", "Việc được làm")}</span>
          <span className="rp-c rp-fixed" role="columnheader">{T("Owner", "Chủ")}</span>
          {ROLES.map((r) => <span key={r} className="rp-c" role="columnheader">{roleName(r)}</span>)}
          <span className="rp-c rp-fixed" role="columnheader">{T("Tech", "Thợ")}</span>
        </div>
        {section(T("OK with their PIN", "Duyệt bằng PIN"), OK_PERMS)}
        {section(T("Open in Settings", "Mở trong Cài đặt"), SET_PERMS)}
      </div>
      <ul className="rem-notes">
        <li>{T("Grey tick = always (owner). Dash = never for that role. Techs see their own bookings, tickets and earnings only.",
          "Dấu xám = luôn được (chủ). Gạch = không bao giờ. Thợ chỉ thấy lịch, phiếu và tiền công của mình.")}</li>
        <li>{T("Box off = someone who has it (you or a manager) types their PIN to OK it. Every OK is saved in the Activity log.",
          "Ô tắt = người có quyền (bạn hoặc quản lý) nhập PIN để duyệt. Mọi lần duyệt đều lưu trong Nhật ký hoạt động.")}</li>
      </ul>

      <div className="si-bar rp-bar">
        <span className="rp-short" data-testid="roles-short">
          {ROLES.map((r) => <span key={r}><b>{roleName(r)}</b> {short(r)}</span>)}
        </span>
        <Button variant="ghost" disabled={busy || !Object.keys(clean).length} onClick={() => setDraft({})} data-testid="roles-reset">{T("Back to default", "Về mặc định")}</Button>
        <Button variant="primary" disabled={busy || !changed} onClick={() => void save()} data-testid="roles-save">{busy ? T("Saving…", "Đang lưu…") : changed ? T("Save", "Lưu") : T("Saved", "Đã lưu")}</Button>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
