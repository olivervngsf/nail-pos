import type { Metadata } from "next";
import { Suspense } from "react";
import CalendarPage from "./CalendarPage";

export const metadata: Metadata = { title: "Calendar · PolishOS" };

export default function Page() {
  return <Suspense fallback={<div className="app" aria-busy="true" />}><CalendarPage /></Suspense>;
}
