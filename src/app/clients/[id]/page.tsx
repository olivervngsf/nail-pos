import type { Metadata } from "next";
import ClientHistory from "./ClientHistory";

export const metadata: Metadata = { title: "Client · PolishOS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientHistory id={id} />;
}
