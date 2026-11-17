import type { Metadata } from "next";
import ClientPay from "./ClientPay";

export const metadata: Metadata = { title: "Pay · PolishOS", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientPay id={id} />;
}
