"use client";
// Settings → Call + text clients (Oliver, Nov 26): only the owner sees a client's full phone. The owner picks which
// other roles get a Call and a Text button on a booking (they dial / text without seeing the number). Owner saves,
// manager reads. Saved on the salon (contact_settings_save); every tap is logged in the Activity log.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Banner, Button, ListGroup, Row, StatusPill, Switch, Toast } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { rpc, type Role } from "@/lib/auth";
import { DEFAULT_CONTACT, OTHER_ROLES, rememberContact, type ContactSettings, type Way } from "@/lib/clientContact";
import SettingsShell, { type Access } from "../SettingsShell";

export default function ContactPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.contact")}>{(a) => <Form a={a} />}</SettingsShell>;
}

function Form({ a }: { a: Access }) {
  const { lang } = useLang();
  const T = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [saved, setSaved] = useState<ContactSettings | null>(null);
  const [draft, setDraft] = useState<ContactSettings>(DEFAULT_CONTACT);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const load = (x: ContactSettings) => { setSaved(x); setDraft(x); if (!a.demo) rememberContact(a.salonId, x); };

  useEffect(() => {
    if (a.demo) { load(DEFAULT_CONTACT); return; }
    void rpc<ContactSettings>("contact_settings_get", { p_salon: a.salonId }).then(load).catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!saved) return <div className="card pad" aria-busy="true">{err || T("Loading…", "Đang tải…")}</div>;
  const owner = a.role === "owner";
  const ROLE: Record<Role, string> = { owner: T("Owner", "Chủ tiệm"), manager: T("Manager", "Quản lý"), front_desk: T("Front desk", "Lễ tân"), tech: T("Tech", "Thợ") };
  const key = (s: ContactSettings) => JSON.stringify({ call: [...s.call].sort(), text: [...s.text].sort() });
  const changed = key(draft) !== key(saved);
  const flip = (way: Way, r: Role, on: boolean) =>
    setDraft((d) => ({ ...d, [way]: on ? [...d[way].filter((x) => x !== r), r] : d[way].filter((x) => x !== r) }));

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      if (a.demo) load(draft);
      else load(await rpc<ContactSettings>("contact_settings_save", { p_salon: a.salonId, p: draft }));
      setToast(T("Saved", "Đã lưu")); setTimeout(() => setToast(""), 2400);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const block = (way: Way, title: string, sub: string) => (
    <>
      <div className="eyebrow">{title}</div>
      <ListGroup>
        <Row size="l" title={ROLE.owner} sub={sub} right={<StatusPill tone="ok">{T("Always", "Luôn có")}</StatusPill>} />
        {OTHER_ROLES.map((r) => (
          <Row key={r} size="l" title={ROLE[r]} data-testid={`ct-${way}-${r}`}
            right={owner
              ? <Switch label={`${title}: ${ROLE[r]}`} on={draft[way].includes(r)} onChange={(v) => flip(way, r, v)} />
              : <StatusPill tone={draft[way].includes(r) ? "ok" : undefined}>{draft[way].includes(r) ? T("On", "Bật") : T("Off", "Tắt")}</StatusPill>} />
        ))}
      </ListGroup>
    </>
  );

  return (
    <div className="si-page" data-testid="contact-settings">
      {a.demo && <div className="demo">{T("Test version: saved on this device only.", "Bản thử: chỉ lưu trên máy này.")}</div>}
      <p className="rem-lead">{T("Only you, the owner, see a client's full phone number. Pick who else gets a Call and a Text button on a booking: they reach the client without seeing the number.",
        "Chỉ chủ tiệm thấy đủ số điện thoại của khách. Chọn ai được nút Gọi và Nhắn trên lịch hẹn: họ liên lạc khách mà không thấy số.")}</p>
      {!owner && <Banner tone="info">{T("Only the owner can change this.", "Chỉ chủ tiệm được đổi phần này.")}</Banner>}
      {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}
      {block("call", T("Call button", "Nút Gọi"), T("Opens the phone app with the number filled in", "Mở ứng dụng gọi với số đã điền sẵn"))}
      {block("text", T("Text button", "Nút Nhắn"), T("Opens Messages with a reminder already written", "Mở tin nhắn với lời nhắc đã viết sẵn"))}
      <ul className="rem-notes">
        <li>{T("Every Call and Text tap is saved in the Activity log: who, which client, when.", "Mỗi lần bấm Gọi và Nhắn được lưu trong Nhật ký: ai, khách nào, lúc nào.")}</li>
        <li>{T("The text goes from the phone or iPad that taps it, not from PolishOS.", "Tin nhắn gửi từ điện thoại hoặc iPad bấm nút, không phải từ PolishOS.")}</li>
        <li>{T("The phone app on that device may still show the number while dialing.", "Ứng dụng gọi trên máy đó có thể vẫn hiện số khi gọi.")}</li>
      </ul>
      {owner && <div className="si-bar">
        <span className="cap">{changed ? T("Not saved yet", "Chưa lưu") : ""}</span>
        <Button variant="primary" disabled={busy || !changed} onClick={() => void save()} data-testid="ct-save">{busy ? T("Saving…", "Đang lưu…") : T("Save", "Lưu")}</Button>
      </div>}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
