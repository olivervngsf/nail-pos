import type { Metadata } from "next";
import ClientPay from "./ClientPay";

export const metadata: Metadata = { title: "Pay · PolishOS", robots: { index: false } };

// /pay/preview-receipt and /pay/preview-quick: what each layout looks like, with sample data (Settings → Payments → Preview).
// No payment is taken; a real pay link is always a random id.
const PREVIEW = {
  salon: "Lotus Nails", number: 1290, amountCents: 7000, tipCents: null, status: "pending" as const,
  lines: [{ name: "Regular manicure", tech: "Kim", cents: 2200 }, { name: "Deluxe spa pedicure", tech: "Vy", cents: 4800 }],
  techs: [{ name: "Kim", cents: 2200 }, { name: "Vy", cents: 4800 }],
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const demo = id === "preview-quick" ? { ...PREVIEW, layout: "quick" as const } : id === "preview-receipt" ? { ...PREVIEW, layout: "receipt" as const } : undefined;
  return <ClientPay id={id} demo={demo} />;
}
