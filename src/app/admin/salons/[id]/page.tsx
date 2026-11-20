import type { Metadata } from "next";
import { Suspense } from "react";
import SalonPage from "./SalonPage";

export const metadata: Metadata = { title: "Salon · Admin · PolishOS" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<div className="app" aria-busy="true" />}><SalonPage id={id} /></Suspense>;
}
