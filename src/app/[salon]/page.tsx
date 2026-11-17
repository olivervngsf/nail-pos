import type { Metadata } from "next";
import { Suspense } from "react";
import BookPage from "./BookPage";

export const metadata: Metadata = { title: "Book a visit · PolishOS" };

export default async function Page({ params }: { params: Promise<{ salon: string }> }) {
  const { salon } = await params;
  return <Suspense fallback={<div className="bw" aria-busy="true" />}><BookPage slug={decodeURIComponent(salon).toLowerCase()} /></Suspense>;
}
