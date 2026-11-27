// Amenities = free comforts a salon offers (wine, tea + coffee, Wi-Fi, …). Owner ticks them in Settings → Booking page;
// clients see them on the booking page and the digital receipt. Keys match the DB list in booking_settings_save
// (migration 20270130000001_salon_amenities); words in i18n `amenities.<key>` (EN/VI).
export const AMENITIES = [
  { key: "wine", icon: "🍷" },
  { key: "coffee", icon: "☕" },
  { key: "water", icon: "💧" },
  { key: "wifi", icon: "📶" },
  { key: "massage_chairs", icon: "💺" },
  { key: "kids", icon: "🧒" },
  { key: "parking", icon: "🅿️" },
  { key: "wheelchair", icon: "♿" },
  { key: "walk_ins", icon: "🚶" },
  { key: "vietnamese", icon: "🗣️" },
  { key: "spanish", icon: "🗣️" },
] as const;

export type AmenityKey = (typeof AMENITIES)[number]["key"];
const KEYS = AMENITIES.map((a) => a.key) as readonly string[];

/** Known keys only, no repeats, in the list's order (same rule as the database). */
export function cleanAmenities(x: unknown): AmenityKey[] {
  if (!Array.isArray(x)) return [];
  const set = new Set(x.filter((k): k is string => typeof k === "string" && KEYS.includes(k)));
  return AMENITIES.map((a) => a.key).filter((k) => set.has(k));
}

/** Turn one on or off, keeping the list's order. */
export function toggleAmenity(list: readonly AmenityKey[], key: AmenityKey): AmenityKey[] {
  return cleanAmenities(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
}

export const amenityIcon = (key: AmenityKey) => AMENITIES.find((a) => a.key === key)?.icon ?? "";

/** Sample salon (test copy) starts with these, on the booking page and in Settings alike. */
export const DEMO_AMENITIES: AmenityKey[] = ["wine", "coffee", "wifi", "massage_chairs"];
