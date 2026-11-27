"use client";
// What the salon offers for free (wine, tea + coffee, Wi-Fi, …), as quiet chips with an icon + words.
// Shown on the booking page header and the client's digital receipt. Nothing picked = nothing shown.
import { useTranslations } from "next-intl";
import { amenityIcon, cleanAmenities } from "@/lib/booking/amenities";

export function Amenities({ list, className = "" }: { list: unknown; className?: string }) {
  const t = useTranslations("amenities");
  const keys = cleanAmenities(list);
  if (!keys.length) return null;
  return (
    <ul className={`amen ${className}`} aria-label={t("label")} data-testid="amenities">
      {keys.map((k) => <li key={k} className="amen-i"><span aria-hidden="true">{amenityIcon(k)}</span>{t(k)}</li>)}
    </ul>
  );
}
