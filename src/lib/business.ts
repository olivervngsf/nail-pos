// Business details (Settings → Business details): what Stripe + the phone carriers need to register the salon.
// Pure helpers (tested in business.test.ts); the page is src/app/settings/business/BusinessPage.tsx.
export type BusinessType = "" | "llc" | "corporation" | "partnership" | "sole_prop" | "nonprofit";
export type ConsentMethod = "" | "booking_page" | "sign_in_sheet" | "verbal" | "none";
export type Business = {
  legalName: string; businessType: BusinessType; einLast4: string | null; website: string; areaCode: string | null;
  consentMethod: ConsentMethod; promosOk: boolean; confirmedAt: string | null;
  salonName: string; salonPhone: string | null; address: string | null; state: string; slug: string | null;
  canEdit: boolean; missing: string[];
};
export type BusinessDraft = { legalName: string; businessType: BusinessType; ein: string; website: string; areaCode: string; consentMethod: ConsentMethod; promosOk: boolean; confirm: boolean };

export const BUSINESS_TYPES: BusinessType[] = ["llc", "corporation", "partnership", "sole_prop", "nonprofit"];
export const CONSENT_METHODS: ConsentMethod[] = ["booking_page", "sign_in_sheet", "verbal", "none"];

const digits = (s: string) => s.replace(/\D/g, "");
/** "12-3456789" while typing. */
export const formatEin = (s: string) => { const d = digits(s).slice(0, 9); return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d; };
export const einOk = (s: string) => digits(s).length === 9;
export const areaCodeOk = (s: string) => /^[2-9]\d{2}$/.test(digits(s));
/** Area code to suggest: from the salon phone ("+1 408…" / "(408) …"). */
export function areaFromPhone(phone: string | null | undefined): string {
  const d = digits(phone ?? "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return n.length === 10 && areaCodeOk(n.slice(0, 3)) ? n.slice(0, 3) : "";
}

/** What still blocks registration, worked out on the device the same way the database does (_business_missing). */
export function draftMissing(d: BusinessDraft, b: Pick<Business, "einLast4" | "address">): string[] {
  const m: string[] = [];
  if (!d.legalName.trim()) m.push("legal_name");
  if (!d.businessType) m.push("business_type");
  if (d.businessType !== "sole_prop" && !b.einLast4 && !einOk(d.ein)) m.push("ein");
  if (!(b.address ?? "").trim()) m.push("address");
  if (!areaCodeOk(d.areaCode)) m.push("area_code");
  if (!d.consentMethod) m.push("consent_method");
  if (!d.confirm) m.push("confirm");
  return m;
}

/** Problem that stops saving at all (bad format), else null. Missing fields can be saved and finished later. */
export function draftProblem(d: BusinessDraft): "ein" | "area_code" | null {
  if (digits(d.ein).length > 0 && !einOk(d.ein)) return "ein";
  if (digits(d.areaCode).length > 0 && !areaCodeOk(d.areaCode)) return "area_code";
  return null;
}

export const toDraft = (b: Business): BusinessDraft => ({
  legalName: b.legalName, businessType: b.businessType, ein: "", website: b.website, areaCode: b.areaCode ?? areaFromPhone(b.salonPhone),
  consentMethod: b.consentMethod, promosOk: b.promosOk, confirm: !!b.confirmedAt,
});

export const sampleBusiness = (): Business => ({
  legalName: "Lotus Nails LLC", businessType: "llc", einLast4: "6789", website: "", areaCode: "408", consentMethod: "booking_page",
  promosOk: true, confirmedAt: null, salonName: "Lotus Demo Nails", salonPhone: "+14085550100", address: "1550 S Bascom Ave, Campbell, CA 95008",
  state: "CA", slug: "demo", canEdit: true, missing: ["confirm"],
});
