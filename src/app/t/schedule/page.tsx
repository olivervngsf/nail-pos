import type { Metadata } from "next";
import { Suspense } from "react";
import TechSchedule from "./TechSchedule";

export const metadata: Metadata = { title: "My schedule · PolishOS" };

export default function Page() { return <Suspense><TechSchedule /></Suspense>; }
