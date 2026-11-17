// Salon address (typed as one line in setup) → Stripe Terminal location address. Pure; tested.
export function parseAddress(a: string | null | undefined, state: string) {
  const parts = (a ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const tail = last.match(/^([A-Za-z]{2})?\s*(\d{5})(-\d{4})?$/) || /^[A-Za-z]{2}$/.test(last) ? parts.pop() : undefined;
  return {
    line1: parts[0] || "Salon",
    city: parts[1] || "",
    state: (tail?.match(/[A-Za-z]{2}/)?.[0] ?? state).toUpperCase(),
    postal_code: tail?.match(/\d{5}/)?.[0] ?? "",
    country: "US",
  };
}
/** Enough for Stripe to accept a reader location (street, city, ZIP). */
export const addressOk = (x: ReturnType<typeof parseAddress>) => x.line1 !== "Salon" && !!x.city && !!x.postal_code;
