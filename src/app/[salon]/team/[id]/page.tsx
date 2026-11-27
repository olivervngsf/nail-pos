import type { Metadata } from "next";
import TeamPage from "./TeamPage";

export const metadata: Metadata = { title: "Our team · PolishOS" };

export default async function Page({ params }: { params: Promise<{ salon: string; id: string }> }) {
  const { salon, id } = await params;
  return <TeamPage slug={decodeURIComponent(salon).toLowerCase()} id={id} />;
}
