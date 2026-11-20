import type { Metadata } from "next";
import TicketScreen from "./TicketScreen";

export const metadata: Metadata = { title: "Ticket · PolishOS" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pay?: string }> }) {
  const { id } = await params;
  // ?pay=1 = "Charge" tapped on the Checkout list: open straight on How to pay.
  return <TicketScreen id={id} pay={(await searchParams).pay !== undefined} />;
}
