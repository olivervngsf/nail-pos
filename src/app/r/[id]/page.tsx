import type { Metadata } from "next";
import DigitalReceipt from "./DigitalReceipt";

export const metadata: Metadata = { title: "Receipt · PolishOS", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DigitalReceipt id={id} />;
}
