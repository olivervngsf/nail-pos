"use client";
// Settings → Business details: what Stripe + the phone carriers need to register the salon (Automatic Salon Setup
// spec §4). Owner fills + confirms; manager reads. EIN goes to a server-only table; only the last 4 come back.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Banner, Button, Switch, Toast } from "@/components/kit";
import StatusIcon from "@/components/StatusIcon";
import { useLang } from "@/components/AppProviders";
import { rpc } from "@/lib/auth";
import { BUSINESS_TYPES, CONSENT_METHODS, draftMissing, draftProblem, formatEin, sampleBusiness, toDraft, type Business, type BusinessDraft } from "@/lib/business";
import SettingsShell, { type Access } from "../SettingsShell";

export default function BusinessPage() {
  const t = useTranslations("settings");
  return <SettingsShell title={t("nav.business")}>{(a) => <Form a={a} />}</SettingsShell>;
}

const TYPE_LABEL: Record<string, [string, string]> = {
  llc: ["LLC", "LLC (công ty trách nhiệm hữu hạn)"], corporation: ["Corporation (Inc.)", "Công ty cổ phần (Inc.)"],
  partnership: ["Partnership", "Công ty hợp danh"], sole_prop: ["Sole proprietor (no EIN)", "Chủ sở hữu duy nhất (không có EIN)"],
  nonprofit: ["Nonprofit", "Phi lợi nhuận"],
};
const CONSENT_LABEL: Record<string, [string, string]> = {
  booking_page: ["Booking page checkbox (PolishOS)", "Ô đánh dấu trên trang đặt lịch (PolishOS)"],
  sign_in_sheet: ["Paper sign-in sheet", "Giấy ký tên tại tiệm"], verbal: ["They tell us at the desk", "Khách nói tại quầy"],
  none: ["We don't ask yet", "Chưa hỏi khách"],
};
const MISSING_LABEL: Record<string, [string, string]> = {
  legal_name: ["Legal business name", "Tên doanh nghiệp hợp pháp"], business_type: ["Business type", "Loại doanh nghiệp"],
  ein: ["EIN", "Mã số thuế EIN"], address: ["Full address (Salon info)", "Địa chỉ đầy đủ (Thông tin tiệm)"],
  area_code: ["Area code", "Mã vùng"], consent_method: ["How clients say yes", "Cách khách đồng ý"], confirm: ["Your confirmation", "Xác nhận của bạn"],
};

function Form({ a }: { a: Access }) {
  const { lang } = useLang();
  const L = (p: [string, string] | undefined, en = "") => (p ? (lang === "vi" ? p[1] : p[0]) : en);
  const T = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [b, setB] = useState<Business | null>(null);
  const [d, setD] = useState<BusinessDraft | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const load = (x: Business) => { setB(x); setD(toDraft(x)); };

  useEffect(() => {
    if (a.demo) { load(sampleBusiness()); return; }
    void rpc<Business>("business_get", { p_salon: a.salonId }).then(load).catch((e: Error) => setErr(e.message));
  }, [a.demo, a.salonId]);

  if (!b || !d) return <div className="card pad" aria-busy="true">{err || T("Loading…", "Đang tải…")}</div>;
  const edit = b.canEdit;
  const set = (p: Partial<BusinessDraft>) => setD({ ...d, ...p });
  const missing = draftMissing(d, b);
  const problem = draftProblem(d);
  const booking = b.slug ? `polishosapp.com/${b.slug}` : "";

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      if (a.demo) { setB({ ...b, ...d, einLast4: d.ein ? d.ein.replace(/\D/g, "").slice(-4) : b.einLast4, confirmedAt: d.confirm ? new Date().toISOString() : null, missing }); setD({ ...d, ein: "" }); }
      else load(await rpc<Business>("business_save", { p_salon: a.salonId, p: { ...d, ein: d.ein.replace(/\D/g, "") } }));
      setToast(T("Saved", "Đã lưu")); setTimeout(() => setToast(""), 2400);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="biz" data-testid="business">
      {a.demo && <div className="demo">{T("Test version: sample details, nothing is sent.", "Bản thử: thông tin mẫu, không gửi đi đâu.")}</div>}
      <section className={`tl-banner is-${missing.length ? "waiting" : "on"}`} data-testid="business-state" style={{ margin: 0 }}>
        <StatusIcon tone={missing.length ? "watch" : "good"} />
        <span>
          <b>{missing.length ? T("Still needed before we can register your salon", "Còn thiếu trước khi đăng ký cho tiệm") : T("Ready: we can register your salon for cards + texting", "Sẵn sàng: có thể đăng ký thẻ + nhắn tin cho tiệm")}</b>
          {missing.length > 0 && <span className="cap"> {missing.map((m) => L(MISSING_LABEL[m], m)).join(" · ")}</span>}
        </span>
      </section>
      <p className="cap" style={{ margin: 0 }}>{T("Card payments (Stripe) and client texts (phone carriers) must be registered in your business's legal name. You type it once here; PolishOS does the registration for you. Nobody needs a Twilio or Stripe login.",
        "Thanh toán thẻ (Stripe) và tin nhắn cho khách (nhà mạng) phải đăng ký theo tên hợp pháp của doanh nghiệp. Bạn nhập một lần ở đây; PolishOS đăng ký giúp bạn.")} <Link href="/settings/texting/rules">{T("Why?", "Tại sao?")}</Link></p>
      {!edit && <Banner tone="info">{T("Only the owner can change business details.", "Chỉ chủ tiệm được sửa thông tin doanh nghiệp.")}</Banner>}
      {err && <p className="hint err" role="alert">{err}</p>}

      <section className="card pad in2 biz-card">
        <div className="eyebrow">{T("Your business", "Doanh nghiệp")}</div>
        <div>
          <label className="lbl" htmlFor="biz-legal">{T("Legal business name", "Tên doanh nghiệp hợp pháp")}</label>
          <input className="inp" id="biz-legal" data-testid="biz-legal" disabled={!edit} value={d.legalName} placeholder="Lotus Nails LLC" onChange={(e) => set({ legalName: e.target.value })} />
          <div className="hint">{T("Exactly as on your IRS papers (EIN letter). Your salon name stays", "Đúng như trên giấy IRS (thư EIN). Tên tiệm vẫn là")} “{b.salonName}”.</div>
        </div>
        <div className="grid2" style={{ gap: 16 }}>
          <div>
            <label className="lbl" htmlFor="biz-type">{T("Business type", "Loại doanh nghiệp")}</label>
            <select className="inp" id="biz-type" data-testid="biz-type" disabled={!edit} value={d.businessType} onChange={(e) => set({ businessType: e.target.value as BusinessDraft["businessType"] })}>
              <option value="">{T("Pick one", "Chọn")}</option>
              {BUSINESS_TYPES.map((x) => <option key={x} value={x}>{L(TYPE_LABEL[x], x)}</option>)}
            </select>
          </div>
          {d.businessType !== "sole_prop" && (
            <div>
              <label className="lbl" htmlFor="biz-ein">{T("EIN (business tax number)", "Mã số thuế EIN")}</label>
              <input className="inp" id="biz-ein" data-testid="biz-ein" disabled={!edit} inputMode="numeric" autoComplete="off" value={d.ein}
                placeholder={b.einLast4 ? `••-•••${b.einLast4}` : "12-3456789"} onChange={(e) => set({ ein: formatEin(e.target.value) })} />
              <div className="hint">{b.einLast4 ? T(`On file, ending ${b.einLast4}. Type a new one only to change it.`, `Đã lưu, đuôi ${b.einLast4}. Chỉ nhập lại nếu muốn đổi.`) : T("9 digits. Kept private; only the last 4 are ever shown.", "9 số. Được giữ kín; chỉ hiện 4 số cuối.")}</div>
            </div>
          )}
        </div>
        <div>
          <span className="lbl">{T("Business address", "Địa chỉ doanh nghiệp")}</span>
          <div className="line"><span>{b.address || T("Not set", "Chưa có")}</span><Link href="/settings/salon">{T("Change in Salon info", "Sửa ở Thông tin tiệm")}</Link></div>
        </div>
        <div>
          <label className="lbl" htmlFor="biz-web">{T("Website", "Trang web")}</label>
          <input className="inp" id="biz-web" data-testid="biz-web" disabled={!edit} inputMode="url" value={d.website} placeholder={booking || "yoursalon.com"} onChange={(e) => set({ website: e.target.value })} />
          <div className="hint">{T("No website? Leave it empty: we use your PolishOS booking page", "Không có trang web? Để trống: dùng trang đặt lịch PolishOS")}{booking ? ` (${booking}).` : "."}</div>
        </div>
      </section>

      <section className="card pad in2 biz-card">
        <div className="eyebrow">{T("Texting your clients", "Nhắn tin cho khách")}</div>
        <div className="grid2" style={{ gap: 16 }}>
          <div>
            <label className="lbl" htmlFor="biz-area">{T("Area code for your salon's text number", "Mã vùng cho số nhắn tin của tiệm")}</label>
            <input className="inp" id="biz-area" data-testid="biz-area" disabled={!edit} inputMode="numeric" maxLength={3} value={d.areaCode} placeholder="408" onChange={(e) => set({ areaCode: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
            <div className="hint">{T("Clients trust a local number.", "Khách tin số địa phương hơn.")}</div>
          </div>
          <div>
            <label className="lbl" htmlFor="biz-consent">{T("How clients say yes to texts today", "Hiện nay khách đồng ý nhận tin bằng cách nào")}</label>
            <select className="inp" id="biz-consent" data-testid="biz-consent" disabled={!edit} value={d.consentMethod} onChange={(e) => set({ consentMethod: e.target.value as BusinessDraft["consentMethod"] })}>
              <option value="">{T("Pick one", "Chọn")}</option>
              {CONSENT_METHODS.map((x) => <option key={x} value={x}>{L(CONSENT_LABEL[x], x)}</option>)}
            </select>
            <div className="hint">{T("From now on PolishOS records every yes (booking page checkbox, desk).", "Từ nay PolishOS ghi lại mọi lần khách đồng ý (trang đặt lịch, tại quầy).")}</div>
          </div>
        </div>
        <div className="row s" style={{ padding: 0 }}>
          <span className="g">{T("Send promo texts too", "Gửi cả tin khuyến mãi")}<span className="cap">{T("Reminders + receipts always. Promos only to clients who said yes in writing.", "Luôn có nhắc lịch + hóa đơn. Khuyến mãi chỉ gửi khách đã đồng ý bằng văn bản.")}</span></span>
          <Switch label={T("Send promo texts too", "Gửi cả tin khuyến mãi")} on={d.promosOk} onChange={(v) => edit && set({ promosOk: v })} />
        </div>
      </section>

      <section className="card pad in3 biz-card">
        <label className="biz-confirm">
          <input type="checkbox" data-testid="biz-confirm" disabled={!edit} checked={d.confirm} onChange={(e) => set({ confirm: e.target.checked })} />
          <span>{T("I confirm these details are true, and my clients agreed to get texts from my salon.", "Tôi xác nhận thông tin này là đúng, và khách của tôi đã đồng ý nhận tin nhắn từ tiệm.")}
            {b.confirmedAt && <span className="cap"> {T("Signed", "Đã ký")} {new Date(b.confirmedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}</span>
        </label>
        {edit && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" disabled={busy || !!problem} onClick={() => void save()} data-testid="biz-save">{busy ? T("Saving…", "Đang lưu…") : T("Save", "Lưu")}</Button>
            {problem === "ein" && <span className="hint err" style={{ margin: 0 }}>{T("EIN has 9 digits.", "EIN có 9 số.")}</span>}
            {problem === "area_code" && <span className="hint err" style={{ margin: 0 }}>{T("Area code has 3 digits.", "Mã vùng có 3 số.")}</span>}
          </div>
        )}
      </section>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
