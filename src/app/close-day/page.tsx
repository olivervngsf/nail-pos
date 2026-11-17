import type { Metadata } from "next";
import { Suspense } from "react";
import CloseDay from "./CloseDay";

export const metadata: Metadata = { title: "Close day · PolishOS" };

export default function Page() {
  return <Suspense fallback={<div className="app" aria-busy="true" />}><CloseDay /></Suspense>;
}
