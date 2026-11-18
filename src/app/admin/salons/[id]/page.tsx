import type { Metadata } from "next";
import SalonPage from "./SalonPage";

export const metadata: Metadata = { title: "Salon · Admin · PolishOS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SalonPage id={id} />;
}
