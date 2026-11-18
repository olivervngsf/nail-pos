import type { Metadata } from "next";
import ManagePage from "./ManagePage";

// Client change / cancel link (polishosapp.com/b/<token>). Private link: keep it out of search engines.
export const metadata: Metadata = { title: "Your booking · PolishOS", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ManagePage token={decodeURIComponent(token)} />;
}
