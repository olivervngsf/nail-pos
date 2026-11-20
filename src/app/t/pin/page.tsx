import type { Metadata } from "next";
import { Suspense } from "react";
import PinLinkPage from "./PinLinkPage";

export const metadata: Metadata = { title: "Make your PIN · PolishOS" };

export default function Page() { return <Suspense fallback={<div className="phone" aria-busy="true" />}><PinLinkPage /></Suspense>; }
