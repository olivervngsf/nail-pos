// Edit services on a booking that's already made (Oliver, Nov 26): add / remove menu services from the booking
// details drawer. The booking keeps its start; its end follows the new total minutes (at least 15).
import type { Appt, ApptService } from "./appts";

export const totalMinutes = (s: ApptService[]) => s.reduce((a, x) => a + x.minutes, 0);
export const totalCents = (s: ApptService[]) => s.reduce((a, x) => a + x.cents, 0);

/** The booking with these services: same start, end moved to match. */
export function withServices(a: Appt, services: ApptService[]): Appt {
  const mins = Math.max(15, totalMinutes(services));
  return { ...a, services, end: new Date(new Date(a.start).getTime() + mins * 60_000).toISOString(), updatedAt: "" };
}

/** Services can be changed only before the client is in the chair (after that the ticket holds them). */
export const canEditServices = (a: Pick<Appt, "status" | "ticketId">) => (a.status === "booked" || a.status === "confirmed") && !a.ticketId;
