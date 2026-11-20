// Calendar search (design: search dropdown). One box finds clients, receipts (tickets) and staff.
// Typing digits = phone (matched on any part, last 4 shown), "#48213" = client number, "T-1042" = receipt number.
// Facts only, worked out on the device so it is fast and works offline with what this device has.

export type SearchMode = "text" | "phone" | "number" | "receipt";
export type SearchTab = "all" | "clients" | "receipts" | "staff";

export type SClient = { id: string; number?: number; name: string; phone: string | null; last_visit: string | null };
export type SReceipt = { id: string; number?: number; client: string; last4?: string; cents: number; at: string; status: string };
export type SStaff = { id: string; name: string; role: string; clockedIn: boolean };
export type SBooking = { clientId?: string; phone?: string; start: string };

export type Hit =
  | { kind: "client"; id: string; c: SClient; sameLast4: boolean; next: string | null }
  | { kind: "receipt"; id: string; r: SReceipt }
  | { kind: "staff"; id: string; s: SStaff };

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** What the person is typing: "#…" client number, "T-…" receipt, mostly digits = phone, else a name. */
export function searchMode(q: string): SearchMode {
  const t = q.trim();
  if (/^#\d*$/.test(t)) return "number";
  if (/^t-?\d*$/i.test(t)) return "receipt";
  if (t.length >= 2 && /^[\d\s()+\-.]+$/.test(t)) return "phone";
  return "text";
}

export function search(q: string, data: { clients: SClient[]; receipts: SReceipt[]; staff: SStaff[]; bookings: SBooking[]; now?: number }): Hit[] {
  const t = q.trim();
  if (!t) return [];
  const mode = searchMode(t), d = digits(t), ql = t.toLowerCase();
  const now = data.now ?? Date.now();

  const clients = data.clients.filter((c) =>
    mode === "number" ? !!d && String(c.number ?? "").startsWith(d)
      : mode === "phone" ? d.length >= 3 && digits(c.phone).includes(d)
        : mode === "text" ? c.name.toLowerCase().includes(ql) : false);
  // Same last 4 = another client in the results has the same last 4 digits (staff must check which one).
  const l4 = (c: SClient) => digits(c.phone).slice(-4);
  const seen = new Map<string, number>();
  clients.forEach((c) => { const k = l4(c); if (k) seen.set(k, (seen.get(k) ?? 0) + 1); });
  const nextFor = (c: SClient) => {
    const cd = digits(c.phone).slice(-10);
    const b = data.bookings.filter((x) => new Date(x.start).getTime() >= now - 30 * 60_000
      && ((x.clientId && x.clientId === c.id) || (!!cd && digits(x.phone).slice(-10) === cd)))
      .sort((a, b2) => a.start.localeCompare(b2.start))[0];
    return b?.start ?? null;
  };
  // Booked soonest first, then most recent visit, then name.
  const cHits: Hit[] = clients.map((c) => ({ kind: "client" as const, id: c.id, c, sameLast4: (seen.get(l4(c)) ?? 0) > 1, next: nextFor(c) }))
    .sort((a, b) => (a.next ? 0 : 1) - (b.next ? 0 : 1) || (a.next ?? "").localeCompare(b.next ?? "")
      || (b.c.last_visit ?? "").localeCompare(a.c.last_visit ?? "") || a.c.name.localeCompare(b.c.name));

  const receipts = data.receipts.filter((r) =>
    mode === "receipt" ? !!d && String(r.number ?? "").startsWith(d)
      : mode === "phone" ? d.length >= 3 && (r.last4 ?? "") !== "" && (r.last4!.includes(d) || d.endsWith(r.last4!))
        : mode === "text" ? r.client.toLowerCase().includes(ql) : false)
    .sort((a, b) => b.at.localeCompare(a.at));
  const rHits: Hit[] = receipts.map((r) => ({ kind: "receipt", id: r.id, r }));

  const sHits: Hit[] = mode !== "text" ? [] : data.staff.filter((s) => s.name.toLowerCase().includes(ql)).map((s) => ({ kind: "staff", id: s.id, s }));
  return [...cHits, ...rHits, ...sHits];
}

export const tabOf = (h: Hit): SearchTab => (h.kind === "client" ? "clients" : h.kind === "receipt" ? "receipts" : "staff");
export const countTabs = (hits: Hit[]): Record<SearchTab, number> => ({
  all: hits.length, clients: hits.filter((h) => h.kind === "client").length,
  receipts: hits.filter((h) => h.kind === "receipt").length, staff: hits.filter((h) => h.kind === "staff").length,
});
/** "(408) •••-4821" — the area code and last 4, the middle hidden. */
export function maskPhone(p: string | null): string {
  const d = digits(p).slice(-10);
  if (d.length < 4) return "";
  return d.length === 10 ? `(${d.slice(0, 3)}) •••-${d.slice(6)}` : `•••-${d.slice(-4)}`;
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
