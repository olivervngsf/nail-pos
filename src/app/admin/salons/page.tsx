import type { Metadata } from "next";
import { Suspense } from "react";
import SalonsPage from "./SalonsPage";

export const metadata: Metadata = { title: "Salons · Admin · PolishOS" };

export default function Page() {
  return <Suspense fallback={<div className="app" aria-busy="true" />}><SalonsPage /></Suspense>;
}
