// Sample salon data for the prototype. Money is always in cents.

export type Role = "owner" | "manager" | "front_desk" | "tech";

export type Staff = {
  id: string;
  name: string;
  pin: string;
  role: Role;
  commissionPct: number; // tech share of service price
  skills: string[];
};

export type Service = {
  id: string;
  vi: string;
  en: string;
  priceCents: number;
  minutes: number;
  addon?: boolean;
};

export type Client = {
  phone: string; // digits only
  name: string;
  email?: string;
  notes?: string;
  visits: number;
  lastVisit?: string; // ISO date
  lastServiceId?: string;
  lastTechId?: string;
};

export type WaitingClient = {
  id: string;
  phone: string;
  serviceIds: string[];
  requestedTechId: string | null; // null = next available
  at: number;
};

export type TicketStatus = "assigned" | "in_service" | "ready" | "paid";

export type Ticket = {
  id: string;
  number: number;
  phone: string;
  techId: string;
  serviceIds: string[];
  status: TicketStatus;
  createdAt: number;
  startedAt?: number;
  doneAt?: number;
  paidAt?: number;
  subtotalCents: number;
  discountCents?: number;
  source?: "online" | "called" | "walk-in";
  tipCents: number;
  tipMethod?: "card" | "cash";
  payMethod?: "card" | "cash" | "link";
  cardFeeCents: number;
  receipt?: "print" | "text" | "email" | "none";
};

export type Appointment = {
  id: string;
  phone: string;
  techId: string;
  serviceIds: string[];
  start: number; // ms
  source: "online" | "called" | "walk-in";
  requested: boolean;
  status: "booked" | "arrived" | "no_show";
  texted?: boolean;
};

export type LogEntry = { at: number; by: string; text: string };

export type ClockEntry = { staffId: string; inAt: number; outAt?: number };

export const SALON = { name: "Lotus Nails & Spa", state: "CA" };

// Card reader fee (Stripe smart reader): 2.7% + 5¢
export const CARD_FEE = { pct: 2.7, fixedCents: 5 };

export const STAFF: Staff[] = [
  { id: "lan", name: "Lan", pin: "1111", role: "tech", commissionPct: 60, skills: ["gel", "art"] },
  { id: "hoa", name: "Hoa", pin: "2222", role: "tech", commissionPct: 60, skills: ["acrylic", "dip"] },
  { id: "tuan", name: "Tuấn", pin: "3333", role: "tech", commissionPct: 55, skills: ["pedi", "acrylic"] },
  { id: "vy", name: "Vy", pin: "4444", role: "tech", commissionPct: 60, skills: ["gel", "pedi"] },
  { id: "thao", name: "Thảo", pin: "5555", role: "front_desk", commissionPct: 0, skills: [] },
  { id: "kim", name: "Kim", pin: "9999", role: "manager", commissionPct: 0, skills: [] },
];

export const SERVICES: Service[] = [
  { id: "mani", vi: "Làm tay", en: "Manicure", priceCents: 2500, minutes: 30 },
  { id: "pedi", vi: "Làm chân", en: "Pedicure", priceCents: 3500, minutes: 45 },
  { id: "gelmani", vi: "Sơn gel tay", en: "Gel manicure", priceCents: 4000, minutes: 45 },
  { id: "gelpedi", vi: "Sơn gel chân", en: "Gel pedicure", priceCents: 5000, minutes: 60 },
  { id: "acrylic", vi: "Bột (bộ mới)", en: "Acrylic full set", priceCents: 5500, minutes: 75 },
  { id: "fill", vi: "Đắp lại (fill)", en: "Acrylic fill", priceCents: 4000, minutes: 45 },
  { id: "dip", vi: "Bột nhúng (dip)", en: "Dip powder", priceCents: 4500, minutes: 60 },
  { id: "art", vi: "Vẽ móng", en: "Nail art", priceCents: 1000, minutes: 15, addon: true },
  { id: "french", vi: "Đầu Pháp", en: "French tips", priceCents: 500, minutes: 10, addon: true },
  { id: "removal", vi: "Tháo gel", en: "Gel removal", priceCents: 1000, minutes: 15, addon: true },
];

export const CLIENTS: Client[] = [
  { phone: "4155550101", name: "Linh Nguyen", visits: 14, lastVisit: "2026-10-30", lastServiceId: "gelmani", lastTechId: "lan", notes: "Likes short almond. Allergic to some acetone." },
  { phone: "4155550102", name: "Sarah Miller", visits: 3, lastVisit: "2026-09-12", lastServiceId: "gelpedi", lastTechId: "vy" },
  { phone: "4155550103", name: "Mai Tran", visits: 8, lastVisit: "2026-11-02", lastServiceId: "acrylic", lastTechId: "hoa", notes: "Always asks for Hoa." },
  { phone: "4155550104", name: "Jessica Lee", visits: 1, lastVisit: "2026-08-20", lastServiceId: "pedi", lastTechId: "tuan" },
];

export const staffById = (id: string) => STAFF.find((s) => s.id === id);
export const serviceById = (id: string) => SERVICES.find((s) => s.id === id);
export const techs = () => STAFF.filter((s) => s.role === "tech");
