import type { Metadata } from "next";
import TicketScreen from "./TicketScreen";

export const metadata: Metadata = { title: "Ticket · Nail POS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketScreen id={id} />;
}
