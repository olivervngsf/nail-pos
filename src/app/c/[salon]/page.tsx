import type { Metadata } from "next";
import ClientPage from "./ClientPage";

export const metadata: Metadata = { title: "My points · PolishOS", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ salon: string }> }) {
  const { salon } = await params;
  return <ClientPage slug={decodeURIComponent(salon).toLowerCase()} />;
}
