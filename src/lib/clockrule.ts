"use client";
// Clock-in rule (Nov 19): can a person clock in on their OWN phone, and how? Salon devices (time clock tablet,
// front desk) always can, with face + PIN. Plain-words notes live here so every screen explains it the same way.
import { api } from "@/lib/api";

export type PhoneRule = "off" | "qr" | "wifi" | "qr_or_wifi";
export const PHONE_RULES: PhoneRule[] = ["off", "qr", "wifi", "qr_or_wifi"];
export type ClockResult = { ok: boolean; kind?: "in" | "out"; via?: "qr" | "wifi"; reason?: string; rule?: PhoneRule };

export const allowsQr = (r: PhoneRule) => r === "qr" || r === "qr_or_wifi";
export const allowsWifi = (r: PhoneRule) => r === "wifi" || r === "qr_or_wifi";

export const RULE_TEXT: Record<PhoneRule, { en: [string, string]; vi: [string, string] }> = {
  off: { en: ["Salon devices only", "Clock in on the time clock tablet or front desk with face + PIN. Phones can't clock in."],
    vi: ["Chỉ máy của tiệm", "Chấm công trên máy chấm công hoặc quầy, chọn mặt + PIN. Điện thoại không chấm được."] },
  qr: { en: ["Phone + QR at the salon", "Staff scan the QR on the time clock tablet with their own phone. It changes every 30 seconds, so a photo of it won't work at home."],
    vi: ["Điện thoại + quét QR ở tiệm", "Thợ dùng điện thoại quét mã QR trên máy chấm công. Mã đổi mỗi 30 giây, chụp hình đem về nhà không dùng được."] },
  wifi: { en: ["Phone on the salon Wi-Fi", "Works only while the phone is on the salon's own Wi-Fi. Home Wi-Fi and phone data are refused."],
    vi: ["Điện thoại dùng Wi-Fi tiệm", "Chỉ chấm được khi điện thoại đang dùng Wi-Fi của tiệm. Wi-Fi ở nhà hoặc 4G/5G sẽ bị từ chối."] },
  qr_or_wifi: { en: ["Phone: QR or salon Wi-Fi", "Either one works: scan the QR at the salon, or be on the salon Wi-Fi."],
    vi: ["Điện thoại: QR hoặc Wi-Fi tiệm", "Cách nào cũng được: quét QR ở tiệm, hoặc dùng Wi-Fi của tiệm."] },
};

/** Shown under the Wi-Fi option and in the docs: why QR is the safe pick when staff don't have the Wi-Fi password. */
export const WIFI_NOTE = {
  en: "Wi-Fi only works for phones that are on the salon's Wi-Fi. Many salons keep the password on salon devices only, so staff phones won't be on it: then pick QR (works on every phone, iPhone and Android, no password needed). If your internet company changes the salon's address, phone clock-in by Wi-Fi stops until you tap “Save this Wi-Fi” again.",
  vi: "Wi-Fi chỉ dùng được cho điện thoại đang kết nối Wi-Fi của tiệm. Nhiều tiệm chỉ cài mật khẩu trên máy của tiệm, nên điện thoại thợ không vào được: khi đó chọn QR (mọi điện thoại iPhone và Android đều quét được, không cần mật khẩu). Nếu nhà mạng đổi địa chỉ internet của tiệm, chấm công bằng Wi-Fi sẽ ngưng cho tới khi bấm “Lưu Wi-Fi này” lại.",
};

export function refusal(r: ClockResult, vi: boolean): string {
  const m: Record<string, [string, string]> = {
    phones_off: ["Your salon clocks in on the salon's time clock only. Use the tablet at the salon.", "Tiệm chỉ cho chấm công trên máy của tiệm. Dùng máy chấm công ở tiệm."],
    need_qr: ["Scan the QR on the salon's time clock to clock in.", "Quét mã QR trên máy chấm công của tiệm để chấm công."],
    qr_old: ["That QR is old. Scan the one on the time clock now (it changes every 30 seconds).", "Mã QR đã cũ. Quét lại mã đang hiện trên máy chấm công (đổi mỗi 30 giây)."],
    not_salon_wifi: ["You're not on the salon Wi-Fi. Connect to it, or clock in on the salon's time clock.", "Bạn không dùng Wi-Fi của tiệm. Kết nối Wi-Fi tiệm, hoặc chấm công trên máy của tiệm."],
    need_qr_or_wifi: ["Scan the QR on the salon's time clock, or connect to the salon Wi-Fi.", "Quét mã QR trên máy chấm công, hoặc kết nối Wi-Fi của tiệm."],
  };
  const x = m[r.reason ?? ""] ?? ["Couldn't clock in. Use the salon's time clock.", "Không chấm công được. Dùng máy chấm công của tiệm."];
  return vi ? x[1] : x[0];
}

export const phoneClock = (salonId: string, kind: "in" | "out", code?: string) => api<ClockResult>("/api/clock/phone", { salonId, kind, code });
export const saveSalonWifi = (salonId: string, label: string) => api<{ phone: PhoneRule; wifi: { id: string; label: string; added_at: string }[] }>("/api/clock/wifi", { salonId, label });
export const wifiHere = (salonId: string) => api<{ here: boolean; rule: PhoneRule }>(`/api/clock/wifi?salon=${encodeURIComponent(salonId)}`);
